import { SVG_NS, RIG_WIDTH, RIG_HEIGHT, loadRig } from './rig.js';
import { cycles, poses, walkAt } from './motion.js';

const maxOplas = 3;
const defaultOpla = {
  count: 1, fit: 'fit', layer: 'over', mode: 'pose', pose: 'neutral', cycle: 'stroll',
  scale: 'same', x: 0, y: 0, size: 1,
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

export function updatePosterOpla(placement, patch, maxCount = maxOplas) {
  const value = { ...defaultOpla, ...placement, ...patch };
  const countLimit = bounded(maxCount, 1, maxOplas, maxOplas);
  const next = {
    id: placement.id,
    cellIds: placement.cellIds,
    count: Math.round(bounded(value.count, 1, countLimit, 1)),
    fit: fits.includes(value.fit) ? value.fit : defaultOpla.fit,
    layer: layers.includes(value.layer) ? value.layer : defaultOpla.layer,
    mode: modes.includes(value.mode) ? value.mode : defaultOpla.mode,
    pose: Object.hasOwn(poses, value.pose) ? value.pose : defaultOpla.pose,
    cycle: Object.hasOwn(cycles, value.cycle) ? value.cycle : defaultOpla.cycle,
    scale: scales.includes(value.scale) ? value.scale : defaultOpla.scale,
    x: bounded(value.x, -1, 1, 0),
    y: bounded(value.y, -1, 1, 0),
    size: bounded(value.size, .25, 2.5, 1),
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
  const key = placement.mode === 'animate' ? `cycle:${placement.cycle}` : `pose:${placement.pose}`;
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
    const { mode, cycle, pose } = placement;
    const samples = mode === 'animate'
      ? Array.from({ length: 16 }, (_, index) => walkAt(0, cycle, index / 16, RIG_WIDTH, 1, false).pose)
      : [poses[pose]];
    const measurements = samples.flatMap((frame) => {
      character.update({ pose: frame });
      const rect = character.node.getBBox();
      return rect.width > 0 && rect.height > 0 ? [rect] : [];
    });
    const bounds = measurements.length ? unionBounds(measurements) : fallback;
    cache.set(key, bounds);
    return bounds;
  } finally {
    probe.remove();
  }
}

function largestRect(rectangles) {
  return rectangles.reduce((largest, rect) => (
    rect.width * rect.height > largest.width * largest.height ? rect : largest
  ));
}

function distribute(rectangles, frame, count, shape, fit) {
  const horizontal = frame.width / shape.width >= frame.height / shape.height;
  const occupiedArea = rectangles.reduce((area, rect) => area + rect.width * rect.height, 0);
  const frameArea = frame.width * frame.height;
  const rectangular = Math.abs(occupiedArea - frameArea) < frameArea * 1e-8;
  const width = horizontal ? frame.width / count : frame.width;
  const height = horizontal ? frame.height : frame.height / count;
  return Array.from({ length: count }, (_, index) => {
    const slot = { x: frame.x + (horizontal ? index * width : 0), y: frame.y + (horizontal ? 0 : index * height), width, height };
    if (rectangular || fit === 'crop') return slot;
    // Keep each Opla on the selected color blocks even when the frame bends around a letter.
    const part = largestRect(rectangles.map((rect) => intersect(rect, slot)));
    return part.width > 0 && part.height > 0 ? part : largestRect(rectangles);
  });
}

function placeCharacters(rig, cellRects, placement, parent) {
  const frame = unionBounds(cellRects);
  const shape = measureBounds(rig, placement);
  const slots = distribute(cellRects, frame, placement.count, shape, placement.fit);
  const baseScale = Math.min(...slots.map((slot) => {
    const fitX = slot.width / shape.width;
    const fitY = slot.height / shape.height;
    if (placement.fit === 'crop') return Math.max(fitX, fitY) * 1.08;
    return Math.min(fitX, fitY) * (placement.fit === 'bleed' ? 1.20 : .94);
  })) * placement.size;
  return slots.map((slot, index) => {
    const character = rig.create();
    parent.append(character.node);
    const progress = slots.length > 1 ? index / (slots.length - 1) : 0;
    const progression = placement.scale === 'smaller' ? 1 - progress * .52
      : placement.scale === 'larger' && slots.length > 1 ? .48 + progress * .52 : 1;
    const scale = baseScale * progression;
    const x = slot.x + slot.width / 2 + placement.x * frame.width / 2
      + (RIG_WIDTH / 2 - shape.x - shape.width / 2) * scale;
    const y = slot.y + slot.height / 2 + placement.y * frame.height / 2
      + (RIG_HEIGHT / 2 - shape.y - shape.height / 2) * scale;
    return { character, scale, x, y, phase: index / slots.length };
  });
}

export function createPosterOplaLayers(rig, cells, placements, color) {
  if (!rig || !placements?.length) return null;
  const defs = rig.defs.cloneNode(true);
  const under = svg('g', { 'pointer-events': 'none', 'aria-hidden': 'true' });
  const over = svg('g', { 'pointer-events': 'none', 'aria-hidden': 'true' });
  const animated = [];
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

    for (const { character, scale, x, y, phase } of placeCharacters(rig, rectangles, placement, group)) {
      const appearance = { color, scale, x, y };
      if (placement.mode === 'animate') {
        animated.push({ character, appearance, cycle: placement.cycle, phase });
      } else {
        character.update({ ...appearance, pose: poses[placement.pose] });
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
  return { defs, under, over, animated: animated.length > 0, update };
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
