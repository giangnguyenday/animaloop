import { SVG_NS, RIG_WIDTH, RIG_HEIGHT, loadRig } from './rig.js';
import { cycles, poses, walkAt } from './motion.js';
import { readFrame } from './opla-frame.js';

const maxOplas = 3;
export const minPosterOplaSize = .25;
export const maxPosterOplaSize = 2;
const defaultOpla = {
  count: 1, fit: 'fit', layer: 'over', mode: 'pose', pose: 'neutral', cycle: 'stroll',
  scale: 'same', x: 0, y: 0, size: 1, rotation: 0,
};
const fits = ['fit', 'bleed', 'crop'];
const layers = ['under', 'over'];
const modes = ['pose', 'animate'];
const scales = ['same', 'smaller', 'larger'];
const oplaId = /^opla-[1-9]\d*$/;
const boundsCache = new WeakMap();
let rigPromise;

function bounded(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function loadPosterOplaRig() {
  rigPromise ??= loadRig().catch((error) => {
    rigPromise = undefined;
    throw error;
  });
  return rigPromise;
}

function cellsForIds(cells, ids) {
  const wanted = new Set(ids);
  return cells.filter(({ id }) => wanted.has(id));
}

function shareEdge(first, second) {
  const tolerance = Math.max(first.width, first.height, second.width, second.height) * 1e-8;
  const horizontalOverlap = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const verticalOverlap = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  return (Math.abs(horizontalOverlap) <= tolerance && verticalOverlap > tolerance)
    || (Math.abs(verticalOverlap) <= tolerance && horizontalOverlap > tolerance);
}

function connected(cells) {
  if (!cells.length) return false;
  const [first, ...rest] = cells;
  const visited = new Set([first]);
  for (const cell of visited) {
    for (const neighbor of rest) {
      if (!visited.has(neighbor) && shareEdge(cell, neighbor)) visited.add(neighbor);
    }
  }
  return visited.size === cells.length;
}

function countsByCell(placements, ignoreId) {
  const counts = new Map();
  for (const placement of placements) {
    if (placement.id === ignoreId) continue;
    for (const id of placement.cellIds) counts.set(id, (counts.get(id) ?? 0) + placement.count);
  }
  return counts;
}

function availableCount(ids, counts) {
  if (!ids.length) return 0;
  return Math.max(0, Math.min(...ids.map((id) => maxOplas - (counts.get(id) ?? 0))));
}

export function posterOplaCapacity(placements, cells, ids, ignoreId) {
  const distinct = [...new Set(ids)];
  const selected = cellsForIds(cells, distinct);
  if (selected.length !== distinct.length || (!ignoreId && !connected(selected))) return 0;
  return availableCount(distinct, countsByCell(placements, ignoreId));
}

export function createPosterOpla(placements, cells, ids) {
  if (!posterOplaCapacity(placements, cells, ids)) return null;
  const used = new Set(placements.map(({ id }) => id));
  let next = 1;
  while (used.has(`opla-${next}`)) next++;
  return { id: `opla-${next}`, cellIds: cellsForIds(cells, ids).map(({ id }) => id), ...defaultOpla };
}

export function duplicatePosterOpla(placements, cells, source, ids = source.cellIds) {
  if (posterOplaCapacity(placements, cells, ids) < source.count) return null;
  const placement = createPosterOpla(placements, cells, ids);
  return placement ? updatePosterOpla(placement, source) : null;
}

export function updatePosterOpla(placement, patch, maxCount = maxOplas) {
  const value = { ...defaultOpla, ...placement, ...patch };
  const countLimit = bounded(maxCount, 1, maxOplas, maxOplas);
  const rotation = Number.isFinite(value.rotation) ? ((value.rotation % 360) + 360) % 360 : defaultOpla.rotation;
  const next = {
    id: placement.id,
    cellIds: placement.cellIds,
    count: Math.round(bounded(value.count, 1, countLimit, 1)),
    fit: fits.includes(value.fit) ? value.fit : defaultOpla.fit,
    layer: layers.includes(value.layer) ? value.layer : defaultOpla.layer,
    mode: modes.includes(value.mode) ? value.mode : defaultOpla.mode,
    pose: Object.hasOwn(poses, value.pose) ? value.pose : defaultOpla.pose,
    frame: Object.hasOwn(patch, 'frame') ? readFrame(value.frame) : placement.frame,
    flip: value.flip === true,
    cycle: Object.hasOwn(cycles, value.cycle) ? value.cycle : defaultOpla.cycle,
    scale: scales.includes(value.scale) ? value.scale : defaultOpla.scale,
    x: bounded(value.x, -1, 1, 0),
    y: bounded(value.y, -1, 1, 0),
    size: bounded(value.size, minPosterOplaSize, maxPosterOplaSize, 1),
    rotation,
  };
  return Object.keys(next).every((key) => next[key] === placement[key]) ? placement : next;
}

export function readPosterOplas(input, cells, aliases = new Map()) {
  if (!Array.isArray(input)) return [];
  const knownCells = new Set(cells.map(({ id }) => id));
  const ids = new Set();
  const counts = new Map();
  const placements = [];
  for (const item of input) {
    if (!item || typeof item.id !== 'string' || !oplaId.test(item.id) || ids.has(item.id) || !Array.isArray(item.cellIds)) continue;
    const cellIds = [...new Set(item.cellIds.map((id) => aliases.get(id) ?? id).filter((id) => knownCells.has(id)))];
    const capacity = availableCount(cellIds, counts);
    if (!capacity) continue;
    const saved = updatePosterOpla({ id: item.id, cellIds }, item, capacity);
    ids.add(saved.id);
    for (const id of cellIds) counts.set(id, (counts.get(id) ?? 0) + saved.count);
    placements.push(saved);
  }
  return placements;
}

function svg(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function unionBounds(rectangles) {
  const x = Math.min(...rectangles.map((rect) => rect.x));
  const y = Math.min(...rectangles.map((rect) => rect.y));
  const right = Math.max(...rectangles.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rectangles.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

function intersect(first, second) {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function measureBounds(rig, placement) {
  const { mode, cycle, pose, frame, flip } = placement;
  const key = mode === 'animate' ? `cycle:${cycle}` : JSON.stringify(['pose', frame ?? pose, flip]);
  if (!boundsCache.has(rig)) boundsCache.set(rig, new Map());
  const cache = boundsCache.get(rig);
  if (cache.has(key)) return cache.get(key);

  const character = rig.create();
  const fallback = { x: 0, y: 0, width: RIG_WIDTH, height: RIG_HEIGHT };
  if (!character.node.getBBox || !document.body) return fallback;

  const probe = svg('svg', { width: 1, height: 1, 'aria-hidden': 'true', style: 'position:absolute;visibility:hidden;pointer-events:none' });
  probe.append(rig.defs.cloneNode(true), character.node);
  document.body.append(probe);
  try {
    const samples = mode === 'animate'
      ? Array.from({ length: 16 }, (_, index) => walkAt(0, cycle, index / 16, RIG_WIDTH, 1, false).pose)
      : [frame ?? poses[pose]];
    const measurements = samples.flatMap((sample) => {
      character.update({ pose: sample });
      const rect = character.node.getBBox();
      if (rect.width <= 0 || rect.height <= 0) return [];
      if (mode !== 'pose' || !flip) return [rect];
      return [{ x: RIG_WIDTH - rect.x - rect.width, y: rect.y, width: rect.width, height: rect.height }];
    });
    const bounds = measurements.length ? unionBounds(measurements) : fallback;
    cache.set(key, bounds);
    return bounds;
  } finally {
    probe.remove();
  }
}

function fitRatio(rect, shape) {
  return Math.min(rect.width / shape.width, rect.height / shape.height);
}

function slotCenter(slot, rectangles, shape, fit) {
  const x = slot.x + slot.width / 2;
  const y = slot.y + slot.height / 2;
  const centerIsCovered = rectangles.some((rect) => (
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  ));
  if (fit === 'crop' || centerIsCovered) return { x, y };

  // Keep a character visible when a slot lands in an unselected part of the combined frame.
  const parts = rectangles.map((rect) => intersect(rect, slot)).filter(({ width, height }) => width > 0 && height > 0);
  const best = (parts.length ? parts : rectangles).reduce((best, rect) => (
    fitRatio(rect, shape) > fitRatio(best, shape) ? rect : best
  ));
  return { x: best.x + best.width / 2, y: best.y + best.height / 2 };
}

function distribute(frame, count, shape) {
  const horizontal = frame.width / shape.width >= frame.height / shape.height;
  const width = horizontal ? frame.width / count : frame.width;
  const height = horizontal ? frame.height : frame.height / count;
  return Array.from({ length: count }, (_, index) => ({
    x: frame.x + (horizontal ? index * width : 0), y: frame.y + (horizontal ? 0 : index * height), width, height,
  }));
}

function placeCharacters(rig, cellRects, placement, parent) {
  const frame = unionBounds(cellRects);
  const shape = measureBounds(rig, placement);
  const slots = distribute(frame, placement.count, shape);
  const [slot] = slots;
  const baseScale = placement.fit === 'crop' ? Math.max(slot.width / shape.width, slot.height / shape.height) * 1.08
    : fitRatio(slot, shape) * (placement.fit === 'bleed' ? 1.20 : .94);
  const positions = slots.map((slot, index) => {
    const progress = slots.length > 1 ? index / (slots.length - 1) : 0;
    const progression = placement.scale === 'smaller' ? 1 - progress * .52
      : placement.scale === 'larger' && slots.length > 1 ? .48 + progress * .52 : 1;
    return { ...slotCenter(slot, cellRects, shape, placement.fit), scale: baseScale * progression };
  });
  const fitted = unionBounds(positions.map(({ x, y, scale }) => ({
    x: x - shape.width * scale / 2, y: y - shape.height * scale / 2,
    width: shape.width * scale, height: shape.height * scale,
  })));
  const pivotX = fitted.x + fitted.width / 2;
  const pivotY = fitted.y + fitted.height / 2;
  const centerX = pivotX + placement.x * frame.width / 2;
  const centerY = pivotY + placement.y * frame.height / 2;
  const bounds = {
    x: centerX - fitted.width * placement.size / 2,
    y: centerY - fitted.height * placement.size / 2,
    width: fitted.width * placement.size,
    height: fitted.height * placement.size,
  };
  const characters = positions.map((position, index) => {
    const character = rig.create();
    parent.append(character.node);
    const scale = position.scale * placement.size;
    const x = centerX + (position.x - pivotX) * placement.size + (RIG_WIDTH / 2 - shape.x - shape.width / 2) * scale;
    const y = centerY + (position.y - pivotY) * placement.size + (RIG_HEIGHT / 2 - shape.y - shape.height / 2) * scale;
    return { character, scale, x, y, phase: index / slots.length };
  });
  return { frame, bounds, characters };
}

export function createPosterOplaLayers(rig, cells, placements, color) {
  if (!rig || !placements?.length) return null;
  const defs = rig.defs.cloneNode(true);
  const under = svg('g', { 'pointer-events': 'none', 'aria-hidden': 'true' });
  const over = svg('g', { 'pointer-events': 'none', 'aria-hidden': 'true' });
  const animated = [];
  const placementGeometry = new Map();
  for (const placement of placements) {
    const rectangles = cellsForIds(cells, placement.cellIds);
    if (!rectangles.length) continue;
    const group = svg('g', { 'data-poster-opla': placement.id });
    if (placement.fit !== 'bleed') {
      const id = `poster-clip-${placement.id}`;
      const clip = svg('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
      for (const { x, y, width, height } of rectangles) clip.append(svg('rect', { x, y, width, height }));
      defs.append(clip);
      group.setAttribute('clip-path', `url(#${id})`);
    }
    (placement.layer === 'under' ? under : over).append(group);

    const artwork = svg('g');
    group.append(artwork);
    const { frame, bounds, characters } = placeCharacters(rig, rectangles, placement, artwork);
    const pivotX = bounds.x + bounds.width / 2;
    const pivotY = bounds.y + bounds.height / 2;
    artwork.setAttribute('transform', `rotate(${placement.rotation ?? 0} ${pivotX} ${pivotY})`);
    placementGeometry.set(placement.id, { frame, bounds });
    for (const { character, scale, x, y, phase } of characters) {
      const appearance = { color, scale, x, y };
      if (placement.mode === 'animate') {
        animated.push({ character, appearance, cycle: placement.cycle, phase });
      } else {
        character.update({ ...appearance, pose: placement.frame ?? poses[placement.pose], flip: placement.flip });
      }
    }
  }

  function update(seconds) {
    const time = Number.isFinite(seconds) ? seconds : 0;
    for (const { character, appearance, cycle, phase } of animated) {
      const { pose, flip } = walkAt(time, cycle, phase, RIG_WIDTH, appearance.scale, false);
      character.update({ ...appearance, pose, flip });
    }
  }
  update(0);
  return { defs, under, over, animated: animated.length > 0, update, placementGeometry };
}

export function mountPosterOplaLayers(stage, layers) {
  if (!layers) return;
  stage.prepend(layers.defs);
  if (layers.under.childElementCount) {
    const cells = [...stage.children].filter((element) => element.hasAttribute('data-cell'));
    const backgrounds = svg('g', { 'pointer-events': 'none', 'aria-hidden': 'true' });
    for (const cell of cells) {
      // Leave the hit target and letter together, and paint the cell fill below the Oplas.
      const rectangle = cell.firstElementChild;
      backgrounds.append(rectangle.cloneNode(true));
      rectangle.setAttribute('fill-opacity', 0);
      rectangle.setAttribute('pointer-events', 'all');
    }
    stage.insertBefore(backgrounds, cells[0] ?? null);
    stage.insertBefore(layers.under, cells[0] ?? null);
  }
  if (layers.over.childElementCount) stage.append(layers.over);
}
