export const maxOplaRecordingSeconds = 30;
export const oplaRecordingFramesPerSecond = 20;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A recording owns immutable frame blobs, separate from the editable scene/history.
// Timestamps are real elapsed seconds so physics, camera, and live edits replay as seen.
export function createOplaTimeline({
  fps = oplaRecordingFramesPerSecond,
  maxDuration = maxOplaRecordingSeconds,
  maxBytes = 96 * 1024 * 1024,
} = {}) {
  fps = Number.isFinite(fps) ? clamp(fps, 1, 30) : oplaRecordingFramesPerSecond;
  maxDuration = Number.isFinite(maxDuration) ? clamp(maxDuration, .1, maxOplaRecordingSeconds) : maxOplaRecordingSeconds;
  maxBytes = Number.isFinite(maxBytes) ? Math.max(1, Math.floor(maxBytes)) : 96 * 1024 * 1024;
  const maxFrames = Math.ceil(maxDuration * fps);
  let frames = [];
  let recording = false;
  let startedAt = 0;
  let nextFrame = 0;
  let duration = 0;
  let width = 0;
  let height = 0;
  let bytes = 0;
  let stopReason = '';

  const status = () => ({ recording, duration, frameCount: frames.length, bytes, width, height, stopReason });
  const elapsedAt = (now) => Number.isFinite(now) ? clamp((now - startedAt) / 1000, 0, maxDuration) : duration;

  function clear() {
    frames = [];
    recording = false;
    nextFrame = duration = width = height = bytes = 0;
    stopReason = '';
    return status();
  }

  function start(now, dimensions = {}) {
    if (!Number.isFinite(now)) throw new TypeError('A recording needs a valid start time.');
    clear();
    width = Number.isFinite(dimensions.width) ? Math.max(1, Math.round(dimensions.width)) : 0;
    height = Number.isFinite(dimensions.height) ? Math.max(1, Math.round(dimensions.height)) : 0;
    startedAt = now;
    recording = true;
    return status();
  }

  function stop(now, reason = 'stopped') {
    if (!recording) return status();
    duration = frames.length ? Math.min(maxDuration, Math.max(1 / fps, elapsedAt(now))) : 0;
    recording = false;
    stopReason = reason;
    return status();
  }

  function sample(now, capture) {
    if (!recording) return { ...status(), captured: false };
    const elapsed = elapsedAt(now);
    duration = elapsed;
    if (elapsed >= maxDuration) {
      stop(now, 'duration');
      return { ...status(), captured: false };
    }
    if (frames.length >= maxFrames) return { ...status(), captured: false };
    if (elapsed + 1e-8 < nextFrame / fps) return { ...status(), captured: false };
    let frame;
    try {
      frame = capture();
      if (!frame || !(frame.svg instanceof Blob) || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)) {
        throw new TypeError('A recording frame needs an SVG blob and artboard dimensions.');
      }
    } catch (error) {
      stop(now, 'error');
      throw error;
    }
    const frameWidth = Math.max(1, Math.round(frame.width));
    const frameHeight = Math.max(1, Math.round(frame.height));
    if ((width && width !== frameWidth) || (height && height !== frameHeight)) {
      stop(now, 'size');
      return { ...status(), captured: false };
    }
    if (bytes + frame.svg.size > maxBytes) {
      stop(now, 'memory');
      return { ...status(), captured: false };
    }
    width = frameWidth;
    height = frameHeight;
    frames.push(Object.freeze({ time: elapsed, svg: frame.svg, width, height }));
    bytes += frame.svg.size;
    // Skip missed sample slots instead of adding duplicate frames after a slow paint.
    nextFrame = Math.floor(elapsed * fps + 1e-7) + 1;
    return { ...status(), captured: true };
  }

  function frameAt(seconds) {
    if (!frames.length) return undefined;
    const position = Number.isFinite(seconds) ? clamp(seconds, 0, duration) : 0;
    let first = 0;
    let last = frames.length - 1;
    while (first < last) {
      const middle = Math.ceil((first + last) / 2);
      if (frames[middle].time <= position) first = middle;
      else last = middle - 1;
    }
    return frames[first];
  }

  return { start, sample, stop, clear, frameAt, get status() { return status(); } };
}

// Forward repeats the recorded range. Ping-pong reverses it for a closed loop.
// Pass outputDuration when a longer ping-pong cycle is fitted into a shorter export.
export function timelineSourceTime(seconds, duration, mode = 'forward', outputDuration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const period = Number.isFinite(outputDuration) && outputDuration > 0
    ? outputDuration : duration * (mode === 'ping-pong' ? 2 : 1);
  const time = Number.isFinite(seconds) ? seconds : 0;
  const phase = ((time % period) + period) % period / period;
  return mode === 'ping-pong' ? duration * (1 - Math.abs(phase * 2 - 1)) : phase * duration;
}
