import { cycles } from './motion.js';

const centisecondsPerSecond = 100;
const maximumNaturalLoop = 10 * centisecondsPerSecond;
const mixedCycleLoopSeconds = 6;

function greatestCommonDivisor(first, second) {
  while (second) [first, second] = [second, first % second];
  return first;
}

export function posterLoopDuration(placements) {
  const periods = (placements ?? [])
    .filter(({ mode, cycle }) => mode === 'animate' && Object.hasOwn(cycles, cycle))
    .map(({ cycle }) => Math.round(cycles[cycle].duration * centisecondsPerSecond));
  if (!periods.length) return 0;

  let duration = periods[0];
  for (const period of periods.slice(1)) {
    duration = duration / greatestCommonDivisor(duration, period) * period;
    if (duration > maximumNaturalLoop) return mixedCycleLoopSeconds;
  }
  return duration / centisecondsPerSecond;
}

export function posterLoopFrameTime(placementOrCycle, seconds, duration) {
  const cycle = typeof placementOrCycle === 'string' ? placementOrCycle : placementOrCycle?.cycle;
  if (!Object.hasOwn(cycles, cycle)) return 0;
  if (!(duration > 0) || !Number.isFinite(duration)) return Number.isFinite(seconds) ? seconds : 0;

  const period = cycles[cycle].duration;
  const repetitions = Math.max(1, Math.round(duration / period));
  const time = Number.isFinite(seconds) ? seconds : 0;
  const phase = ((time % duration) + duration) % duration / duration;
  return phase * repetitions * period;
}
