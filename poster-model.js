import { flowPosterText, posterReadingOrder, segmentPosterText as segments } from './poster-flow.js';
import { updatePosterOpla } from './poster-opla.js?v=type-blocks';

export const schemes = {
  1: { name: 'Zesty', accentA: '#A7F9FF', accentB: '#EAFF74', background: '#F5F5F5', text: '#423625', opla: '#3558E3' },
  2: { name: 'Fruity', accentA: '#F689FD', accentB: '#FE9544', background: '#423625', text: '#F5F5F5', opla: '#CE2163' },
};

export const presets = {
  square: { label: 'Square post', mode: 'digital', width: 1080, height: 1080 },
  portrait: { label: 'Portrait post', mode: 'digital', width: 1080, height: 1350 },
  story: { label: 'Story', mode: 'digital', width: 1080, height: 1920 },
  vertical: { label: 'Vertical 3:4', mode: 'digital', width: 1080, height: 1440 },
  standard: { label: 'Landscape 4:3', mode: 'digital', width: 1600, height: 1200 },
  wide: { label: 'Screen 16:9', mode: 'digital', width: 1920, height: 1080 },
  '4k': { label: 'Screen 4K', mode: 'digital', width: 3840, height: 2160 },
  'digital-custom': { label: 'Custom', mode: 'digital' },
  a3: { label: 'A3', mode: 'print', width: 297, height: 420 },
  a4: { label: 'A4', mode: 'print', width: 210, height: 297 },
  'print-custom': { label: 'Custom', mode: 'print' },
};

export const maxColumns = 12;
export const maxCellsPerColumn = 24;
export const sizeLimits = { digital: { min: 64, max: 8192 }, print: { min: 10, max: 650 } };
export const printPpi = 300;
export const maxTextPadding = 50;
const maxBarPercent = 45;
const defaultTextPadding = 1;
const defaultBar = { enabled: false, height: 8, mode: 'add' };
const barModes = ['add', 'overlap', 'push'];
const minColumnWidth = .035;
const minCellHeight = .012;
const pixelsPerMillimeter = printPpi / 25.4;
const roles = ['background', 'accentA', 'accentB'];
const accents = ['accentA', 'accentB'];
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

function readPosterBar(bar) {
  const measurement = Number.isFinite(bar?.heightPx)
    ? { heightPx: Math.max(0, Math.round(bar.heightPx)) }
    : { height: Number.isFinite(bar?.height) ? clamp(bar.height, 0, maxBarPercent) : defaultBar.height };
  return {
    enabled: bar?.enabled === true,
    ...measurement,
    mode: barModes.includes(bar?.mode) ? bar.mode : defaultBar.mode,
  };
}

function readPosterBars(bars) {
  return { top: readPosterBar(bars?.top), bottom: readPosterBar(bars?.bottom) };
}

export function graphemes(text) {
  return segments(text.normalize()).filter((segment) => !/^\s+$/u.test(segment));
}

export function uppercasePosterText(text) {
  // Use the capital sharp S so it keeps its own block.
  return text.replaceAll('ß', 'ẞ').toUpperCase().normalize();
}

export function posterCellLetter(text) {
  return graphemes(uppercasePosterText(text))[0] ?? '';
}

// Cell edges in the supplied 1080 × 1350 reference. The slot order follows the headline.
const sample = [
  [350, [[143, 'background', 'M', 0], [511, 'accentA'], [704, 'accentB'], [1207, 'accentA'], [1350, 'background', 'M', 8]]],
  [214, [[143, 'accentB'], [336, 'background', 'A', 1], [511, 'accentB'], [704, 'background', 'Y', 4], [1014, 'accentB'], [1207, 'background', 'O', 9], [1350, 'accentB']]],
  [168, [[243, 'background', 'K', 2], [461, 'accentA'], [704, 'background', 'O', 5], [1107, 'accentA'], [1350, 'background', 'V', 10]]],
  [102, [[293, 'background', 'E', 3], [461, 'accentB'], [754, 'background', 'U', 6], [1057, 'accentB'], [1350, 'background', 'E', 11]]],
  [246, [[611, 'accentA'], [754, 'background', 'R', 7], [1350, 'accentA']]],
];

// Each pose is anchored to the corresponding blocks of the example grid.
const sampleOplas = [
  { blocks: [[0, 1], [1, 2]], pose: 'kick', fit: 'crop', size: .71, x: -.25, y: .07,
    frame: { leftArm: 2, rightArm: -49, leftLeg: 18, rightLeg: -68, rightLift: 23, head: -19, hat: -8, lean: -10, footDirection: 1 } },
  { blocks: [[2, 1]], pose: 'stride', fit: 'bleed', size: .85, x: .10, y: .12, rotation: 62 },
  { blocks: [[4, 0]], pose: 'lean', fit: 'crop', size: 1.03, x: .92, y: .04, rotation: -6 },
  { blocks: [[0, 3]], pose: 'salute', fit: 'bleed', x: .20, y: -.19 },
  { blocks: [[2, 3]], pose: 'stride', fit: 'crop', size: .52, x: -.55, y: -.22 },
  { blocks: [[2, 3]], pose: 'jump', fit: 'bleed', size: .48, x: .85, y: -.36, rotation: -11 },
  { blocks: [[3, 3]], pose: 'salute', fit: 'crop', size: .28, x: .65, y: -.17, rotation: -12 },
];

export function createPoster() {
  let id = 0;
  const columns = sample.map(([width, rows]) => ({
    width: width / 1080,
    cells: rows.map(([bottom, role, text = '', slot]) => ({ id: `cell-${++id}`, bottom: bottom / 1350, role, text, slot })),
  }));
  const oplas = sampleOplas.map(({ blocks, ...options }, index) => updatePosterOpla({
    id: `opla-${index + 1}`,
    cellIds: blocks.map(([column, row]) => columns[column].cells[row].id),
  }, { layer: 'under', ...options }));
  return {
    preset: 'portrait', mode: 'digital', width: 1080, height: 1350, scheme: 2, copy: 'MAKE YOUR MOVE', textSeed: 0,
    columns, oplas, textPadding: defaultTextPadding, bars: readPosterBars(),
  };
}

export function resetPosterGrid(state, accent) {
  if (!accents.includes(accent)) return state;

  const columnCount = state.columns.length;
  const rowCount = 5;
  let id = 0;
  const columns = Array.from({ length: columnCount }, () => ({
    width: 1 / columnCount,
    cells: Array.from({ length: rowCount }, (_, row) => ({
      id: `cell-${++id}`,
      bottom: (row + 1) / rowCount,
      role: accent,
      text: '',
    })),
  }));
  return { ...state, columns, copy: '', textSeed: 0, oplas: [] };
}

export function dimensions(state) {
  const print = state.mode === 'print';
  const { width } = state;
  const { top, bottom } = state.bars ?? readPosterBars();
  const roundHeight = (height) => print ? Math.round(height * 100) / 100 : Math.round(height);
  const toPixels = (value) => print ? Math.round(value * pixelsPerMillimeter) : value;
  const originalPixels = toPixels(state.height);
  const barHeightLimit = Math.round(originalPixels * maxBarPercent / 100);
  const legacyHeight = (bar) => bar.enabled && bar.heightPx === undefined
    ? roundHeight(state.height * bar.height / 100)
    : 0;
  const topLegacyHeight = legacyHeight(top);
  const bottomLegacyHeight = legacyHeight(bottom);
  const heightWithLegacyTop = roundHeight(state.height + (top.mode === 'add' ? topLegacyHeight : 0));
  const totalLegacyHeight = roundHeight(heightWithLegacyTop + (bottom.mode === 'add' ? bottomLegacyHeight : 0));
  const pixelsWithLegacyTop = toPixels(heightWithLegacyTop);
  const totalLegacyPixels = toPixels(totalLegacyHeight);
  const barPixels = (bar, fallback) => bar.enabled && bar.heightPx !== undefined
    ? Math.min(bar.heightPx, barHeightLimit)
    : fallback;
  // Preserve the cumulative rounding used for older percentage-based bars in print projects.
  const barHeights = {
    top: barPixels(top, top.mode === 'add' ? pixelsWithLegacyTop - originalPixels : toPixels(topLegacyHeight)),
    bottom: barPixels(bottom, bottom.mode === 'add' ? totalLegacyPixels - pixelsWithLegacyTop : toPixels(bottomLegacyHeight)),
  };
  const addedBarPixels = (bar, pixels) => bar.mode === 'add' && bar.heightPx !== undefined ? pixels : 0;
  const addedPixels = addedBarPixels(top, barHeights.top) + addedBarPixels(bottom, barHeights.bottom);
  const height = roundHeight(totalLegacyHeight + (print ? addedPixels / pixelsPerMillimeter : addedPixels));
  const pixelWidth = toPixels(width);
  const pixelHeight = totalLegacyPixels + addedPixels;
  const gridY = top.mode === 'overlap' ? 0 : barHeights.top;
  const gridHeight = pixelHeight - gridY - (bottom.mode === 'overlap' ? 0 : barHeights.bottom);
  return {
    width, height, unit: print ? 'mm' : 'px', viewWidth: pixelWidth, viewHeight: pixelHeight, pixelWidth, pixelHeight,
    gridY, gridHeight, barHeights, barHeightLimit,
  };
}

function gridCells(state) {
  const { viewWidth, gridY, gridHeight } = dimensions(state);
  let left = 0;
  return state.columns.flatMap(({ width, cells }, column) => {
    const x = left * viewWidth;
    left += width;
    let top = 0;
    return cells.map((cell, row) => {
      const y = gridY + top * gridHeight;
      const height = (cell.bottom - top) * gridHeight;
      top = cell.bottom;
      return { ...cell, x, y, width: width * viewWidth, height, column, row };
    });
  });
}

export function posterCells(state) {
  const visible = new Map();
  for (const cell of gridCells(state)) {
    if (!cell.join) {
      visible.set(cell.id, { ...cell, columnEnd: cell.column, rowEnd: cell.row });
    } else {
      const block = visible.get(cell.join);
      block.width = cell.x + cell.width - block.x;
      block.columnEnd = cell.column;
    }
  }
  return [...visible.values()];
}

function readingOrder(state) {
  return posterCells(state).sort((first, second) => {
    if (first.slot !== undefined || second.slot !== undefined) {
      return (first.slot ?? Infinity) - (second.slot ?? Infinity);
    }
    return first.y - second.y || first.column - second.column;
  });
}

function mapCells(state, update) {
  return { ...state, columns: state.columns.map((column) => ({ ...column, cells: column.cells.map(update) })) };
}

export function posterText(state) {
  return state.copy;
}

function blockAccent(cell) {
  if (accents.includes(cell.role)) return cell.role;
  return cell.accent ?? accents[Number(cell.id.slice(5)) % accents.length];
}

function applyPlacement(state, text, seed, placement) {
  return mapCells({ ...state, copy: text, textSeed: seed }, (cell) => {
    if (cell.join) return cell;
    const { text: letter = '', slot } = placement.get(cell.id) ?? {};
    const accent = blockAccent(cell);
    const block = !letter && cell.text && cell.block === 'text' ? undefined : cell.block;
    return { ...cell, text: letter, slot, accent, block, role: letter ? 'background' : accent };
  });
}

function placeCopy(state, text) {
  const placement = flowPosterText(posterCells(state), text, state.textSeed);
  return applyPlacement(state, text, state.textSeed, placement);
}

export function setPosterText(state, text) {
  const copy = uppercasePosterText(text);
  return copy === state.copy ? state : placeCopy(state, copy);
}

export function randomizeTextPositions(state) {
  if (state.oplas?.length) state = { ...state, oplas: [] };
  const hadOverrides = posterCells(state).some((cell) => cell.block);
  const next = hadOverrides ? mapCells(state, (cell) => ({ ...cell, block: undefined })) : state;
  if (!graphemes(next.copy).length) return next;
  const cells = posterCells(next);
  let placement;
  let seed;
  for (let attempt = 1; attempt <= 8; attempt++) {
    seed = (next.textSeed + attempt) >>> 0;
    placement = flowPosterText(cells, next.copy, seed);
    if (cells.some((cell) => cell.text !== (placement.get(cell.id)?.text ?? ''))) {
      return applyPlacement(next, next.copy, seed, placement);
    }
  }
  return hadOverrides ? applyPlacement(next, next.copy, seed, placement) : state;
}

function placedLetters(state) {
  return posterCells(state).filter((cell) => cell.text).length;
}

function placeWaitingText(state) {
  return placedLetters(state) < graphemes(state.copy).length ? placeCopy(state, state.copy) : state;
}

function editCopy(copy, index, text, replace) {
  let position = 0;
  const units = segments(copy);
  const unitIndex = units.findIndex((unit) => !/^\s+$/u.test(unit) && position++ === index);
  if (unitIndex === -1) return copy + text;
  units.splice(unitIndex, Number(replace), text);
  return units.join('');
}

function insertionIndex(cells, filled, id) {
  const spatial = posterReadingOrder(cells);
  const position = spatial.findIndex((cell) => cell.id === id);
  const after = spatial.slice(position + 1).find((cell) => cell.text);
  return after ? filled.findIndex((cell) => cell.id === after.id) : filled.length;
}

function editCellText(state, id, text) {
  const order = readingOrder(state);
  const current = order.find((cell) => cell.id === id);
  if (!current || (current.text === text && (text || current.block !== 'text'))) return state;
  const filled = order.filter((cell) => cell.text);
  const replace = !!current.text;
  const index = replace ? filled.findIndex((cell) => cell.id === id) : insertionIndex(order, filled, id);
  const copy = replace || text ? editCopy(state.copy, index, text, replace) : state.copy;
  filled.splice(index, Number(replace), ...(text ? [current] : []));
  const slots = new Map(filled.map((cell, slot) => [cell.id, slot]));
  return mapCells({ ...state, copy }, (cell) => {
    const slot = slots.get(cell.id);
    if (cell.id !== id) return slot === cell.slot ? cell : { ...cell, slot };
    const accent = blockAccent(cell);
    return { ...cell, text, slot, accent, block: text ? 'text' : 'color', role: text ? 'background' : accent };
  });
}

export function updateCell(state, id, changes) {
  const cell = posterCells(state).find((item) => item.id === id);
  if (!cell) return state;
  if (typeof changes.text === 'string') state = editCellText(state, id, posterCellLetter(changes.text));
  return changes.role ? setBlockRole(state, [id], changes.role) : state;
}

export function swapPosterBlocks(state, sourceId, targetId) {
  if (sourceId === targetId) return state;
  const cells = readingOrder(state);
  const source = cells.find(({ id }) => id === sourceId);
  const target = cells.find(({ id }) => id === targetId);
  if (!source?.text || !target) return state;

  const unslottedText = cells.some(({ text, slot }) => text && slot === undefined);
  const slots = unslottedText ? new Map(cells.filter(({ text }) => text).map(({ id }, slot) => [id, slot])) : null;
  return mapCells(state, (cell) => {
    const content = cell.id === sourceId ? target : cell.id === targetId ? source : cell;
    const slot = slots ? slots.get(content.id) : content.slot;
    if (content === cell) return slot === cell.slot ? cell : { ...cell, slot };
    const { text, role, block } = content;
    return { ...cell, text, role, block, slot, accent: blockAccent(content) };
  });
}

export function setBlockRole(state, ids, role) {
  if (!roles.includes(role)) return state;
  const chosen = new Set(ids);
  const selected = posterCells(state).filter((cell) => chosen.has(cell.id));
  const block = role === 'background' ? 'text' : 'color';
  if (!selected.some((cell) => cell.block !== block || (block === 'color' && cell.role !== role))) return state;
  if (block === 'color') {
    for (const cell of selected) if (cell.text) state = editCellText(state, cell.id, '');
  }
  return mapCells(state, (cell) => {
    if (!chosen.has(cell.id)) return cell;
    const accent = block === 'color' ? role : blockAccent(cell);
    return { ...cell, role: cell.text ? 'background' : accent, block, accent };
  });
}

export function clearTextBlocks(state) {
  if (!state.copy && !posterCells(state).some((cell) => cell.text || cell.block === 'text')) return state;
  return mapCells({ ...state, copy: '' }, (cell) => ({
    ...cell, text: '', slot: undefined, role: blockAccent(cell), block: cell.block === 'text' ? undefined : cell.block,
  }));
}

function replaceColumns(state, columns) {
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  return { ...state, columns: columns.map((column) => ({ ...column, width: column.width / total })) };
}

function cellIds(state) {
  let id = Math.max(0, ...gridCells(state).map((cell) => Number(cell.id.slice(5))));
  return () => `cell-${++id}`;
}

function splitRow(cells, row, id, position) {
  const top = cells[row - 1]?.bottom ?? 0;
  const cell = cells[row];
  if (cells.length >= maxCellsPerColumn || cell.bottom - top < minCellHeight * 2 - 1e-10) return cells;
  const requested = Number.isFinite(position) ? position : (top + cell.bottom) / 2;
  const middle = clamp(requested, top + minCellHeight, cell.bottom - minCellHeight);
  const newCell = { ...cell, id, text: '', slot: undefined, role: blockAccent(cell) };
  return cells.toSpliced(row, 1, { ...cell, bottom: middle }, newCell);
}

function replaceRows(state, column, cells) {
  return { ...state, columns: state.columns.with(column, { ...state.columns[column], cells }) };
}

function canSplitBlock(state, cell) {
  if (cell.columnEnd > cell.column) return true;
  const { cells } = state.columns[cell.column];
  const height = cells[cell.row].bottom - (cells[cell.row - 1]?.bottom ?? 0);
  return cells.length < maxCellsPerColumn && height >= minCellHeight * 2 - 1e-10;
}

export function canSplitCell(state, id) {
  const cell = posterCells(state).find((item) => item.id === id);
  return !!cell && canSplitBlock(state, cell);
}

export function splitCell(state, id, position) {
  const cell = posterCells(state).find((item) => item.id === id);
  if (!cell) return state;
  if (cell.columnEnd > cell.column) {
    return placeWaitingText(mapCells(state, (item) => item.join === id
      ? { ...item, join: undefined, role: blockAccent(cell), block: cell.block, accent: blockAccent(cell) }
      : item));
  }
  const before = state.columns[cell.column].cells;
  const cells = splitRow(before, cell.row, cellIds(state)(), position);
  if (cells === before) return state;
  return placeWaitingText(replaceRows(state, cell.column, cells));
}

function mergeSelection(state, ids) {
  const chosen = new Set(ids);
  if (chosen.size < 2) return [];
  const cells = posterCells(state).filter((cell) => chosen.has(cell.id));
  if (cells.length !== chosen.size) return [];
  const left = Math.min(...cells.map((cell) => cell.x));
  const top = Math.min(...cells.map((cell) => cell.y));
  const right = Math.max(...cells.map((cell) => cell.x + cell.width));
  const bottom = Math.max(...cells.map((cell) => cell.y + cell.height));
  const boxArea = (right - left) * (bottom - top);
  const cellArea = cells.reduce((sum, cell) => sum + cell.width * cell.height, 0);
  return Math.abs(boxArea - cellArea) < boxArea * 1e-8 ? cells : [];
}

export function canMergeCells(state, ids) {
  return mergeSelection(state, ids).length > 0;
}

export function mergeCells(state, ids, contentId) {
  const selected = mergeSelection(state, ids);
  if (!selected.length) return state;
  const [anchor] = selected;
  const chosen = new Set(selected.map((cell) => cell.id));
  const filled = selected.filter((cell) => cell.text);
  const content = selected.find((cell) => cell.id === contentId) ?? filled[0] ?? anchor;
  const columns = state.columns.map((column, index) => {
    const start = column.cells.findIndex((cell) => chosen.has(cell.join ?? cell.id));
    if (start < 0) return column;
    const end = column.cells.findLastIndex((cell) => chosen.has(cell.join ?? cell.id));
    const first = column.cells[start];
    const bottom = column.cells[end].bottom;
    const merged = index === anchor.column
      ? { id: anchor.id, bottom, role: content.role, block: content.block, accent: blockAccent(content), text: content.text, slot: content.slot }
      : { id: first.id, bottom, join: anchor.id, role: content.role, text: '' };
    return { ...column, cells: column.cells.toSpliced(start, end - start + 1, merged) };
  });
  const next = { ...state, columns };
  return filled.length > 1 ? placeCopy(next, state.copy) : next;
}

function neighborForDeletion(state, id) {
  const cells = posterCells(state);
  const cell = cells.find((item) => item.id === id);
  if (!cell) return;
  const tolerance = Math.max(cell.width, cell.height) * 1e-8;
  const equal = (first, second) => Math.abs(first - second) <= tolerance;
  const vertical = cells.filter((item) => item.column === cell.column && item.columnEnd === cell.columnEnd);
  return vertical.find((item) => equal(item.y, cell.y + cell.height))
    ?? vertical.find((item) => equal(item.y + item.height, cell.y))
    ?? cells.find((item) => (item.column === cell.columnEnd + 1 || item.columnEnd + 1 === cell.column)
      && equal(item.y, cell.y) && equal(item.height, cell.height));
}

export function canDeleteCell(state, id) {
  return !!neighborForDeletion(state, id);
}

export function deleteCell(state, id) {
  const neighbor = neighborForDeletion(state, id);
  if (!neighbor) return state;
  const cleared = editCellText(state, id, '');
  const next = mergeCells(cleared, [id, neighbor.id], neighbor.id);
  if (next === cleared) return state;
  if (!state.oplas?.length) return next;
  const retainedId = posterCells(next).find((cell) => cell.id === id || cell.id === neighbor.id).id;
  const oplas = state.oplas.map((opla) => ({
    ...opla,
    cellIds: opla.cellIds.filter((cellId) => cellId !== id).map((cellId) => cellId === neighbor.id ? retainedId : cellId),
  })).filter(({ cellIds }) => cellIds.length);
  return { ...next, oplas };
}

export function setColumnCount(state, requested) {
  if (!Number.isFinite(requested)) return state;
  const count = clamp(Math.round(requested), 1, maxColumns);
  const columns = [...state.columns];
  if (count === columns.length) return state;
  const nextId = cellIds(state);
  if (count > columns.length) {
    const merged = new Set(gridCells(state).map((cell) => cell.join).filter(Boolean));
    while (count > columns.length) {
      const widest = Math.max(...columns.map((column) => column.width));
      const index = columns.findIndex((column) => column.width === widest);
      const column = columns[index];
      const width = column.width / 2;
      const cells = column.cells.map((cell) => ({
        id: nextId(), bottom: cell.bottom, role: blockAccent(cell), text: '',
        join: cell.join ?? (merged.has(cell.id) ? cell.id : undefined),
      }));
      columns.splice(index, 1, { ...column, width }, { width, cells });
    }
    return placeWaitingText(replaceColumns(state, columns));
  }

  let next = replaceColumns(state, columns.slice(0, count));
  const before = posterCells(state);
  if (!before.some((cell) => cell.column >= count && cell.text)) return next;
  const needed = before.filter((cell) => cell.text).length;
  let available = posterCells(next).filter((cell) => cell.block !== 'color');
  while (available.length < needed) {
    const largest = available.filter((cell) => cell.column === cell.columnEnd && canSplitBlock(next, cell))
      .sort((first, second) => second.height - first.height)[0];
    if (!largest) break;
    const rows = next.columns[largest.column].cells;
    const split = splitRow(rows, largest.row, nextId());
    if (rows === split) break;
    next = replaceRows(next, largest.column, split);
    available = posterCells(next).filter((cell) => cell.block !== 'color');
  }
  return placeCopy(next, state.copy);
}

// The first interior column boundary has index 1. Position is measured across the full artboard.
export function moveColumnBoundary(state, index, position) {
  if (!Number.isInteger(index) || index <= 0 || index >= state.columns.length || !Number.isFinite(position)) return state;
  const columns = [...state.columns];
  const left = columns.slice(0, index - 1).reduce((sum, column) => sum + column.width, 0);
  const total = columns[index - 1].width + columns[index].width;
  const width = clamp(position - left, minColumnWidth, total - minColumnWidth);
  if (width === columns[index - 1].width) return state;
  columns[index - 1] = { ...columns[index - 1], width };
  columns[index] = { ...columns[index], width: total - width };
  return { ...state, columns };
}

function rowBoundaryGroup(state, column, row) {
  if (!Number.isInteger(row) || row < 0 || !state.columns[column]?.cells[row + 1]) return [];
  const blocks = new Map();
  state.columns.forEach(({ cells }, columnIndex) => cells.forEach((cell, rowIndex) => {
    const id = cell.join ?? cell.id;
    if (!blocks.has(id)) blocks.set(id, []);
    blocks.get(id).push({ column: columnIndex, row: rowIndex });
  }));

  const pending = [{ column, row }];
  const edges = new Map();
  while (pending.length) {
    const edge = pending.pop();
    if (edges.has(edge.column)) continue;
    edges.set(edge.column, edge.row);
    for (const side of [0, 1]) {
      const cell = state.columns[edge.column].cells[edge.row + side];
      for (const member of blocks.get(cell.join ?? cell.id)) {
        if (!edges.has(member.column)) pending.push({ column: member.column, row: member.row - side });
      }
    }
  }
  return [...edges];
}

function rowBoundaryRange(state, edges) {
  const min = Math.max(...edges.map(([column, row]) => (state.columns[column].cells[row - 1]?.bottom ?? 0) + minCellHeight));
  const max = Math.min(...edges.map(([column, row]) => state.columns[column].cells[row + 1].bottom - minCellHeight));
  return { min, max };
}

export function canMoveRowBoundary(state, column, row) {
  const edges = rowBoundaryGroup(state, column, row);
  if (!edges.length) return false;
  const { min, max } = rowBoundaryRange(state, edges);
  return max - min > 1e-8;
}

export function rowBoundarySnapTargets(state, column, row) {
  const edges = rowBoundaryGroup(state, column, row);
  if (!edges.length) return [];
  const { min, max } = rowBoundaryRange(state, edges);
  const movingColumns = new Set(edges.map(([index]) => index));
  return state.columns.flatMap(({ cells }, index) => movingColumns.has(index)
    ? [] : cells.map(({ bottom }) => bottom).filter((bottom) => bottom >= min && bottom <= max));
}

function replaceBoundaries(state, edges, bottom) {
  const rows = new Map(edges);
  return { ...state, columns: state.columns.map((column, index) => {
    const row = rows.get(index);
    if (row === undefined || column.cells[row].bottom === bottom) return column;
    return { ...column, cells: column.cells.with(row, { ...column.cells[row], bottom }) };
  }) };
}

// An edge beside a block spanning several columns moves with the corresponding edges in those columns.
export function moveRowBoundary(state, column, row, position) {
  if (!Number.isFinite(position)) return state;
  const edges = rowBoundaryGroup(state, column, row);
  if (!edges.length) return state;
  const { min, max } = rowBoundaryRange(state, edges);
  if (max - min < 1e-8) return state;
  const bottom = clamp(position, min, max);
  if (bottom === state.columns[column].cells[row].bottom) return state;
  return replaceBoundaries(state, edges, bottom);
}

function varyColumnCount(state, random) {
  const count = state.columns.length;
  const canAdd = count < maxColumns;
  if (canAdd && (count === 1 || random() >= .5)) return setColumnCount(state, count + 1);

  const rightmost = new Set(state.columns.at(-1).cells.map(({ id }) => id));
  const removesOplaAnchor = state.oplas?.some(({ cellIds }) => cellIds.some((id) => rightmost.has(id)));
  if (!removesOplaAnchor) {
    const smaller = setColumnCount(state, count - 1);
    if (!canAdd || placedLetters(smaller) >= placedLetters(state)) return smaller;
  }
  return canAdd ? setColumnCount(state, count + 1) : state;
}

function shuffleLayoutColors(state, random) {
  const colorCells = posterCells(state).filter((cell) => !cell.text);
  if (!colorCells.length) return state;
  const colors = new Map(colorCells.map(({ id }) => [id, accents[Math.floor(random() * accents.length)]]));
  if (colorCells.length > 1 && new Set(colors.values()).size === 1) {
    const { id } = colorCells[Math.floor(random() * colorCells.length)];
    colors.set(id, colors.get(id) === 'accentA' ? 'accentB' : 'accentA');
  }
  return mapCells(state, (cell) => {
    const color = colors.get(cell.join ?? cell.id);
    return color ? { ...cell, role: color, accent: color } : cell;
  });
}

export function randomizeLayout(state, random = Math.random, { keepColumns = true, shuffleColors = false } = {}) {
  const grid = keepColumns ? state : varyColumnCount(state, random);
  const weights = grid.columns.map(() => .7 + random() * 1.4);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const free = 1 - grid.columns.length * minColumnWidth;
  let next = { ...grid, columns: grid.columns.map((column, index) => ({
    ...column, width: minColumnWidth + free * weights[index] / total,
  })) };
  const visited = new Set();
  grid.columns.forEach(({ cells }, column) => {
    for (let row = 0; row < cells.length - 1; row++) {
      if (visited.has(`${column}:${row}`)) continue;
      const edges = rowBoundaryGroup(next, column, row);
      for (const [col, index] of edges) visited.add(`${col}:${index}`);
      const { min, max } = rowBoundaryRange(next, edges);
      if (max - min > 1e-8) next = replaceBoundaries(next, edges, min + (max - min) * (.18 + .64 * random()));
    }
  });
  return shuffleColors ? shuffleLayoutColors(next, random) : next;
}

export function resetPosterLayout(state) {
  const width = 1 / state.columns.length;
  const rowCount = Math.max(...state.columns.map(({ cells }) => cells.length));
  const rowBottom = (row) => (row + 1) / rowCount;
  const aligned = state.columns.every((column) => column.width === width && column.cells.length === rowCount
    && column.cells.every((cell, row) => !cell.join && cell.bottom === rowBottom(row)));
  if (aligned) return state;

  const colorById = new Map(posterCells(state).map((cell) => [cell.id, blockAccent(cell)]));
  const nextId = cellIds(state);
  const columns = state.columns.map(({ cells }) => {
    // Place existing blocks in order, as close to their old centers as room allows.
    const rows = new Map();
    let previousRow = -1;
    cells.forEach((cell, index) => {
      const top = cells[index - 1]?.bottom ?? 0;
      const preferred = Math.floor((top + cell.bottom) / 2 * rowCount);
      const row = clamp(preferred, previousRow + 1, rowCount - cells.length + index);
      rows.set(row, cell);
      previousRow = row;
    });
    const newCells = Array.from({ length: rowCount }, (_, row) => {
      const bottom = rowBottom(row);
      const cell = rows.get(row);
      if (cell && !cell.join) return { ...cell, bottom };
      const source = cell ?? cells.find((item) => item.bottom >= (row + .5) / rowCount);
      const role = colorById.get(source.join ?? source.id);
      return { id: cell?.id ?? nextId(), bottom, role, text: '' };
    });
    return { width, cells: newCells };
  });
  return { ...state, columns };
}

function sizeValue(value, mode) {
  const { min, max } = sizeLimits[mode];
  return clamp(mode === 'print' ? Math.round(value * 100) / 100 : Math.round(value), min, max);
}

export function setPreset(state, id) {
  if (!Object.hasOwn(presets, id) || id === state.preset) return state;
  const { mode, width, height } = presets[id];
  const factor = mode === state.mode ? 1 : (mode === 'print' ? 1 / pixelsPerMillimeter : pixelsPerMillimeter);
  return {
    ...state, preset: id, mode,
    width: width ?? sizeValue(state.width * factor, mode),
    height: height ?? sizeValue(state.height * factor, mode),
  };
}

export function setPosterSize(state, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return state;
  return { ...state, preset: `${state.mode}-custom`, width: sizeValue(width, state.mode), height: sizeValue(height, state.mode) };
}

export function setPosterTextPadding(state, value) {
  if (!Number.isFinite(value)) return state;
  const textPadding = clamp(value, 0, maxTextPadding);
  return textPadding === state.textPadding ? state : { ...state, textPadding };
}

export function setPosterBar(state, edge, patch) {
  if (edge !== 'top' && edge !== 'bottom') return state;
  const bars = state.bars ?? readPosterBars();
  const previous = bars[edge];
  const { heightPx, ...settings } = patch;
  const next = readPosterBar({
    ...previous, ...settings,
    ...(Number.isFinite(heightPx) && { heightPx: clamp(heightPx, 0, dimensions(state).barHeightLimit) }),
  });
  if (next.enabled === previous.enabled && next.height === previous.height
      && next.heightPx === previous.heightPx && next.mode === previous.mode) return state;
  return { ...state, bars: { ...bars, [edge]: next } };
}

export function readPoster(input, { strict = false } = {}) {
  const fallback = strict ? null : createPoster();
  if (!input || !Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > maxColumns) return fallback;
  const ids = new Set();
  const slots = new Set();
  for (const column of input.columns) {
    if (!Number.isFinite(column?.width) || column.width < minColumnWidth - 1e-8 || !Array.isArray(column.cells)
        || column.cells.length < 1 || column.cells.length > maxCellsPerColumn || column.cells.at(-1)?.bottom !== 1) return fallback;
    let top = 0;
    for (const cell of column.cells) {
      if (!cell || !/^cell-[1-9]\d{0,9}$/.test(cell.id) || ids.has(cell.id) || !Number.isFinite(cell.bottom)
          || cell.bottom - top < minCellHeight - 1e-8 || !roles.includes(cell.role) || typeof cell.text !== 'string') return fallback;
      if (cell.slot !== undefined && (!Number.isSafeInteger(cell.slot) || cell.slot < 0 || slots.has(cell.slot))) return fallback;
      if (cell.join !== undefined && (typeof cell.join !== 'string' || cell.text || cell.slot !== undefined)) return fallback;
      ids.add(cell.id);
      if (cell.slot !== undefined) slots.add(cell.slot);
      top = cell.bottom;
    }
  }
  const total = input.columns.reduce((sum, column) => sum + column.width, 0);
  if (Math.abs(total - 1) > 1e-8) return fallback;
  const mode = input.mode === 'print' ? 'print' : 'digital';
  const preset = Object.hasOwn(presets, input.preset) && presets[input.preset].mode === mode ? input.preset : `${mode}-custom`;
  const state = {
    mode, preset,
    width: sizeValue(Number.isFinite(input.width) ? input.width : presets[preset].width ?? (mode === 'print' ? 210 : 1080), mode),
    height: sizeValue(Number.isFinite(input.height) ? input.height : presets[preset].height ?? (mode === 'print' ? 297 : 1350), mode),
    scheme: input.scheme === 1 ? 1 : 2,
    bars: readPosterBars(input.bars),
    textPadding: Number.isFinite(input.textPadding) ? clamp(input.textPadding, 0, maxTextPadding) : defaultTextPadding,
    textSeed: Number.isSafeInteger(input.textSeed) ? input.textSeed >>> 0 : 0,
    columns: input.columns.map(({ width, cells }) => ({ width, cells: cells.map((cell) => {
      const text = posterCellLetter(cell.text);
      const accent = blockAccent({ ...cell, accent: accents.includes(cell.accent) ? cell.accent : undefined });
      const block = cell.block === 'text' || cell.block === 'color' ? cell.block : undefined;
      return {
        id: cell.id, bottom: cell.bottom, text, role: text ? 'background' : accent,
        slot: text ? cell.slot : undefined, join: cell.join, block, accent,
      };
    }) })),
  };
  const spans = new Map();
  for (const cell of gridCells(state)) {
    if (!cell.join) {
      spans.set(cell.id, { y: cell.y, height: cell.height, columnEnd: cell.column });
      continue;
    }
    const span = spans.get(cell.join);
    if (!span || span.columnEnd + 1 !== cell.column || Math.abs(span.y - cell.y) > 1e-8
        || Math.abs(span.height - cell.height) > 1e-8) return fallback;
    span.columnEnd = cell.column;
  }
  const previousCopy = typeof input.copy === 'string' ? input.copy : readingOrder(state).map((cell) => cell.text).join('');
  state.copy = uppercasePosterText(previousCopy);
  if (graphemes(previousCopy).length !== graphemes(state.copy).length) return placeCopy(state, state.copy);
  return state;
}
