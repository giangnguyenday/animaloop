const visionBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const model = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const frameInterval = 1000 / 15;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const interpolate = (previous, next) => previous + (next - previous) * .36;
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b, aspect) => Math.hypot((b.x - a.x) * aspect, b.y - a.y);
const radians = (degrees) => degrees * Math.PI / 180;

function rotate(x, y, degrees) {
  const cosine = Math.cos(radians(degrees));
  const sine = Math.sin(radians(degrees));
  return { x: x * cosine - y * sine, y: x * sine + y * cosine };
}

function localOffset(from, to, aspect, lean, units) {
  if (!from || !to) return null;
  return rotate((to.x - from.x) * aspect * units, (to.y - from.y) * units, -lean);
}

function handOffset(wrist, shoulder, arm, side, aspect, lean, units) {
  const target = localOffset(shoulder, wrist, aspect, lean, units);
  if (!target) return { x: 0, y: 0 };
  // Shift the letter's bowl toward the wrist after rotating around its shoulder.
  const rest = rotate(side * 108, 43, arm);
  return { x: clamp(target.x - rest.x, -105, 105), y: clamp(target.y - rest.y, -95, 95) };
}

async function createLandmarker() {
  const { FilesetResolver, PoseLandmarker } = await import(`${visionBase}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${visionBase}/wasm`);
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: model, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

function angle(from, to, aspect, rest, limit) {
  if (!from || !to || distance(from, to, aspect) < .015) return 0;
  const degrees = Math.atan2(to.y - from.y, (to.x - from.x) * aspect) * 180 / Math.PI;
  return clamp(((degrees - rest + 540) % 360) - 180, -limit, limit);
}

function getPose(landmarks, aspect) {
  if (!landmarks) return null;
  const point = (index) => {
    const landmark = landmarks[index];
    if (!landmark || (landmark.visibility ?? 1) < .45) return null;
    return { x: 1 - landmark.x, y: landmark.y };
  };
  const leftShoulder = point(11);
  const rightShoulder = point(12);
  if (!leftShoulder || !rightShoulder) return null;

  const shoulders = midpoint(leftShoulder, rightShoulder);
  const leftHip = point(23);
  const rightHip = point(24);
  const hips = leftHip && rightHip ? midpoint(leftHip, rightHip) : null;
  const leftAnkle = point(27);
  const rightAnkle = point(28);
  const leftWrist = point(15);
  const rightWrist = point(16);
  const leftEye = point(2);
  const rightEye = point(5);
  const face = point(0) ?? (leftEye && rightEye ? midpoint(leftEye, rightEye) : null);
  const lean = angle(hips, shoulders, aspect, -90, 25);
  const head = angle(leftEye, rightEye, aspect, 0, 32);
  const leftArm = angle(leftShoulder, leftWrist ?? point(13), aspect, 157, 112) - lean;
  const rightArm = angle(rightShoulder, rightWrist ?? point(14), aspect, 23, 112) - lean;
  const shoulderWidth = distance(leftShoulder, rightShoulder, aspect);
  const torsoLength = hips ? distance(hips, shoulders, aspect) : 0;
  const units = 132 / Math.max(.08, shoulderWidth, torsoLength * .8);
  const headOffset = localOffset(shoulders, face, aspect, lean, units);
  const leftHand = handOffset(leftWrist, leftShoulder, leftArm, -1, aspect, lean, units);
  const rightHand = handOffset(rightWrist, rightShoulder, rightArm, 1, aspect, lean, units);
  const limbLift = (ankle, opposite) => ankle && opposite ? clamp((opposite.y - ankle.y) * 380, 0, 76) : 0;

  return {
    pose: {
      leftArm,
      rightArm,
      leftArmX: leftHand.x,
      leftArmY: leftHand.y,
      rightArmX: rightHand.x,
      rightArmY: rightHand.y,
      leftLeg: angle(leftHip, leftAnkle ?? point(25), aspect, 90, 52) - lean,
      rightLeg: angle(rightHip, rightAnkle ?? point(26), aspect, 90, 52) - lean,
      leftLift: limbLift(leftAnkle, rightAnkle),
      rightLift: limbLift(rightAnkle, leftAnkle),
      lean,
      head: head - lean,
      hat: head * .2,
    },
    center: shoulders,
    headOffset,
    shoulderWidth,
    torsoLength,
  };
}

const cameraErrors = {
  NotAllowedError: 'Camera access was denied. Allow camera access in your browser and try again.',
  NotFoundError: 'No camera was found.',
  NotReadableError: 'The camera is unavailable. Close any other app using it and try again.',
  SecurityError: 'The browser blocked camera access.',
};

export function createCamera({ video, onPose, onStatus }) {
  let active = null;
  let status;

  function report(message, nextStatus) {
    if (nextStatus === status) return;
    status = nextStatus;
    onStatus(message, nextStatus);
  }

  function release() {
    if (!active) return;
    const { stream, landmarker, frame } = active;
    active = null;
    cancelAnimationFrame(frame);
    if (video.srcObject === stream) {
      video.pause();
      video.srcObject = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    landmarker?.close();
    onPose(null);
  }

  function stop() {
    release();
    report('Camera is off.', 'idle');
  }

  async function start() {
    if (active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      report('Camera access requires a supported browser on localhost or HTTPS.', 'error');
      return;
    }

    const session = {};
    active = session;
    report('Starting camera and loading pose tracking…', 'loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (active !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        if (active !== session) return;
        release();
        report('The camera disconnected. Start it again to resume.', 'error');
      }, { once: true }));
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (active !== session) return;

      let landmarker;
      try {
        landmarker = await createLandmarker();
      } catch (error) {
        if (active === session) {
          release();
          report('Could not load pose tracking. Check your connection and try again.', 'error');
          console.warn('Opla pose tracker failed to load.', error);
        }
        return;
      }
      if (active !== session) {
        landmarker.close();
        return;
      }
      session.landmarker = landmarker;
      report('Step into frame so Opla can follow you.', 'searching');

      let previousFrame = -1;
      let previousInference = -Infinity;
      let lastSeen = -Infinity;
      let baseline;
      let smoothed;
      function tick(now) {
        if (video.readyState >= 2 && now - previousInference >= frameInterval && video.currentTime !== previousFrame) {
          previousInference = now;
          previousFrame = video.currentTime;
          try {
            const result = landmarker.detectForVideo(video, now);
            const sample = getPose(result.landmarks[0], video.videoWidth / video.videoHeight);
            if (sample) {
              lastSeen = now;
              baseline ??= sample;
              baseline.headOffset ??= sample.headOffset;
              const shoulderRatio = sample.shoulderWidth / Math.max(.045, baseline.shoulderWidth);
              const torsoRatio = baseline.torsoLength > .045 && sample.torsoLength > .045
                ? sample.torsoLength / baseline.torsoLength : shoulderRatio;
              const headX = sample.headOffset && baseline.headOffset ? sample.headOffset.x - baseline.headOffset.x : 0;
              const headY = sample.headOffset && baseline.headOffset ? sample.headOffset.y - baseline.headOffset.y : 0;
              const next = {
                pose: { ...sample.pose, headX: clamp(headX, -55, 55), headY: clamp(headY, -58, 48) },
                x: clamp((sample.center.x - baseline.center.x) * .8, -.32, .32),
                y: clamp((sample.center.y - baseline.center.y) * .65, -.25, .25),
                scale: clamp(shoulderRatio * .35 + torsoRatio * .65, .65, 1.65),
              };
              if (smoothed) {
                next.x = interpolate(smoothed.x, next.x);
                next.y = interpolate(smoothed.y, next.y);
                next.scale = interpolate(smoothed.scale, next.scale);
                for (const part of Object.keys(next.pose)) {
                  next.pose[part] = interpolate(smoothed.pose[part], next.pose[part]);
                }
              }
              smoothed = next;
              onPose(next);
              report('Tracking your movement.', 'tracking');
            } else if (smoothed && now - lastSeen > 650) {
              smoothed = undefined;
              baseline = undefined;
              onPose(null);
              report('Step into frame so Opla can follow you.', 'searching');
            }
          } catch (error) {
            release();
            report('Pose tracking stopped. Restart the camera to try again.', 'error');
            console.warn('Opla pose tracker stopped.', error);
            return;
          }
        }
        if (active === session) session.frame = requestAnimationFrame(tick);
      }
      session.frame = requestAnimationFrame(tick);
    } catch (error) {
      if (active !== session) return;
      release();
      report(cameraErrors[error.name] ?? 'Could not start the camera. Try again.', 'error');
    }
  }

  return { start, stop };
}
