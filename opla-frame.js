const poseKeys = [
  'head', 'hat', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg',
  'bob', 'lean', 'leftLift', 'rightLift', 'footDirection',
];

export function readFrame(frame) {
  if (!frame || typeof frame !== 'object') return undefined;
  return Object.fromEntries(poseKeys.filter((key) => Number.isFinite(frame[key]))
    .map((key) => [key, Math.max(-360, Math.min(360, frame[key]))]));
}
