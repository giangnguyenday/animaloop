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
const maxBarPercent = 45;
const autoTextPaddingFraction = .02;
const legacyDefaultTextPadding = 1;
const defaultIWidthCompensation = 100;
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
    columns, oplas, textPaddingPx: null, iWidthCompensation: defaultIWidthCompensation, bars: readPosterBars(),
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

function textGeometry(state) {
  const anchors = new Map(posterCells(state).map((cell) => [cell.id, cell]));
  const merged = new Set(state.columns.flatMap(({ cells }) => cells.map(({ join }) => join).filter(Boolean)));
  return state.columns.map(({ cells }) => cells.map((cell, row) => ({
    ...cell, row, top: cells[row - 1]?.bottom ?? 0,
    isText: !!(anchors.get(cell.join ?? cell.id)?.text || anchors.get(cell.join ?? cell.id)?.block === 'text'),
    merged: !!cell.join || merged.has(cell.id),
  })));
}

function textColumnProfile(rows) {
  // Color merge edges stay fixed. Text merge edges are shared anchors solved below.
  const edges = new Set([0, rows.length]);
  rows.forEach((cell, row) => { if (cell.merged && !cell.isText) { edges.add(row); edges.add(row + 1); } });
  const stops = [...edges].sort((a, b) => a - b);
  const segments = stops.slice(1).map((end, index) => {
    const start = stops[index];
    const cells = rows.slice(start, end);
    const top = cells[0].top;
    const bottom = cells.at(-1).bottom;
    const textCount = cells.filter(({ isText }) => isText).length;
    const colorCount = cells.length - textCount;
    return { start, end, cells, top, bottom, textCount, colorCount };
  });
  const texts = rows.filter(({ isText }) => isText);
  const limits = segments.filter(({ textCount }) => textCount).map((segment) =>
    (segment.bottom - segment.top - segment.colorCount * minCellHeight) / segment.textCount);
  const fixed = segments.filter(({ textCount, colorCount }) => textCount && !colorCount)
    .map(({ top, bottom, textCount }) => (bottom - top) / textCount);
  return {
    rows, segments, texts,
    max: Math.max(minCellHeight, Math.min(1, ...limits)),
    fixed: fixed[0],
    compatible: fixed.every((height) => Math.abs(height - fixed[0]) < 1e-8),
  };
}

function fillColorGap(cells, first, last, top, bottom, output) {
  if (first >= last) return;
  const count = last - first;
  const room = Math.max(0, bottom - top - count * minCellHeight);
  const weights = cells.slice(first, last).map((cell) => Math.max(0, cell.bottom - cell.top - minCellHeight));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = top;
  for (let row = first; row < last; row++) {
    cursor += minCellHeight + room * (total > 1e-12 ? weights[row - first] / total : 1 / count);
    output[row] = { ...output[row], bottom: row === last - 1 ? bottom : cursor };
  }
}

function fitTextColumn(column, profile, height, anchors = new Map()) {
  if (!profile.compatible || (profile.fixed !== undefined && Math.abs(profile.fixed - height) > 1e-8)) return column;
  const output = [...column.cells];
  for (const segment of profile.segments) {
    if (!segment.textCount) continue;
    const runs = [];
    for (let row = segment.start; row < segment.end; row++) {
      if (!profile.rows[row].isText) continue;
      const start = row;
      while (row + 1 < segment.end && profile.rows[row + 1].isText) row++;
      const end = row + 1;
      const top = profile.rows[start].top;
      const bottom = profile.rows[end - 1].bottom;
      runs.push({ start, end, count: end - start, desired: (top + bottom - (end - start) * height) / 2 });
    }
    let used = 0;
    const lower = runs.map((run) => {
      const value = segment.top + used * height + (run.start - segment.start - used) * minCellHeight;
      used += run.count;
      return value;
    });
    used = 0;
    const upper = runs.map((run) => {
      const remaining = segment.textCount - used;
      const value = segment.bottom - remaining * height
        - (segment.end - run.start - remaining) * minCellHeight;
      used += run.count;
      return value;
    });
    // A run at an artboard/merge edge has no color gap to absorb movement.
    if (runs[0].start === segment.start) upper[0] = lower[0] = segment.top;
    if (runs.at(-1).end === segment.end) upper[runs.length - 1] = lower[runs.length - 1]
      = segment.bottom - runs.at(-1).count * height;
    for (let index = 0; index < runs.length; index++) {
      const run = runs[index];
      let anchoredTop;
      for (let row = run.start; row < run.end; row++) {
        const cell = profile.rows[row];
        const value = anchors.get(cell.join ?? cell.id);
        if (value === undefined) continue;
        const top = value - (row - run.start) * height;
        if (anchoredTop !== undefined && Math.abs(top - anchoredTop) > 1e-8) return column;
        anchoredTop = top;
      }
      if (anchoredTop === undefined) continue;
      if (anchoredTop < lower[index] - 1e-8 || anchoredTop > upper[index] + 1e-8) return column;
      lower[index] = upper[index] = anchoredTop;
    }
    for (let index = 1; index < runs.length; index++) lower[index] = Math.max(lower[index], lower[index - 1]
      + runs[index - 1].count * height + (runs[index].start - runs[index - 1].end) * minCellHeight);
    for (let index = runs.length - 2; index >= 0; index--) upper[index] = Math.min(upper[index], upper[index + 1]
      - runs[index].count * height - (runs[index + 1].start - runs[index].end) * minCellHeight);
    if (lower.some((value, index) => value > upper[index] + 1e-8)) return column;
    const positions = runs.map((run, index) => clamp(run.desired, lower[index], upper[index]));
    for (let index = 1; index < runs.length; index++) positions[index] = Math.max(positions[index], positions[index - 1]
      + runs[index - 1].count * height + (runs[index].start - runs[index - 1].end) * minCellHeight);
    for (let index = runs.length - 2; index >= 0; index--) positions[index] = Math.min(positions[index], positions[index + 1]
      - runs[index].count * height - (runs[index + 1].start - runs[index].end) * minCellHeight);
    let row = segment.start;
    let cursor = segment.top;
    runs.forEach((run, index) => {
      fillColorGap(profile.rows, row, run.start, cursor, positions[index], output);
      for (let textRow = run.start; textRow < run.end; textRow++) {
        output[textRow] = { ...output[textRow], bottom: positions[index] + (textRow - run.start + 1) * height };
      }
      row = run.end;
      cursor = positions[index] + run.count * height;
    });
    fillColorGap(profile.rows, row, segment.end, cursor, segment.bottom, output);
    output[segment.end - 1] = { ...output[segment.end - 1], bottom: segment.bottom };
  }
  if (output.every((cell, row) => Math.abs(cell.bottom - column.cells[row].bottom) < 1e-10)) return column;
  return { ...column, cells: output };
}

function textHeightGroups(geometry) {
  const parents = geometry.map((_, index) => index);
  const root = (index) => parents[index] === index ? index : (parents[index] = root(parents[index]));
  const joins = new Map();
  geometry.forEach((rows, column) => rows.forEach((cell) => {
    if (!cell.isText || !cell.merged) return;
    const id = cell.join ?? cell.id;
    if (joins.has(id)) parents[root(column)] = root(joins.get(id));
    else joins.set(id, column);
  }));
  const groups = new Map();
  geometry.forEach((rows, column) => {
    if (!rows.some(({ isText }) => isText)) return;
    const key = root(column);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(column);
  });
  return [...groups.values()];
}

function textHeightContext(state) {
  const geometry = textGeometry(state);
  return { geometry, profiles: geometry.map(textColumnProfile), groups: textHeightGroups(geometry) };
}

function solveTextAnchors(context, group, height, selected) {
  const ids = new Map();
  const desired = [];
  for (const column of group) for (const cell of context.geometry[column]) {
    if (!cell.isText || (!cell.merged && cell.id !== selected?.id)) continue;
    const id = cell.join ?? cell.id;
    if (!ids.has(id)) {
      ids.set(id, ids.size + 1);
      desired.push([id, (cell.top + cell.bottom - height) / 2]);
    }
  }
  const count = ids.size + 1;
  const distance = Array.from({ length: count }, (_, index) => Array.from({ length: count }, (__, other) => index === other ? 0 : Infinity));
  const slope = Array.from({ length: count }, () => Array(count).fill(0));
  const edge = (first, second, value, derivative) => {
    if (value >= distance[first][second]) return;
    distance[first][second] = value;
    slope[first][second] = derivative;
  };
  const bound = (first, second, min, max, minSlope = 0, maxSlope = 0) => {
    edge(first, second, max, maxSlope);
    edge(second, first, -min, -minSlope);
  };
  for (const column of group) for (const segment of context.profiles[column].segments) {
    const texts = segment.cells.filter(({ isText }) => isText);
    const anchors = texts.map((cell, ordinal) => ({ cell, ordinal, node: ids.get(cell.join ?? cell.id) })).filter(({ node }) => node);
    for (const { cell, ordinal, node } of anchors) {
      const colorsBefore = cell.row - segment.start - ordinal;
      const colorsAfter = segment.end - cell.row - (texts.length - ordinal);
      const min = segment.top + ordinal * height + colorsBefore * minCellHeight;
      const max = segment.bottom - (texts.length - ordinal) * height - colorsAfter * minCellHeight;
      bound(0, node, colorsAfter ? min : max, colorsBefore ? max : min,
        colorsAfter ? ordinal : -(texts.length - ordinal), colorsBefore ? -(texts.length - ordinal) : ordinal);
    }
    for (let index = 1; index < anchors.length; index++) {
      const before = anchors[index - 1];
      const after = anchors[index];
      const textCount = after.ordinal - before.ordinal;
      const colors = after.cell.row - before.cell.row - textCount;
      const min = textCount * height + colors * minCellHeight;
      bound(before.node, after.node, min, colors ? Infinity : min, textCount, colors ? 0 : textCount);
    }
  }
  if (selected) {
    const cell = context.geometry.flat().find((item) => item.id === selected.id);
    const value = selected.edge === 'top' ? cell.bottom - height : cell.top;
    const derivative = selected.edge === 'top' ? -1 : 0;
    bound(0, ids.get(selected.id), value, value, derivative, derivative);
  }
  for (let middle = 0; middle < count; middle++) for (let first = 0; first < count; first++) {
    if (!Number.isFinite(distance[first][middle])) continue;
    for (let second = 0; second < count; second++) {
      const value = distance[first][middle] + distance[middle][second];
      if (value < distance[first][second]) {
        distance[first][second] = value;
        slope[first][second] = slope[first][middle] + slope[middle][second];
      }
    }
  }
  const infeasible = distance.map((row, index) => ({ value: row[index], derivative: slope[index][index] }))
    .filter(({ value }) => value < -1e-12);
  if (infeasible.length) {
    let min = -Infinity;
    let max = Infinity;
    for (const { value, derivative } of infeasible) {
      if (Math.abs(derivative) < 1e-12) return { infeasible: true, min: 1, max: 0 };
      const limit = height - value / derivative;
      if (derivative > 0) min = Math.max(min, limit);
      else max = Math.min(max, limit);
    }
    return { infeasible: true, min, max };
  }
  const addEdge = (first, second, value) => {
    if (value >= distance[first][second]) return;
    for (let from = 0; from < count; from++) for (let to = 0; to < count; to++) {
      distance[from][to] = Math.min(distance[from][to], distance[from][first] + value + distance[second][to]);
    }
  };
  const positions = new Map();
  for (const [id, preferred] of desired) {
    const node = ids.get(id);
    const value = clamp(preferred, -distance[node][0], distance[0][node]);
    positions.set(id, value);
    addEdge(0, node, value);
    addEdge(node, 0, -value);
  }
  return positions;
}

function groupHeightLimits(context, group) {
  const profiles = group.map((column) => context.profiles[column]);
  const fixed = profiles.map(({ fixed }) => fixed).filter((value) => value !== undefined);
  const max = Math.min(...profiles.map((profile) => profile.max));
  const compatible = profiles.every((profile) => profile.compatible)
    && fixed.every((height) => Math.abs(height - fixed[0]) < 1e-8);
  return { min: fixed[0] ?? minCellHeight, max: fixed[0] ?? max, compatible: compatible && (fixed[0] ?? minCellHeight) <= max + 1e-8 };
}

function textHeightSolution(context, group, requested, selected) {
  const limits = groupHeightLimits(context, group);
  if (!limits.compatible) return null;
  let min = limits.min;
  let max = limits.max;
  let height;
  let anchors;
  for (let attempt = 0; attempt < 48; attempt++) {
    height = clamp(requested, min, max);
    anchors = solveTextAnchors(context, group, height, selected);
    if (!anchors.infeasible) break;
    min = Math.max(min, anchors.min);
    max = Math.min(max, anchors.max);
    if (min > max + 1e-10) return null;
    if (min > max) min = max = (min + max) / 2;
  }
  return anchors.infeasible ? null : { height, anchors };
}

function fitTextGroup(state, context, group, requested, selected) {
  const solution = textHeightSolution(context, group, requested, selected);
  if (!solution) return state;
  const { height, anchors } = solution;
  const columns = [...state.columns];
  for (const column of group) columns[column] = fitTextColumn(columns[column], context.profiles[column], height, anchors);
  return columns.every((column, index) => column === state.columns[index]) ? state : { ...state, columns };
}

// Merged text connects its columns into one height group; color gaps absorb the difference.
export function normalizeTextBlockHeights(state, { random } = {}) {
  const context = textHeightContext(state);
  let next = state;
  for (const group of context.groups) {
    const texts = group.flatMap((column) => context.profiles[column].texts);
    const average = texts.reduce((sum, cell) => sum + cell.bottom - cell.top, 0) / texts.length;
    const requested = random ? groupHeightLimits(context, group).max * (.35 + .6 * random()) : average;
    next = fitTextGroup(next, context, group, requested);
  }
  return next;
}

export function textBlockBoundaryRange(state, id, edge) {
  if (edge !== 'top' && edge !== 'bottom') return null;
  const context = textHeightContext(state);
  const column = context.geometry.findIndex((rows) => rows.some((cell) => cell.id === id));
  if (column < 0) return null;
  const cell = context.geometry[column].find((item) => item.id === id);
  if (!cell.isText) return null;
  const group = context.groups.find((columns) => columns.includes(column));
  const limits = groupHeightLimits(context, group);
  if (!limits.compatible) return null;
  const selected = { id, edge };
  const low = textHeightSolution(context, group, limits.min, selected);
  const high = textHeightSolution(context, group, limits.max, selected);
  if (!low || !high) return null;
  const opposite = edge === 'top' ? cell.bottom : cell.top;
  return edge === 'top' ? { min: opposite - high.height, max: opposite - low.height }
    : { min: opposite + low.height, max: opposite + high.height };
}

// The selected block holds its opposite edge. Other text runs grow around their centers;
// runs touching the top or bottom stay attached to that edge and grow in one direction.
export function resizeTextBlock(state, id, edge, position) {
  if (!Number.isFinite(position) || (edge !== 'top' && edge !== 'bottom')) return state;
  const context = textHeightContext(state);
  const column = context.geometry.findIndex((rows) => rows.some((cell) => cell.id === id));
  if (column < 0) return state;
  const cell = context.geometry[column].find((item) => item.id === id);
  if (!cell.isText) return state;
  const requested = edge === 'top' ? cell.bottom - position : position - cell.top;
  const group = context.groups.find((columns) => columns.includes(column));
  return fitTextGroup(state, context, group, requested, { id, edge });
}

function verticalMoveProfile(state, id) {
  const geometry = textGeometry(state);
  const location = geometry.flatMap((rows, column) => rows.map((cell) => ({ ...cell, column })));
  const selected = location.find((cell) => cell.id === id);
  if (!selected) return null;
  const members = new Map();
  for (const cell of location) {
    const key = cell.join ?? cell.id;
    if (!members.has(key)) members.set(key, []);
    members.get(key).push(cell);
  }
  const ranges = new Map();
  const pending = [selected];
  while (pending.length) {
    const cell = pending.pop();
    const previous = ranges.get(cell.column);
    if (previous && cell.row >= previous.start && cell.row < previous.end) continue;
    let start = Math.min(cell.row, previous?.start ?? cell.row);
    let end = Math.max(cell.row + 1, previous?.end ?? cell.row + 1);
    const rows = geometry[cell.column];
    if (selected.isText) {
      while (start && rows[start - 1].isText) start--;
      while (end < rows.length && rows[end].isText) end++;
    }
    ranges.set(cell.column, { start, end });
    for (let row = start; row < end; row++) {
      for (const member of members.get(rows[row].join ?? rows[row].id)) {
        if (member.column !== cell.column) pending.push(member);
      }
    }
  }
  let min = -1;
  let max = 1;
  const intervals = [...ranges].map(([column, range]) => {
    const rows = geometry[column];
    let before = range.start;
    let after = range.end;
    while (before && !rows[before - 1].isText && !rows[before - 1].merged) before--;
    while (after < rows.length && !rows[after].isText && !rows[after].merged) after++;
    const top = rows[range.start].top;
    const bottom = rows[range.end - 1].bottom;
    const availableAbove = top - (rows[before]?.top ?? 0) - (range.start - before) * minCellHeight;
    const availableBelow = (rows[after - 1]?.bottom ?? bottom) - bottom - (after - range.end) * minCellHeight;
    const movable = before < range.start && after > range.end;
    min = Math.max(min, movable ? -Math.max(0, availableAbove) : 0);
    max = Math.min(max, movable ? Math.max(0, availableBelow) : 0);
    return { column, ...range, before, after, top, bottom, rows };
  });
  return { min, max, intervals };
}

export function blockVerticalRange(state, id) {
  const profile = verticalMoveProfile(state, id);
  return profile ? { min: profile.min, max: profile.max } : { min: 0, max: 0 };
}

export function canMoveBlockVertically(state, id) {
  const { min, max } = blockVerticalRange(state, id);
  return max - min > 1e-8;
}

// Translate text runs without stretching any letter, taking space from color gaps.
export function moveBlockVertically(state, id, delta) {
  if (!Number.isFinite(delta)) return state;
  const profile = verticalMoveProfile(state, id);
  if (!profile) return state;
  const movement = clamp(delta, profile.min, profile.max);
  if (Math.abs(movement) < 1e-10) return state;
  const columns = [...state.columns];
  for (const interval of profile.intervals) {
    const { column, start, end, before, after, top, bottom, rows } = interval;
    const cells = [...columns[column].cells];
    fillColorGap(rows, before, start, rows[before].top, top + movement, cells);
    for (let row = start; row < end; row++) cells[row] = { ...cells[row], bottom: rows[row].bottom + movement };
    fillColorGap(rows, end, after, bottom + movement, rows[after - 1].bottom, cells);
    columns[column] = { ...columns[column], cells };
  }
  return { ...state, columns };
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

export function randomizeLayout(state, random = Math.random, { keepColumns = true, shuffleColors = false, linkTextHeights = true } = {}) {
  const changedGrid = keepColumns ? state : varyColumnCount(state, random);
  const grid = linkTextHeights ? normalizeTextBlockHeights(changedGrid) : changedGrid;
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
  if (linkTextHeights) {
    next = normalizeTextBlockHeights(next, { random });
    const consistent = textGeometry(next).every((rows) => {
      const heights = rows.filter(({ isText }) => isText).map(({ top, bottom }) => bottom - top);
      return !heights.length || Math.max(...heights) - Math.min(...heights) < 1e-8;
    });
    // A merged color barrier can leave no room for a new shared text height.
    // Retain the valid row arrangement in that case, while still shuffling column widths.
    if (!consistent) next = { ...next, columns: next.columns.map((column, index) => ({ ...column, cells: grid.columns[index].cells })) };
  }
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

export function maxPosterTextPadding(viewWidth) {
  return Math.floor(viewWidth / 2);
}

export function posterTextPaddingPixels(state, viewWidth = dimensions(state).viewWidth) {
  if (state.textPaddingPx == null) return Math.round(viewWidth * autoTextPaddingFraction);
  return Math.min(state.textPaddingPx, maxPosterTextPadding(viewWidth));
}

export function setPosterTextPadding(state, value) {
  if (value !== null && !Number.isFinite(value)) return state;
  const textPaddingPx = value === null ? null : clamp(Math.round(value), 0, maxPosterTextPadding(dimensions(state).viewWidth));
  return textPaddingPx === state.textPaddingPx ? state : { ...state, textPaddingPx };
}

function readPosterTextPadding(input, state) {
  if (Object.hasOwn(input, 'textPaddingPx')) {
    return Number.isFinite(input.textPaddingPx) ? Math.max(0, Math.round(input.textPaddingPx)) : null;
  }
  const { textPadding } = input;
  if (!Number.isFinite(textPadding) || textPadding === legacyDefaultTextPadding) return null;
  const { viewWidth } = dimensions(state);
  return clamp(Math.round(viewWidth * textPadding / 100), 0, maxPosterTextPadding(viewWidth));
}

function readIWidthCompensation(value) {
  return Number.isFinite(value) ? clamp(Math.round(value), 0, 100) : defaultIWidthCompensation;
}

export function setPosterIWidthCompensation(state, value) {
  if (!Number.isFinite(value)) return state;
  const iWidthCompensation = readIWidthCompensation(value);
  return iWidthCompensation === state.iWidthCompensation ? state : { ...state, iWidthCompensation };
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
    iWidthCompensation: readIWidthCompensation(input.iWidthCompensation),
    bars: readPosterBars(input.bars),
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
  state.textPaddingPx = readPosterTextPadding(input, state);
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
