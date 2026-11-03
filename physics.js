import { RIG_HEIGHT, RIG_WIDTH } from './rig.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toRadians = Math.PI / 180;

function bodyAt(point, scale, awake) {
  return { ...point, scale, angle: 0, vx: 0, vy: 0, spin: 0, awake };
}

function bounds(body, id, artBounds) {
  const measured = artBounds?.(body, id);
  if (measured && [measured.left, measured.right, measured.top, measured.bottom].every(Number.isFinite)
    && measured.right > measured.left && measured.bottom > measured.top) return measured;

  const angle = body.angle * toRadians;
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  const x = (RIG_WIDTH * cosine + RIG_HEIGHT * sine) * body.scale * .5;
  const y = (RIG_HEIGHT * cosine + RIG_WIDTH * sine) * body.scale * .5;
  return { left: -x, right: x, top: -y, bottom: y };
}

function stageLimits(extent, width, height) {
  const centerX = (width - extent.left - extent.right) / 2;
  const bottom = height - extent.bottom;
  return {
    left: Math.min(centerX, -extent.left),
    right: Math.max(centerX, width - extent.right),
    top: Math.min(bottom, -extent.top),
    bottom,
  };
}

function resolveContact(a, b, held, bounce) {
  const dx = b.body.x + (b.extent.left + b.extent.right) / 2 - a.body.x - (a.extent.left + a.extent.right) / 2;
  const dy = b.body.y + (b.extent.top + b.extent.bottom) / 2 - a.body.y - (a.extent.top + a.extent.bottom) / 2;
  const overlapX = (a.extent.right - a.extent.left + b.extent.right - b.extent.left) * .36 - Math.abs(dx);
  const overlapY = (a.extent.bottom - a.extent.top + b.extent.bottom - b.extent.top) * .46 - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return;

  const alongX = overlapX < overlapY;
  const position = alongX ? 'x' : 'y';
  const velocity = alongX ? 'vx' : 'vy';
  const direction = Math.sign(alongX ? dx : dy) || 1;
  const overlap = alongX ? overlapX : overlapY;
  const aWeight = a.body === held ? 0 : 1 / (a.body.scale ** 2);
  const bWeight = b.body === held ? 0 : 1 / (b.body.scale ** 2);
  const weights = aWeight + bWeight;
  a.body[position] -= direction * overlap * aWeight / weights;
  b.body[position] += direction * overlap * bWeight / weights;

  const closingSpeed = (a.body[velocity] - b.body[velocity]) * direction;
  if (closingSpeed <= 0) return;
  const restitution = closingSpeed > 100 ? bounce * .6 : 0;
  const impulse = closingSpeed * (1 + restitution) * direction / weights;
  a.body[velocity] -= impulse * aWeight;
  b.body[velocity] += impulse * bWeight;
}

function updatePuppet(body, dt, enabled) {
  if (!enabled) {
    delete body.puppetPose;
    return;
  }
  const angle = body.angle * toRadians;
  const localX = body.vx * Math.cos(angle) + body.vy * Math.sin(angle);
  const localY = body.vy * Math.cos(angle) - body.vx * Math.sin(angle);
  const sideways = clamp(localX * .043, -46, 46);
  const vertical = clamp(localY * .037, -40, 46);
  const spin = clamp(body.spin * .05, -20, 20);
  const target = {
    head: -sideways * .32 - spin,
    headX: -sideways * .42,
    headY: -vertical * .3,
    hat: -sideways * .24 + spin * .3,
    leftArm: -sideways * .7 + vertical * 1.15 + spin,
    rightArm: -sideways * .88 - vertical * 1.15 + spin * .75,
    leftLeg: sideways * .67 + vertical * .35 - spin * .42,
    rightLeg: sideways * .91 - vertical * .48 - spin * .58,
  };
  const pose = body.puppetPose ??= {};
  for (const [key, value] of Object.entries(target)) {
    const previous = pose[key] ?? 0;
    const next = previous + (value - previous) * (1 - Math.exp(-dt * 12));
    pose[key] = Math.abs(next) > .025 ? next : 0;
  }
}

export function createPhysics() {
  const bodies = new Map();
  let held;

  function reset(characters, width, height) {
    held = null;
    bodies.clear();
    for (const character of characters) {
      const scale = character.scale * Math.min(width, height) / 1080 * .99;
      bodies.set(character.id, bodyAt({ x: character.x * width, y: character.y * height }, scale, false));
    }
  }

  function add(id, point, scale) {
    const body = bodyAt(point, scale, true);
    bodies.set(id, body);
    return body;
  }

  function grab(id, point, time) {
    const body = bodies.get(id);
    if (!body || held) return;
    body.vx = body.vy = body.spin = 0;
    const angle = body.angle * toRadians;
    const dx = point.x - body.x;
    const dy = point.y - body.y;
    held = {
      body, time, point,
      gx: dx * Math.cos(angle) + dy * Math.sin(angle),
      gy: dy * Math.cos(angle) - dx * Math.sin(angle),
    };
  }

  function move(point, time) {
    if (!held) return;
    const { body, gx, gy } = held;
    const elapsed = Math.max(.008, (time - held.time) / 1000);
    const smoothing = 1 - Math.exp(-elapsed * 26);
    body.vx += (clamp((point.x - held.point.x) / elapsed, -4500, 4500) - body.vx) * smoothing;
    body.vy += (clamp((point.y - held.point.y) / elapsed, -4500, 4500) - body.vy) * smoothing;
    held.point = point;
    held.time = time;
    const angle = body.angle * toRadians;
    body.x = point.x - gx * Math.cos(angle) + gy * Math.sin(angle);
    body.y = point.y - gx * Math.sin(angle) - gy * Math.cos(angle);
  }

  function release(time, throwBody) {
    if (!held) return;
    const { body, gx, gy } = held;
    const decay = throwBody ? Math.exp(-Math.max(0, time - held.time) / 90) : 0;
    body.vx *= decay;
    body.vy *= decay;
    body.spin = clamp((body.vy * gx - body.vx * gy) / (18000 + gx * gx + gy * gy) * 27, -650, 650);
    body.awake = true;
    held = null;
  }

  function step(dt, width, height, gravity, bounce, { pile = false, puppet = false, artBounds } = {}) {
    const colliders = [];
    for (const [id, body] of bodies) {
      if (body === held?.body) {
        const swing = clamp((body.vx + (body.x - held.point.x) * 3) * .055, -55, 55);
        body.angle += (swing - body.angle) * Math.min(1, dt * 11);
        body.vx *= Math.exp(-dt * 2.8);
        body.vy *= Math.exp(-dt * 2.8);
        const { x, y } = held.point;
        const angle = body.angle * toRadians;
        body.x = x - held.gx * Math.cos(angle) + held.gy * Math.sin(angle);
        body.y = y - held.gx * Math.sin(angle) - held.gy * Math.cos(angle);
        updatePuppet(body, dt, puppet);
        if (pile) colliders.push({ body, extent: bounds(body, id, artBounds) });
        continue;
      }
      if (pile) body.awake = true;
      if (!body.awake) {
        updatePuppet(body, dt, puppet);
        if (body.grounded) body.y = height - bounds(body, id, artBounds).bottom;
        continue;
      }
      body.vy += gravity * Math.min(width, height) * 1.85 * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.angle = (body.angle + body.spin * dt) % 360;
      body.vx *= Math.exp(-dt * .35);
      body.spin *= Math.exp(-dt * .8);

      updatePuppet(body, dt, puppet);
      const extent = bounds(body, id, artBounds);
      const limits = stageLimits(extent, width, height);
      if (pile) colliders.push({ body, extent, limits });
      if (body.x < limits.left || body.x > limits.right) {
        body.x = clamp(body.x, limits.left, limits.right);
        body.vx = (body.x === limits.left ? 1 : -1) * Math.abs(body.vx) * bounce;
        body.spin *= .72;
      }
      body.grounded = false;
      if (body.y >= limits.bottom) {
        body.y = limits.bottom;
        if (body.vy > 0) body.vy = body.vy > 36 ? -body.vy * bounce : 0;
        body.vx *= Math.exp(-dt * 7);
        body.spin *= Math.exp(-dt * 9);
        if (Math.abs(body.vx) < 2 && Math.abs(body.vy) < 2 && Math.abs(body.spin) < 2) {
          body.awake = false;
          body.grounded = true;
        }
      } else if (body.y < limits.top) {
        body.y = limits.top;
        body.vy = Math.abs(body.vy) * bounce;
      }
    }

    for (let pass = 0; pass < 5 && colliders.length > 1; pass++) {
      for (let i = 0; i < colliders.length; i++) {
        for (let j = i + 1; j < colliders.length; j++) {
          resolveContact(colliders[i], colliders[j], held?.body, bounce);
        }
      }
      for (const { body, limits } of colliders) {
        if (body === held?.body) continue;
        const y = clamp(body.y, limits.top, limits.bottom);
        if (body.y !== y && Math.sign(body.vy) === Math.sign(body.y - y)) body.vy = 0;
        body.y = y;
        const x = clamp(body.x, limits.left, limits.right);
        if (body.x !== x && Math.sign(body.vx) === Math.sign(body.x - x)) body.vx = 0;
        body.x = x;
      }
    }
  }

  return { bodies, reset, add, grab, move, release, step };
}
