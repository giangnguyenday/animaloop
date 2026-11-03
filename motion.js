export const poses = {
  neutral: {},
  wave: { rightArm: -105, leftArm: -10, head: 8, hat: 6, lean: -4 },
  stride: { leftLeg: 26, rightLeg: -29, leftArm: -22, rightArm: 24, rightLift: 18, lean: 8, footDirection: 1 },
  lean: { leftArm: 15, rightArm: -18, leftLeg: 12, rightLeg: -11, head: -12, hat: 6, lean: 13 },
  jump: { leftArm: 54, rightArm: -55, leftLeg: 24, rightLeg: -25, leftLift: 22, rightLift: 42, bob: -48, head: 7 },
  salute: { rightArm: -64, leftArm: -34, leftLeg: -8, rightLeg: 11, head: -8, hat: -13 },
  kick: { rightLeg: -61, rightLift: 23, leftLeg: 10, rightArm: 36, leftArm: 52, lean: -12, footDirection: 1 },
  dance: { leftArm: 116, rightArm: 32, leftLeg: 40, rightLeg: -18, leftLift: 33, lean: -15, head: 19, hat: 15 },
  crouch: { leftLeg: 42, rightLeg: -42, leftArm: -32, rightArm: 32, bob: 55, head: 12 },
  cheer: { leftArm: 83, rightArm: -83, leftLeg: 18, rightLeg: -18, bob: -18, hat: 8 },
};

export const poseLabels = {
  neutral: 'Neutral', wave: 'Wave', stride: 'Stride', lean: 'Lean', jump: 'Jump',
  salute: 'Salute', kick: 'Kick', dance: 'Dance', crouch: 'Crouch', cheer: 'Cheer',
};

// Alternating stance/swing with body counter-motion, adapted to Opla's rigid letterforms.
export const cycles = {
  stroll: { duration: 1.2, stride: 18, arms: 14, lift: 33, bob: 14, lean: 4, stance: .60, travel: 135, tilt: 3 },
  march: { duration: .84, stride: 31, arms: 28, lift: 77, bob: 13, lean: 1, stance: .56, travel: 175, tilt: 4 },
  tiptoe: { duration: 1.52, stride: 13, arms: 8, lift: 31, bob: 8, lean: 14, stance: .70, travel: 91, tilt: 2 },
  bounce: { duration: .70, stride: 27, arms: 22, lift: 50, bob: 39, lean: 9, stance: .49, travel: 205, tilt: 9 },
  sneak: { duration: 1.74, stride: 26, arms: 15, lift: 62, bob: 17, lean: 18, stance: .78, travel: 73, tilt: 6, crouch: 32, liftPower: 1.2 },
  skip: { duration: .90, stride: 34, arms: 30, lift: 68, bob: 62, lean: 3, stance: .48, travel: 223, tilt: 12, hop: 21, split: .38 },
  shuffle: { duration: .60, stride: 10, arms: 7, lift: 12, bob: 6, lean: -3, stance: .68, travel: 83, tilt: 5, sway: 4 },
  strut: { duration: 1.05, stride: 30, arms: 34, lift: 40, bob: 21, lean: -9, stance: .60, travel: 162, tilt: 12, sway: 7 },
  jog: { duration: .56, stride: 39, arms: 36, lift: 74, bob: 31, lean: 12, stance: .44, travel: 330, tilt: 5, liftPower: 1.4 },
  waddle: { duration: 1.24, stride: 16, arms: 12, lift: 34, bob: 13, lean: 0, stance: .66, travel: 102, tilt: 13, sway: 15 },
};

export const cycleLabels = {
  stroll: 'Stroll', march: 'March', tiptoe: 'Tiptoe', bounce: 'Bounce', sneak: 'Sneak',
  skip: 'Skip', shuffle: 'Shuffle', strut: 'Strut', jog: 'Jog', waddle: 'Waddle',
};

export const walkDirectionLabels = {
  right: 'Right', left: 'Left', up: 'Up', down: 'Down', angled: 'Angled',
  rotate: 'Rotate in place', radial: 'Radial', orbit: 'Orbit',
};

export const walkMotionLabels = {
  'one-way': 'One way',
  oscillate: 'Back and forth',
};

const wrap = (number, period) => ((number % period) + period) % period;
const tau = Math.PI * 2;
const radians = Math.PI / 180;
const cardinalAngles = { right: 0, left: 180, up: -90, down: 90 };

function step(phase, cycle) {
  if (phase < cycle.stance) {
    const progress = phase / cycle.stance;
    return { angle: -cycle.stride * Math.cos(Math.PI * progress), lift: 0 };
  }
  const progress = (phase - cycle.stance) / (1 - cycle.stance);
  return {
    angle: cycle.stride * Math.cos(Math.PI * progress),
    lift: cycle.lift * Math.sin(Math.PI * progress) ** (cycle.liftPower ?? 2),
  };
}

function edgeDistance(x, y, dx, dy, width, height, padX, padY = padX) {
  const edgeX = dx > 0 ? width + padX : -padX;
  const edgeY = dy > 0 ? height + padY : -padY;
  const horizontal = Math.abs(dx) > 1e-8 ? (edgeX - x) / dx : Infinity;
  const vertical = Math.abs(dy) > 1e-8 ? (edgeY - y) / dy : Infinity;
  return Math.min(horizontal, vertical);
}

function pingPong(progress, extent) {
  if (extent <= 0) return { distance: 0, returning: false };
  const phase = wrap(progress, extent * 2);
  const returning = phase >= extent;
  return { distance: returning ? extent * 2 - phase : phase, returning };
}

function walkPath(seconds, speed, width, scale, travel, anchor, options) {
  const {
    direction = 'right', angle = 0, height = width, anchorY = height / 2, index = 0, count = 1,
    motion = 'one-way',
  } = options;
  const oscillating = motion === 'oscillate';
  if (direction === 'rotate') {
    const sweep = seconds * speed / scale * .42;
    const rotation = oscillating ? pingPong(sweep, 180).distance : wrap(sweep, 360);
    return { x: 0, y: 0, rotation, flip: false };
  }

  const spread = direction === 'radial' || direction === 'orbit' ? index / Math.max(count, 1) * 360 : 0;
  const heading = ((cardinalAngles[direction] ?? angle) + spread) * radians;
  if (direction === 'orbit' && travel) {
    const radius = Math.min(width, height) * .18;
    const sweep = seconds * speed / radius;
    const { distance, returning } = oscillating ? pingPong(sweep, Math.PI) : { distance: sweep, returning: false };
    const phase = heading + distance;
    const horizontalVelocity = Math.sin(phase) * (returning ? 1 : -1);
    // Position the orbit so it passes through the character’s placement at time zero.
    return {
      x: (Math.cos(phase) - Math.cos(heading)) * radius,
      y: (Math.sin(phase) - Math.sin(heading)) * radius,
      rotation: 0,
      flip: horizontalVelocity < 0,
    };
  }

  const dx = Math.abs(Math.cos(heading)) > 1e-8 ? Math.cos(heading) : 0;
  const dy = Math.abs(Math.sin(heading)) > 1e-8 ? Math.sin(heading) : 0;
  const flip = dx < 0;
  if (!travel) return { x: 0, y: 0, rotation: 0, flip };

  // Keep the return visible while allowing the line to pass through the placed anchor.
  const padX = oscillating ? -Math.max(0, Math.min(265 * scale, width * .25, anchor, width - anchor)) : 470 * scale;
  const padY = oscillating ? -Math.max(0, Math.min(385 * scale, height * .25, anchorY, height - anchorY)) : padX;
  const exit = edgeDistance(anchor, anchorY, dx, dy, width, height, padX, padY);
  const entry = direction === 'radial' ? 0 : edgeDistance(anchor, anchorY, -dx, -dy, width, height, padX, padY);
  const progress = seconds * speed + entry;
  if (oscillating) {
    const { distance, returning } = pingPong(progress, exit + entry);
    return { x: (distance - entry) * dx, y: (distance - entry) * dy, rotation: 0, flip: returning ? dx > 0 : flip };
  }
  const distance = wrap(progress, exit + entry) - entry;
  return { x: distance * dx, y: distance * dy, rotation: 0, flip };
}

export function walkAt(seconds, cycleName, offset, width, characterScale, travel, anchor = width / 2, options = {}) {
  const cycle = cycles[cycleName];
  const phase = wrap(seconds / cycle.duration + offset, 1);
  const left = step(phase, cycle);
  const right = step(wrap(phase + (cycle.split ?? .5), 1), cycle);
  const wave = Math.cos(phase * tau);
  return {
    ...walkPath(seconds, cycle.travel * characterScale, width, characterScale, travel, anchor, options),
    pose: {
      footDirection: 1,
      leftLeg: left.angle, rightLeg: right.angle,
      leftLift: left.lift, rightLift: right.lift,
      leftArm: wave * cycle.arms, rightArm: wave * cycle.arms,
      lean: cycle.lean + wave * (cycle.sway ?? 1.8),
      head: -cycle.lean * .38 - wave * cycle.tilt * .44,
      hat: Math.cos((phase - .13) * tau) * cycle.tilt,
      bob: (cycle.crouch ?? 0) - cycle.bob * (.5 - .5 * Math.cos(2 * phase * tau)) - (cycle.hop ?? 0) * (1 - wave),
    },
  };
}
