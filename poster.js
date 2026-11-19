import {
  createPoster, resetPosterGrid, readPoster, posterCells, posterText, setPosterText, graphemes,
  uppercasePosterText, posterCellLetter,
  dimensions, presets, schemes, sizeLimits, printPpi, setPreset, setPosterSize,
  posterTextPaddingPixels, maxPosterTextPadding, setPosterTextPadding, setPosterIWidthCompensation,
  setPosterBar,
  maxColumns, setColumnCount, moveColumnBoundary, moveRowBoundary, canMoveRowBoundary, rowBoundarySnapTargets,
  splitCell, canSplitCell, mergeCells, canMergeCells, deleteCell, canDeleteCell, updateCell, setBlockRole, swapPosterBlocks,
  randomizeLayout, resetPosterLayout, randomizeTextPositions, clearTextBlocks,
} from './poster-model.js?v=i-width';
import { loadPosterFont, renderPoster, renderPosterBars } from './poster-render.js?v=column-type-exports';
import { importPosterContent, readPosterContent, renderPosterContent } from './poster-content.js?v=column-type-exports';
import { bindPosterContent } from './poster-content-editor.js?v=column-type-exports';
import { exportPosterLoop } from './poster-animation-export.js';
import { posterLoopDuration } from './poster-loop-timing.js';
import { loadPalette } from './palette.js';
import { loadPosterDraft, savePosterDraft } from './poster-storage.js';
import { download, setPngDensity, svgToPng } from './image-export.js';
import { bindActionMenus, bindProjectFiles } from './project-menu.js';
import { cycles, cycleLabels, poseLabels } from './motion.js';
import {
  loadPosterOplaRig, readPosterOplas, createPosterOpla, updatePosterOpla, posterOplaCapacity,
  createPosterOplaLayers, mountPosterOplaLayers, duplicatePosterOpla, minPosterOplaSize, maxPosterOplaSize,
  shufflePosterOplaCapacity, shufflePosterOplas,
} from './poster-opla.js?v=column-type-exports';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const oplaTransform = $('poster-opla-transform');
const svgNamespace = 'http://www.w3.org/2000/svg';
const storageKey = 'animaloop-poster-v1';
const viewKey = 'animaloop-poster-view-v1';
const exportButtons = {
  png: $('export-png'),
  'png-1-5': $('export-png-1-5'),
  'png-2': $('export-png-2'),
  'png-3': $('export-png-3'),
  outline: $('export-svg-outline'),
  text: $('export-svg-text'),
  gif: $('export-gif'),
  video: $('export-video'),
};
const pngScales = { png: 1, 'png-1-5': 1.5, 'png-2': 2, 'png-3': 3 };
const animatedExports = new Set(['gif', 'video']);
const undo = [];
const redo = [];
const selectedIds = new Set();
const swappedAccents = { accentA: 'accentB', accentB: 'accentA' };
const oplaCorners = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const posterClipboardPrefix = 'ANIMALOOP Poster Opla: ';
const oplaClipboardPrefix = 'ANIMALOOP Opla: ';
const tabButtons = [...document.querySelectorAll('[data-poster-tab]')];
const cellEditor = $('poster-cell-editor');
const barEdges = ['top', 'bottom'];
const editorOptions = [
  'poster-ruler', 'poster-guides', 'poster-show-coordinates', 'poster-workspace-dots', 'poster-show-text-order',
  'poster-random-lock-columns', 'poster-random-shuffle-colors', 'poster-random-jumble-grid',
];
let state = createPoster();
let contentPalette;
try {
  const saved = await loadPosterDraft(storageKey);
  if (saved) {
    const input = JSON.parse(saved);
    state = readPoster(input);
    state = {
      ...state,
      oplas: readPosterOplas(state.oplas ?? input?.oplas, posterCells(state)),
      content: readPosterContent(input?.content),
      backgroundImage: readBackgroundImage(input?.backgroundImage),
    };
  }
} catch { /* Open the sample if the saved poster is unavailable. */ }
try {
  const view = JSON.parse(localStorage.getItem(viewKey));
  for (const id of editorOptions) if (typeof view?.[id] === 'boolean') $(id).checked = view[id];
} catch { /* Use the default view settings. */ }

let focusedCellId;
let activeTab = 'artboard';
let zoom = 1;
let fontReady = false;
let exportJob;
let pendingEdit;
let backgroundImageRequest = 0;
let drag;
let statusTimer;
let oplaRig;
let oplaRigError;
let oplaPreview;
let activeOplaId = '';
let oplaTime = 0;
let oplaPlaying = false;
let animationFrame = 0;
let lastAnimationTime;
const oplaDraft = {
  count: 1, fit: 'fit', layer: 'over', size: 1, x: 0, y: 0, rotation: 0,
  mode: 'pose', pose: 'neutral', cycle: 'stroll', scale: 'same',
};
const contentEditor = bindPosterContent({
  stage,
  getObjects: () => state.content ?? [],
  getLayout: () => {
    const { viewWidth, viewHeight } = dimensions(state);
    const { text, background, accentA, accentB, opla } = schemes[state.scheme];
    const palette = contentPalette ?? [
      { name: 'First accent', color: accentA },
      { name: 'Second accent', color: accentB },
      { name: 'Text', color: text },
      { name: 'Background', color: background },
      { name: 'Opla', color: opla },
    ];
    return { width: viewWidth, height: viewHeight, textColor: text, palette };
  },
  isActive: () => activeTab === 'layout',
  apply: (content, source) => apply({ ...state, content }, source),
  finishEdit, cancelEdit, notify,
});

function svg(name, attributes) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function notify(message, duration = 3500) {
  clearTimeout(statusTimer);
  $('status').textContent = message;
  if (duration) statusTimer = setTimeout(() => { $('status').textContent = ''; }, duration);
}

function save() {
  void savePosterDraft(storageKey, JSON.stringify(state)).catch(() => {
    notify('Browser storage is unavailable. Use Project → Save to keep an editable copy.');
  });
}

function readBackgroundImage(input) {
  if (!input || typeof input !== 'object') return undefined;
  const [image] = readPosterContent([{ id: 'background-image', type: 'image', name: input.name, source: input.source }]);
  if (image) return { name: image.name, source: image.source };
}

function layout(poster) {
  const size = dimensions(poster);
  const scheme = schemes[poster.scheme];
  return {
    width: size.viewWidth,
    height: size.viewHeight,
    barHeights: size.barHeights,
    background: scheme.background,
    backgroundImage: poster.backgroundImage?.source,
    textColor: scheme.text,
    textPaddingPx: posterTextPaddingPixels(poster, size.viewWidth),
    iWidthCompensation: poster.iWidthCompensation,
    oplaColor: scheme.opla,
    cells: posterCells(poster).map((cell) => ({
      ...cell,
      color: poster.backgroundImage && !isTextBlock(cell) ? 'none' : scheme[cell.role],
    })),
  };
}

function mountOplas(target, { cells, oplaColor }, placements, seconds) {
  if (!oplaRig || !placements?.length) return;
  const layers = createPosterOplaLayers(oplaRig, cells, placements, oplaColor);
  if (!layers) return;
  mountPosterOplaLayers(target, layers);
  layers.update(seconds);
  return layers;
}

function selectedOpla() {
  return (state.oplas ?? []).find(({ id }) => id === activeOplaId);
}

function selectOplaPlacement(id) {
  activeOplaId = id;
  const placement = selectedOpla();
  if (placement) {
    selectedIds.clear();
    for (const cellId of placement.cellIds) selectedIds.add(cellId);
  }
  refresh();
}

function placementCenter({ x, y, width, height }) {
  return { x: x + width / 2, y: y + height / 2 };
}

function renderOplaTransform() {
  const geometry = activeTab === 'opla' && oplaPreview?.placementGeometry.get(activeOplaId);
  oplaTransform.replaceChildren();
  if (!geometry) return;
  const { bounds } = geometry;
  const center = placementCenter(bounds);
  const rotation = selectedOpla().rotation;
  const screen = stage.getScreenCTM();
  if (!screen) return;
  const unit = 1 / Math.hypot(screen.a, screen.b);
  if (!Number.isFinite(unit)) return;
  oplaTransform.setAttribute('viewBox', stage.getAttribute('viewBox'));
  const handles = svg('g', { transform: `rotate(${rotation} ${center.x} ${center.y})` });
  handles.append(svg('rect', { class: 'selection-box', ...bounds }));
  for (const [corner, [horizontal, vertical]] of Object.entries(oplaCorners)) {
    handles.append(svg('rect', {
      class: 'scale-handle poster-opla-scale-handle',
      'data-opla-corner': corner, 'data-corner': corner,
      x: center.x + horizontal * bounds.width / 2 - 4 * unit,
      y: center.y + vertical * bounds.height / 2 - 4 * unit,
      width: 8 * unit,
      height: 8 * unit,
    }));
  }
  const handleY = bounds.y - 24 * unit;
  handles.append(
    svg('line', { class: 'rotation-stem', x1: center.x, y1: bounds.y, x2: center.x, y2: handleY }),
    svg('circle', { class: 'rotation-handle', 'data-opla-rotation': '', cx: center.x, cy: handleY, r: 5 * unit }),
  );
  oplaTransform.append(handles);
}

function updateOplaTransport() {
  const placement = selectedOpla();
  const preview = $('poster-opla-preview');
  preview.disabled = !oplaPreview?.animated;
  preview.setAttribute('aria-pressed', String(oplaPlaying));
  preview.textContent = oplaPlaying ? 'Pause' : 'Play';
  if (placement?.mode !== 'animate') return;
  const duration = cycles[placement.cycle].duration;
  const phase = Math.min(100, Math.round(100 * (oplaTime % duration) / duration));
  if (oplaPlaying || document.activeElement !== $('poster-opla-phase')) $('poster-opla-phase').value = phase;
  $('poster-opla-phase-value').textContent = `${phase}%`;
}

function advanceOplaPreview(now) {
  animationFrame = 0;
  if (!oplaPlaying || !oplaPreview?.animated) return;
  if (lastAnimationTime !== undefined) oplaTime += Math.min(.05, (now - lastAnimationTime) / 1000);
  lastAnimationTime = now;
  oplaPreview.update(oplaTime);
  if (activeTab === 'opla') updateOplaTransport();
  animationFrame = requestAnimationFrame(advanceOplaPreview);
}

function syncOplaPlayback() {
  if (!oplaPreview?.animated) oplaPlaying = false;
  if (oplaPlaying && !animationFrame) {
    lastAnimationTime = undefined;
    animationFrame = requestAnimationFrame(advanceOplaPreview);
  } else if (!oplaPlaying && animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
}

function updateOplaControls(cells) {
  const placements = state.oplas ?? [];
  $('poster-clear-oplas').disabled = !placements.length;
  const shuffleCapacity = shufflePosterOplaCapacity(cells);
  const amount = $('poster-shuffle-opla-amount');
  amount.max = Math.max(1, shuffleCapacity);
  if (shuffleCapacity && amount.valueAsNumber > shuffleCapacity) amount.value = shuffleCapacity;
  amount.disabled = !oplaRig || !shuffleCapacity;
  $('poster-shuffle-opla').disabled = amount.disabled;
  $('poster-shuffle-opla-capacity').textContent = shuffleCapacity
    ? `${shuffleCapacity} color ${shuffleCapacity === 1 ? 'block' : 'blocks'}` : 'No color blocks';

  const placement = selectedOpla();
  if (!placement) activeOplaId = '';
  const ids = placement?.cellIds ?? [...selectedIds];
  const capacity = posterOplaCapacity(placements, cells, ids, placement?.id);
  const options = placement ?? oplaDraft;
  const menu = $('poster-opla-placement');
  const labels = new Map(cells.map((cell) => [cell.id, cellAddress(cell)]));
  menu.replaceChildren(new Option('New placement', ''), ...placements.map((item, index) => new Option(
    `Opla ${index + 1} · ${item.cellIds.length === 1 ? 'Block' : 'Blocks'} ${item.cellIds.map((id) => labels.get(id)).join(', ')}`, item.id,
  )));
  menu.value = activeOplaId;

  $('poster-opla-selection').textContent = oplaRigError ? 'Opla artwork could not load.'
    : !ids.length ? 'Select a color block or Shift-click neighboring color blocks.'
      : !capacity ? 'Select connected color blocks with room for Opla.'
        : `${ids.length} ${ids.length === 1 ? 'block' : 'blocks'} · ${capacity} Opla capacity`;
  $('poster-opla-add').disabled = !oplaRig || !capacity || !!placement;
  $('poster-opla-remove').disabled = !placement;

  const counts = $('poster-opla-count');
  for (const option of counts.options) option.disabled = Number(option.value) > (capacity || 3);
  counts.value = Math.min(options.count, capacity || 3);
  for (const key of ['fit', 'layer', 'mode', 'cycle', 'scale']) $(`poster-opla-${key}`).value = options[key];
  const pose = $('poster-opla-pose');
  const frameOption = pose.querySelector('option[value="__frame"]');
  if (options.frame && !frameOption) pose.append(new Option('Custom pose', '__frame'));
  else if (!options.frame) frameOption?.remove();
  pose.value = options.frame ? '__frame' : options.pose;
  $('poster-opla-rotation').value = Math.round(options.rotation) % 360;
  for (const key of ['size', 'x', 'y']) {
    const value = Math.round(100 * options[key]);
    $(`poster-opla-${key}`).value = value;
    $(`poster-opla-${key}-value`).textContent = `${value}%`;
  }
  $('poster-opla-pose-field').hidden = options.mode !== 'pose';
  $('poster-opla-cycle-field').hidden = options.mode !== 'animate';
  $('poster-opla-phase-field').hidden = placement?.mode !== 'animate';
  $('poster-opla-scale-field').hidden = Number(counts.value) < 2;
  updateOplaTransport();
}

function changeOplaOptions(patch, source) {
  const placement = selectedOpla();
  if (!placement) {
    Object.assign(oplaDraft, patch);
    updateOplaControls(posterCells(state));
    return;
  }
  const capacity = posterOplaCapacity(state.oplas, posterCells(state), placement.cellIds, placement.id);
  const updated = updatePosterOpla(placement, patch, capacity);
  if (Object.keys(patch).every((key) => updated[key] === placement[key])) return;
  if (patch.mode === 'animate') oplaPlaying = true;
  apply({ ...state, oplas: state.oplas.map((item) => item.id === placement.id ? updated : item) }, source);
}

function copyPosterPlacement(source, ids, offset = 20, editSource) {
  const placements = state.oplas ?? [];
  const cells = posterCells(state);
  const duplicate = duplicatePosterOpla(placements, cells, source, ids);
  if (!duplicate) {
    notify('Select connected color blocks with room for this placement.');
    return;
  }
  const targets = cells.filter(({ id }) => duplicate.cellIds.includes(id));
  const width = Math.max(...targets.map((cell) => cell.x + cell.width)) - Math.min(...targets.map((cell) => cell.x));
  const height = Math.max(...targets.map((cell) => cell.y + cell.height)) - Math.min(...targets.map((cell) => cell.y));
  const placed = updatePosterOpla(duplicate, { x: duplicate.x + 2 * offset / width, y: duplicate.y + 2 * offset / height });
  activeOplaId = placed.id;
  selectedIds.clear();
  for (const id of placed.cellIds) selectedIds.add(id);
  apply({ ...state, oplas: [...placements, placed] }, editSource);
  return placed;
}

const columnLetter = (column) => String.fromCharCode(65 + column);

function cellAddress({ column, row }) {
  return `${columnLetter(column)}${row + 1}`;
}

function cellEdges(cell) {
  const { column, row } = cell;
  const rightColumn = (cell.columnEnd ?? column) + 1;
  const bottomRow = cell.rowEnd ?? row;
  return {
    rightColumn, bottomRow,
    right: rightColumn < state.columns.length,
    top: canMoveRowBoundary(state, column, row - 1),
    bottom: canMoveRowBoundary(state, column, bottomRow),
  };
}

function renderGuides(cells, selection) {
  const overlay = svg('g', { 'aria-hidden': 'true' });
  const unit = dimensions(state).viewWidth / Math.max(1, stage.clientWidth);
  if ($('poster-guides').checked) {
    for (const { x, y, width, height } of cells) {
      overlay.append(svg('rect', { class: 'poster-guide', x, y, width, height }));
    }
  }
  for (const { x, y, width, height } of selection) {
    overlay.append(svg('rect', { class: 'poster-selection', x, y, width, height }));
  }
  if (selection.length === 1 && activeTab !== 'opla' && activeTab !== 'layout') {
    const [cell] = selection;
    const { x, y, width, height } = cell;
    const right = x + width;
    const bottom = y + height;
    const edges = cellEdges(cell);
    const handle = (type, x1, y1, x2, y2) => svg('line', {
      class: 'poster-break-handle', 'data-poster-boundary': type, x1, y1, x2, y2,
    });
    if (edges.top) overlay.append(handle('top', x, y, right, y));
    if (edges.bottom) overlay.append(handle('bottom', x, bottom, right, bottom));
    if (edges.right) overlay.append(handle('column', right, y, right, bottom));
  }
  if ($('poster-show-text-order').checked) {
    for (const cell of cells) {
      if (!cell.text || !Number.isSafeInteger(cell.slot)) continue;
      const radius = Math.min(9 * unit, cell.width / 3, cell.height / 3);
      const x = cell.x + radius + unit * 2;
      const y = cell.y + radius + unit * 2;
      const marker = svg('g', { class: 'poster-text-order', transform: `translate(${x} ${y})` });
      const label = svg('text', { 'font-size': radius * 1.15 });
      label.textContent = cell.slot + 1;
      marker.append(svg('circle', { r: radius }), label);
      overlay.append(marker);
    }
  }
  stage.append(overlay);
}

function renderGridLabels({ viewHeight, gridY, gridHeight }, activeColumn) {
  const axis = $('poster-grid-labels');
  axis.hidden = !$('poster-show-coordinates').checked;
  if (axis.hidden) return;

  let left = 0;
  const columnLabels = state.columns.map(({ width }, column) => {
    const label = document.createElement('span');
    label.className = 'poster-column-label';
    label.classList.toggle('active', column === activeColumn);
    label.style.left = `${100 * (left + width / 2)}%`;
    label.textContent = columnLetter(column);
    left += width;
    return label;
  });

  // Row heights vary by column; the left axis follows the highlighted column.
  let top = 0;
  const rowLabels = state.columns[activeColumn].cells.map(({ bottom }, row) => {
    const label = document.createElement('span');
    label.className = 'poster-row-label';
    const center = gridY + (top + bottom) / 2 * gridHeight;
    label.style.top = `${100 * center / viewHeight}%`;
    label.textContent = row + 1;
    top = bottom;
    return label;
  });
  axis.replaceChildren(...columnLabels, ...rowLabels);
}

function renderPreview(poster, selection) {
  const hadFocus = document.activeElement === stage || stage.contains(document.activeElement);
  renderPoster(stage, poster);
  stage.dataset.mode = activeTab;
  const { cells } = poster;
  if (!cells.some(({ id }) => id === focusedCellId)) focusedCellId = selection[0]?.id ?? cells[0]?.id;
  stage.tabIndex = cells.length && activeTab !== 'layout' ? -1 : 0;
  for (const [index, group] of [...stage.querySelectorAll('[data-cell]')].entries()) {
    const cell = cells[index];
    const { id, text } = cell;
    group.tabIndex = activeTab !== 'layout' && id === focusedCellId ? 0 : -1;
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `Block ${cellAddress(cell)}${text ? `, ${text}` : ''}`);
    group.setAttribute('aria-pressed', String(selectedIds.has(id)));
  }
  oplaPreview = mountOplas(stage, poster, state.oplas, oplaTime);
  syncOplaPlayback();
  renderGuides(cells, selection);
  renderPosterBars(stage, poster);
  renderPosterContent(stage, state.content ?? [], poster, { interactive: activeTab === 'layout' });
  renderOplaTransform();
  if (hadFocus && activeTab === 'layout') stage.focus({ preventScroll: true });
  else if (hadFocus && focusedCellId) focusStageCell(focusedCellId);
}

function rulerStep(units, pixels) {
  const interval = 54 * units / pixels;
  const base = 10 ** Math.floor(Math.log10(interval));
  return base * ([1, 2, 5, 10].find((factor) => factor * base >= interval) ?? 10);
}

function renderRuler(id, units, pixels, vertical) {
  const ruler = $(id);
  const visible = $('poster-ruler').checked;
  ruler.toggleAttribute('hidden', !visible);
  if (!visible || pixels < 1) return;
  const thickness = 18;
  ruler.setAttribute('viewBox', vertical ? `0 0 ${thickness} ${pixels}` : `0 0 ${pixels} ${thickness}`);
  const major = rulerStep(units, pixels);
  const steps = 5;
  const ticks = [];
  const labels = [];
  for (let index = 0; index * major / steps <= units; index++) {
    const value = index * major / steps;
    const offset = value * pixels / units;
    const labeled = index % steps === 0;
    const start = labeled ? 11 : 14;
    ticks.push(vertical ? `M${start} ${offset}H${thickness}` : `M${offset} ${start}V${thickness}`);
    if (labeled && offset < pixels - 14) {
      const label = svg('text', vertical ? { transform: `translate(9 ${offset + 3}) rotate(-90)`, 'text-anchor': 'end' } : { x: offset + 3, y: 9 });
      label.textContent = Number(value.toPrecision(8));
      labels.push(label);
    }
  }
  ruler.replaceChildren(svg('path', { d: ticks.join(' '), stroke: 'currentColor', fill: 'none' }), ...labels);
}

function renderRulers(size = dimensions(state)) {
  const { clientWidth, clientHeight } = $('stage-wrap');
  renderRuler('poster-ruler-x', size.width, clientWidth, false);
  renderRuler('poster-ruler-y', size.height, clientHeight, true);
}

function updateCanvas(size = dimensions(state)) {
  const { width, height, unit, viewWidth, viewHeight } = size;
  const wrap = $('stage-wrap');
  wrap.style.setProperty('--stage-ratio', `${viewWidth} / ${viewHeight}`);
  wrap.style.setProperty('--stage-aspect', viewWidth / viewHeight);
  wrap.style.setProperty('--view-zoom', zoom);
  $('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
  $('canvas-dimensions').textContent = `${width} × ${height}`;
  $('canvas-units').textContent = unit.toUpperCase();
  $('viewport').dataset.guides = String($('poster-workspace-dots').checked);
  renderRulers(size);
}

function updateHistory() {
  const edited = pendingEdit && pendingEdit.before !== state;
  $('undo-scene').disabled = !edited && !undo.length;
  $('redo-scene').disabled = !!edited || !redo.length;
}

function updateExportButtons() {
  const animated = state.oplas?.some(({ mode }) => mode === 'animate');
  for (const [format, button] of Object.entries(exportButtons)) {
    button.disabled = !fontReady || !!exportJob || (animatedExports.has(format) && !animated);
    button.title = animatedExports.has(format) && !animated ? 'Animate an Opla to export a loop.' : '';
  }
  $('export-cancel').hidden = !exportJob;
}

function updateSizeControls(size) {
  $('poster-size-mode').value = state.mode;
  const select = $('poster-size');
  if (select.dataset.mode !== state.mode) {
    select.replaceChildren(...Object.entries(presets)
      .filter(([, choice]) => choice.mode === state.mode)
      .map(([id, choice]) => new Option(choice.label, id)));
    select.dataset.mode = state.mode;
  }
  select.value = state.preset;
  $('poster-custom-size').hidden = !state.preset.endsWith('-custom');
  for (const label of document.querySelectorAll('[data-artboard-unit]')) label.textContent = size.unit;
  const limit = sizeLimits[state.mode];
  for (const [id, value] of [['poster-width', state.width], ['poster-height', state.height]]) {
    const input = $(id);
    input.min = limit.min;
    input.max = limit.max;
    input.step = state.mode === 'print' ? 'any' : '1';
    if (input !== document.activeElement) input.value = value;
  }
}

function updateBarControls(size, source) {
  for (const edge of barEdges) {
    const bar = state.bars[edge];
    const height = $(`poster-bar-${edge}-height`);
    $(`poster-bar-${edge}-enabled`).checked = bar.enabled;
    $(`poster-bar-${edge}-controls`).hidden = !bar.enabled;
    $(`poster-bar-${edge}-mode`).value = bar.mode;
    height.max = size.barHeightLimit;
    if (source !== height) height.value = size.barHeights[edge];
  }
}

function updateBackgroundControls() {
  const { backgroundImage } = state;
  $('poster-background-add').textContent = backgroundImage ? 'Replace image' : 'Add image';
  $('poster-background-remove').disabled = !backgroundImage;
  const filename = $('poster-background-name');
  filename.hidden = !backgroundImage;
  filename.textContent = backgroundImage?.name ?? '';
}

function refresh(source) {
  const poster = layout(state);
  const size = dimensions(state);
  const { cells } = poster;
  const selection = cells.filter(({ id }) => selectedIds.has(id));
  selectedIds.clear();
  for (const { id } of selection) selectedIds.add(id);
  renderGridLabels(size, selection[0]?.column ?? 0);
  updateCanvas(size);
  if (fontReady) renderPreview(poster, selection);
  updateSizeControls(size);
  updateBackgroundControls();
  updateBarControls(size, source);
  updateHistory();
  updateExportButtons();

  const text = posterText(state);
  if (source !== $('poster-text') && $('poster-text').value !== text) $('poster-text').value = text;
  textPaddingAuto.checked = state.textPaddingPx === null;
  textPaddingInput.readOnly = textPaddingAuto.checked;
  textPaddingInput.max = maxPosterTextPadding(size.viewWidth);
  if (source !== textPaddingInput) textPaddingInput.value = poster.textPaddingPx;
  $('poster-i-width-compensation').value = state.iWidthCompensation;
  $('poster-i-width-compensation-value').textContent = `${state.iWidthCompensation}%`;
  const letterCount = graphemes(text).length;
  const placed = cells.filter((cell) => cell.text).length;
  const capacity = cells.filter((cell) => cell.block !== 'color').length;
  const overflow = Math.max(0, letterCount - placed);
  $('poster-text-capacity').textContent = `${placed}/${capacity}${overflow ? ` · ${overflow} waiting` : ''}`;
  $('poster-random-text').disabled = !letterCount && !cells.some(({ block }) => block);
  $('poster-remove-text').disabled = !text && !cells.some(({ role, block }) => role === 'background' || block === 'text');
  $('poster-scheme').value = state.scheme;
  $('poster-scheme-preview').style.setProperty('--opla-color', poster.oplaColor);
  $('poster-opla-color').style.setProperty('--opla-color', poster.oplaColor);
  $('poster-opla-color').textContent = poster.oplaColor;
  $('poster-columns').value = state.columns.length;
  $('poster-remove-column').disabled = state.columns.length <= 1;
  $('poster-add-column').disabled = state.columns.length >= maxColumns;

  updateBlockControls(cells, selection, size, source);
  updateCellEditor(selection, size);
  updateOplaControls(cells);
  contentEditor.refresh(source);
}

function updateBlockControls(cells, selection, size, source) {
  const hasSelection = selection.length > 0;
  const single = selection.length === 1;
  const [cell] = selection;
  const addresses = selection.slice(0, 5).map(cellAddress).join(', ');
  $('poster-selection').textContent = !hasSelection ? 'No blocks selected' : single ? `Block ${addresses}`
    : `${selection.length} selected · ${addresses}${selection.length > 5 ? ', …' : ''}`;
  $('poster-cell').disabled = !hasSelection;
  $('poster-cell').hidden = !hasSelection;
  $('poster-single-block').hidden = !single;
  $('poster-split-cell').disabled = !single || !canSplitCell(state, cell.id);
  $('poster-merge-cell').disabled = selection.length < 2 || !canMergeCells(state, [...selectedIds]);
  $('poster-delete-cell').disabled = !single || !canDeleteCell(state, cell.id);
  updateSwapButton(selection);
  if (!hasSelection) return;

  const allText = selection.every(isTextBlock);
  const allColor = !selection.some(isTextBlock);
  $('poster-block-text').setAttribute('aria-pressed', String(allText));
  $('poster-block-color').setAttribute('aria-pressed', String(allColor));
  $('poster-color-swatches').hidden = allText;
  for (const [id, role] of [['poster-accent-a', 'accentA'], ['poster-accent-b', 'accentB']]) {
    const color = schemes[state.scheme][role];
    $(id).style.setProperty('--swatch', color);
    $(id).setAttribute('aria-label', `Block color ${color}`);
    $(id).setAttribute('aria-pressed', String(selection.every((item) => item.role === role)));
  }
  if (!single) return;
  if (source !== $('poster-cell-text')) $('poster-cell-text').value = cell.text;
  $('poster-cell-text-field').hidden = !isTextBlock(cell);

  const { x, y, width, height } = cell;
  const edges = cellEdges(cell);
  for (const [id, fraction, disabled] of [
    ['poster-column-edge', (x + width) / size.viewWidth, !edges.right],
    ['poster-break-top', (y - size.gridY) / size.gridHeight, !edges.top],
    ['poster-break-bottom', (y + height - size.gridY) / size.gridHeight, !edges.bottom],
  ]) {
    $(id).disabled = disabled;
    $(id).value = 100 * fraction;
    $(`${id}-value`).textContent = `${+(100 * fraction).toFixed(1)}%`;
  }
}

function isTextBlock({ text, block }) {
  return !!text || block === 'text';
}

function swapAccent(cell) {
  return isTextBlock(cell) ? undefined : swappedAccents[cell.role];
}

function updateSwapButton(selection) {
  const button = $('poster-swap-colors');
  const roles = [...new Set(selection.map(swapAccent).filter(Boolean))];
  const colors = roles.map((role) => schemes[state.scheme][role]);
  const [first, second = first] = colors;
  const swatch = $('poster-swap-preview');
  const label = first ? `Swap colors to ${colors.join(' and ')}` : 'Swap colors';
  button.disabled = !first;
  button.title = label;
  button.setAttribute('aria-label', label);
  if (first) {
    swatch.style.setProperty('--swap-first', first);
    swatch.style.setProperty('--swap-second', second);
  }
}

function record(previous) {
  if (previous === state) return;
  undo.push(previous);
  if (undo.length > 50) undo.shift();
  redo.length = 0;
  save();
}

function finishEdit(source) {
  if (!pendingEdit || (source && pendingEdit.source !== source)) return;
  record(pendingEdit.before);
  pendingEdit = null;
  updateHistory();
}

function cancelEdit(source) {
  if (!pendingEdit || pendingEdit.source !== source) return;
  state = pendingEdit.before;
  pendingEdit = null;
  refresh();
}

function apply(next, source) {
  if (next === state) return;
  if (pendingEdit?.source !== source) finishEdit();
  const previous = state;
  if (source && !pendingEdit) pendingEdit = { source, before: previous };
  state = next.oplas?.length && next.columns !== previous.columns
    ? { ...next, oplas: readPosterOplas(next.oplas, posterCells(next)) } : next;
  if (!source) record(previous);
  refresh(source);
}

function restore(from, to) {
  finishEdit();
  if (!from.length) return;
  backgroundImageRequest++;
  to.push(state);
  state = from.pop();
  save();
  refresh();
}

function selectBlock(id, extend = false) {
  if (extend && !id) return;
  finishEdit();
  const remove = extend && selectedIds.has(id);
  if (!extend) selectedIds.clear();
  if (remove) selectedIds.delete(id);
  else if (id) selectedIds.add(id);
  if (id) focusedCellId = id;
  if (activeTab === 'opla') {
    const matches = !extend && id ? (state.oplas ?? []).filter(({ cellIds }) => cellIds.includes(id)) : [];
    activeOplaId = matches.length === 1 ? matches[0].id : '';
  }
  refresh();
}

function selectedCell() {
  if (selectedIds.size === 1) return posterCells(state).find(({ id }) => selectedIds.has(id));
}

function updateCellEditor(selection, size) {
  cellEditor.hidden = selection.length !== 1 || activeTab === 'opla' || activeTab === 'layout';
  if (cellEditor.hidden) return;
  const [{ x, y, width, height }] = selection;
  cellEditor.style.left = `${100 * x / size.viewWidth}%`;
  cellEditor.style.top = `${100 * y / size.viewHeight}%`;
  cellEditor.style.width = `${100 * width / size.viewWidth}%`;
  cellEditor.style.height = `${100 * height / size.viewHeight}%`;
}

function focusCellEditor() {
  if (cellEditor.hidden) return;
  cellEditor.value = '';
  cellEditor.focus({ preventScroll: true });
}

function writeCellLetter(id, letter) {
  if (!id) return;
  if (selectedIds.size !== 1 || !selectedIds.has(id)) selectBlock(id);
  apply(updateCell(state, id, { text: letter }));
}

function focusStageCell(id) {
  const element = [...stage.querySelectorAll('[data-cell]')].find((group) => group.dataset.cell === id);
  if (!element) return;
  const previous = stage.querySelector('[tabindex="0"]');
  if (previous && previous !== element) previous.tabIndex = -1;
  element.tabIndex = 0;
  element.focus({ preventScroll: true });
  focusedCellId = id;
}

function rowForBoundary(type, cell) {
  return type === 'top' ? cell.row - 1 : cell.rowEnd ?? cell.row;
}

function showRowGuide(position) {
  stage.querySelector('.poster-smart-guide')?.remove();
  if (position === undefined) return;
  const { viewWidth, gridY, gridHeight } = dimensions(state);
  const y = gridY + position * gridHeight;
  stage.append(svg('line', {
    class: 'poster-smart-guide', 'aria-hidden': 'true', x1: 0, y1: y, x2: viewWidth, y2: y,
  }));
}

function moveBoundary(type, cell, position, source, { snap = false, targets } = {}) {
  if (!cell || !Number.isFinite(position)) return;
  if (type === 'column') {
    apply(moveColumnBoundary(state, cellEdges(cell).rightColumn, position), source);
    return;
  }
  const row = rowForBoundary(type, cell);
  const transform = stage.getScreenCTM();
  const screenHeight = transform ? dimensions(state).gridHeight * Math.hypot(transform.c, transform.d) : 0;
  // Keep the snap area the same on screen at every zoom level.
  let nearest = snap && screenHeight > 0 ? 6 / screenHeight : .0005;
  let aligned;
  for (const target of targets ?? rowBoundarySnapTargets(state, cell.column, row)) {
    const distance = Math.abs(target - position);
    if (distance > nearest) continue;
    nearest = distance;
    aligned = target;
  }
  apply(moveRowBoundary(state, cell.column, row, snap ? aligned ?? position : position), source);
  showRowGuide(aligned);
}

async function exportPoster(format) {
  if (!fontReady || exportJob) return;
  finishEdit();
  const poster = state;
  const frameTime = oplaTime;
  const size = dimensions(poster);
  const animated = animatedExports.has(format);
  const pngScale = pngScales[format];
  const pixels = animated || !!pngScale;
  const button = exportButtons[format];
  button.closest('details').open = false;
  const controller = new AbortController();
  exportJob = controller;
  updateExportButtons();
  try {
    if (poster.oplas?.length) await oplaRigPromise;
    if (poster.oplas?.length && !oplaRig) throw new Error('Opla artwork is unavailable.');
    const physical = size.unit === 'mm' && !pixels;
    const output = svg('svg', {});
    const composition = layout(poster);
    renderPoster(output, composition, {
      outline: format !== 'text',
      embedFont: format === 'text',
      allowFallbackText: pixels,
      crispBlocks: true,
      width: physical ? `${size.width}mm` : size.pixelWidth,
      height: physical ? `${size.height}mm` : size.pixelHeight,
    });
    const layers = mountOplas(output, composition, poster.oplas, frameTime);
    renderPosterBars(output, composition, { crispBlocks: true });
    renderPosterContent(output, poster.content ?? [], composition, {
      outline: format !== 'text',
      allowFallbackText: pixels,
    });
    const serialize = () => new Blob([new XMLSerializer().serializeToString(output)], { type: 'image/svg+xml;charset=utf-8' });
    if (animated) {
      if (!layers?.animated) throw new Error('Animate an Opla to export a loop.');
      const duration = posterLoopDuration(poster.oplas);
      const loop = await exportPosterLoop({
        format,
        width: size.pixelWidth,
        height: size.pixelHeight,
        duration,
        signal: controller.signal,
        renderFrame(seconds) {
          layers.update(seconds, { loopDuration: duration });
          return serialize();
        },
        onProgress(progress) {
          notify(`Exporting ${format === 'gif' ? 'GIF' : 'video'} · ${Math.round(progress * 100)}%`, 0);
        },
      });
      controller.signal.throwIfAborted();
      const extension = format === 'gif' ? 'gif' : loop.type.startsWith('video/mp4') ? 'mp4' : 'webm';
      download(loop, `animaloop-poster-loop.${extension}`);
    } else if (pngScale) {
      const png = await svgToPng(serialize(), Math.round(size.pixelWidth * pngScale), Math.round(size.pixelHeight * pngScale));
      controller.signal.throwIfAborted();
      const suffix = pngScale === 1 ? '' : `@${pngScale}x`;
      download(size.unit === 'mm' ? await setPngDensity(png, printPpi * pngScale) : png, `animaloop-poster${suffix}.png`);
    } else {
      controller.signal.throwIfAborted();
      download(serialize(), `animaloop-poster-${format === 'text' ? 'text' : 'outlines'}.svg`);
    }
    notify(animated ? `${format === 'gif' ? 'GIF' : 'Video'} loop exported.` : pngScale ? 'PNG exported.' : 'SVG exported.');
  } catch (error) {
    notify(controller.signal.aborted ? 'Export canceled.' : error?.message ? `Export failed. ${error.message}` : 'Export failed.');
  } finally {
    exportJob = undefined;
    updateExportButtons();
  }
}

function bindLiveInput(id, handler) {
  const input = $(id);
  input.addEventListener('input', (event) => { if (!event.isComposing) handler(input); });
  input.addEventListener('compositionend', () => handler(input));
  input.addEventListener(input.type === 'range' ? 'change' : 'blur', () => finishEdit(input));
}

bindLiveInput('poster-text', (input) => {
  const value = input.value;
  const next = setPosterText(state, value);
  const copy = posterText(next);
  if (copy !== value) {
    const { selectionStart, selectionEnd, selectionDirection } = input;
    input.value = copy;
    input.setSelectionRange(
      uppercasePosterText(value.slice(0, selectionStart)).length,
      uppercasePosterText(value.slice(0, selectionEnd)).length,
      selectionDirection,
    );
  }
  apply(next, input);
});
const textPaddingInput = $('poster-text-padding');
const textPaddingAuto = $('poster-text-padding-auto');
textPaddingAuto.addEventListener('change', () => {
  apply(setPosterTextPadding(state, textPaddingAuto.checked ? null : posterTextPaddingPixels(state)));
});
bindLiveInput('poster-text-padding', (input) => {
  if (!input.readOnly) apply(setPosterTextPadding(state, input.valueAsNumber), input);
});
textPaddingInput.addEventListener('blur', () => { textPaddingInput.value = posterTextPaddingPixels(state); });
bindLiveInput('poster-i-width-compensation', (input) => {
  apply(setPosterIWidthCompensation(state, input.valueAsNumber), input);
});
bindLiveInput('poster-cell-text', (input) => {
  const cell = selectedCell();
  if (!cell) return;
  const [first = '', second] = graphemes(input.value);
  const firstLetter = posterCellLetter(first);
  const text = firstLetter === cell.text && second ? posterCellLetter(second) : firstLetter;
  input.value = text;
  apply(updateCell(state, cell.id, { text }), input);
});

function readCellEditor(event) {
  if (event.isComposing) return;
  const letter = graphemes(cellEditor.value)[0];
  if (letter) writeCellLetter(selectedCell()?.id, letter);
  cellEditor.value = '';
}
cellEditor.addEventListener('input', readCellEditor);
cellEditor.addEventListener('compositionend', readCellEditor);

for (const [key, labels] of [['pose', poseLabels], ['cycle', cycleLabels]]) {
  $(`poster-opla-${key}`).replaceChildren(...Object.entries(labels).map(([value, name]) => new Option(name, value)));
}
for (const key of ['count', 'fit', 'layer', 'mode', 'pose', 'cycle', 'scale']) {
  $(`poster-opla-${key}`).addEventListener('change', (event) => {
    const value = event.target.value;
    if (value === '__frame') return;
    const patch = { [key]: key === 'count' ? Number(value) : value };
    if (key === 'pose') Object.assign(patch, { frame: undefined, flip: false });
    changeOplaOptions(patch);
  });
}
$('poster-opla-rotation').addEventListener('change', (event) => {
  if (Number.isFinite(event.target.valueAsNumber)) changeOplaOptions({ rotation: event.target.valueAsNumber });
  updateOplaControls(posterCells(state));
});
for (const key of ['size', 'x', 'y']) {
  bindLiveInput(`poster-opla-${key}`, (input) => changeOplaOptions({ [key]: input.valueAsNumber / 100 }, input));
}
$('poster-opla-placement').addEventListener('change', (event) => {
  selectOplaPlacement(event.target.value);
});
$('poster-shuffle-opla-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!oplaRig) return;
  const amount = $('poster-shuffle-opla-amount').valueAsNumber;
  const oplas = shufflePosterOplas(posterCells(state), amount);
  if (!oplas.length) return;
  activeOplaId = '';
  oplaTime = 0;
  apply({ ...state, oplas });
  notify(`Shuffled ${oplas.length} ${oplas.length === 1 ? 'Opla' : 'Oplas'}.`);
});
$('poster-opla-add').addEventListener('click', () => {
  const placements = state.oplas ?? [];
  const cells = posterCells(state);
  const ids = [...selectedIds];
  const placement = createPosterOpla(placements, cells, ids);
  if (!placement) return;
  const capacity = posterOplaCapacity(placements, cells, ids);
  const created = updatePosterOpla(placement, oplaDraft, capacity);
  activeOplaId = created.id;
  if (created.mode === 'animate') oplaPlaying = true;
  apply({ ...state, oplas: [...placements, created] });
});
function removeSelectedOpla() {
  if (!selectedOpla()) return;
  const previous = activeOplaId;
  activeOplaId = '';
  apply({ ...state, oplas: state.oplas.filter(({ id }) => id !== previous) });
}
$('poster-opla-remove').addEventListener('click', removeSelectedOpla);
$('poster-opla-preview').addEventListener('click', () => {
  oplaPlaying = !oplaPlaying;
  syncOplaPlayback();
  updateOplaTransport();
});
$('poster-opla-phase').addEventListener('input', (event) => {
  const placement = selectedOpla();
  if (!placement) return;
  oplaPlaying = false;
  oplaTime = cycles[placement.cycle].duration * Math.min(.9999, event.target.valueAsNumber / 100);
  syncOplaPlayback();
  oplaPreview?.update(oplaTime);
  updateOplaTransport();
});

for (const [id, type] of [['poster-column-edge', 'column'], ['poster-break-top', 'top'], ['poster-break-bottom', 'bottom']]) {
  bindLiveInput(id, (input) => moveBoundary(type, selectedCell(), input.valueAsNumber / 100, input, { snap: input.matches(':active') }));
  if (type !== 'column') {
    for (const event of ['change', 'blur', 'pointercancel']) $(id).addEventListener(event, () => showRowGuide());
  }
}

$('poster-block-text').addEventListener('click', () => apply(setBlockRole(state, [...selectedIds], 'background')));
$('poster-block-color').addEventListener('click', () => {
  const selected = posterCells(state).filter(({ id }) => selectedIds.has(id));
  const first = selected.filter(({ role }) => role !== 'accentB').map(({ id }) => id);
  const second = selected.filter(({ role }) => role === 'accentB').map(({ id }) => id);
  apply(setBlockRole(setBlockRole(state, first, 'accentA'), second, 'accentB'));
});
for (const [id, role] of [['poster-accent-a', 'accentA'], ['poster-accent-b', 'accentB']]) {
  $(id).addEventListener('click', () => apply(setBlockRole(state, [...selectedIds], role)));
}
$('poster-split-cell').addEventListener('click', () => {
  const cell = selectedCell();
  if (cell) apply(splitCell(state, cell.id));
});
$('poster-merge-cell').addEventListener('click', () => {
  const next = mergeCells(state, [...selectedIds]);
  if (next === state) return;
  const cells = posterCells(next);
  const anchor = cells.find(({ id }) => selectedIds.has(id));
  if (!anchor || !state.oplas?.length) {
    apply(next);
    return;
  }
  const aliases = new Map([...selectedIds].map((id) => [id, anchor.id]));
  apply({ ...next, oplas: readPosterOplas(next.oplas, cells, aliases) });
});
$('poster-delete-cell').addEventListener('click', () => {
  const cell = selectedCell();
  if (!cell) return;
  const next = deleteCell(state, cell.id);
  if (next === state) return;
  selectedIds.clear();
  apply(next);
});
$('poster-swap-colors').addEventListener('click', () => {
  const selected = posterCells(state).filter(({ id }) => selectedIds.has(id));
  let poster = state;
  for (const accent of Object.keys(swappedAccents)) {
    const ids = selected.filter((cell) => swapAccent(cell) === accent).map(({ id }) => id);
    poster = setBlockRole(poster, ids, accent);
  }
  apply(poster);
});

function stagePoint(event) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(stage.getScreenCTM().inverse());
}

function cellAtPoint(point) {
  return posterCells(state).find(({ x, y, width, height }) => (
    point.x >= x && point.x < x + width && point.y >= y && point.y < y + height
  ));
}

function textDropCell(event) {
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  if (!stage.contains(hit) || hit.closest('[data-poster-bars]')) return;
  return hit.closest('[data-cell]')?.dataset.cell ?? cellAtPoint(stagePoint(event))?.id;
}

function updateTextDrag(event) {
  const { sourceId, startX, startY, moved } = drag;
  if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) < 4) return;
  drag.moved = true;
  stage.dataset.posterDragging = 'text';
  const target = textDropCell(event);
  const highlighted = stage.querySelector('[data-poster-text-drop]');
  if (highlighted?.dataset.cell === target) return;
  highlighted?.removeAttribute('data-poster-text-drop');
  if (target && target !== sourceId) stage.querySelector(`[data-cell="${target}"]`)?.setAttribute('data-poster-text-drop', '');
}

function dragOpla(event, point) {
  const { type, start, original, frame, center } = drag;
  if (type === 'opla-scale') {
    const { x, y } = drag.cornerVector;
    const movement = (point.x - start.x) * x + (point.y - start.y) * y;
    const ratio = 1 + movement / (x * x + y * y);
    const size = Math.min(maxPosterOplaSize, Math.max(minPosterOplaSize, original.size * ratio));
    changeOplaOptions({ size }, stage);
    return;
  }
  if (type === 'opla-rotate') {
    const initialAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    const rotation = original.rotation + (angle - initialAngle) * 180 / Math.PI;
    changeOplaOptions({ rotation: event.shiftKey ? Math.round(rotation / 15) * 15 : rotation }, stage);
    return;
  }
  if (!drag.moved) {
    if (Math.hypot(point.x - start.x, point.y - start.y) < 2) return;
    drag.moved = true;
    if ((drag.duplicate || event.altKey) && !copyPosterPlacement(original, original.cellIds, 0, stage)) {
      drag.cancelled = true;
    }
  }
  if (!drag.cancelled) {
    changeOplaOptions({
      x: original.x + 2 * (point.x - start.x) / frame.width,
      y: original.y + 2 * (point.y - start.y) / frame.height,
    }, stage);
  }
}

function startOplaDrag(event, type, corner) {
  const original = selectedOpla();
  const geometry = oplaPreview?.placementGeometry.get(activeOplaId);
  if (!original || !geometry) return;
  const { bounds, frame } = geometry;
  const center = placementCenter(bounds);
  const cornerVector = corner && new DOMPoint(
    oplaCorners[corner][0] * bounds.width / 2, oplaCorners[corner][1] * bounds.height / 2,
  ).matrixTransform(new DOMMatrix().rotate(original.rotation));
  event.preventDefault();
  finishEdit();
  stage.focus({ preventScroll: true });
  stage.setPointerCapture(event.pointerId);
  drag = {
    type, start: stagePoint(event), pointer: event.pointerId,
    original, frame, center, cornerVector, duplicate: event.altKey,
  };
  stage.dataset.posterDragging = corner ? `opla-${corner}` : type;
}

function finishRowDrag(cancelled) {
  const { pointer } = drag;
  drag = null;
  delete stage.dataset.posterDragging;
  if (stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
  showRowGuide();
  if (cancelled) cancelEdit(stage);
  else finishEdit(stage);
}

oplaTransform.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || drag) return;
  const corner = event.target.dataset.oplaCorner;
  if (corner) startOplaDrag(event, 'opla-scale', corner);
  else if (event.target.hasAttribute('data-opla-rotation')) startOplaDrag(event, 'opla-rotate');
});

stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || drag) return;
  if (activeTab === 'layout') {
    contentEditor.pointerDown(event);
    return;
  }
  const type = event.target.closest('[data-poster-boundary]')?.dataset.posterBoundary;
  if (!type) {
    let id = event.target.closest('[data-cell]')?.dataset.cell;
    event.preventDefault();
    const opla = activeTab === 'opla' && !event.target.closest('[data-poster-bars]') && (event.target.closest('[data-poster-opla]')
      ?? document.elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest('[data-poster-opla]')).find(Boolean));
    if (opla && !event.shiftKey) {
      selectOplaPlacement(opla.dataset.posterOpla);
      startOplaDrag(event, 'opla-move');
      return;
    }
    if (opla && !id) {
      id = cellAtPoint(stagePoint(event))?.id;
    }
    if (activeTab === 'type' && !event.shiftKey && id && posterCells(state).some((cell) => cell.id === id && cell.text)) {
      stage.setPointerCapture(event.pointerId);
      drag = { type: 'text', sourceId: id, startX: event.clientX, startY: event.clientY, pointer: event.pointerId };
      return;
    }
    selectBlock(id, event.shiftKey);
    if (id && !event.shiftKey && activeTab !== 'opla') focusCellEditor();
    else if (id) focusStageCell(id);
    else stage.focus({ preventScroll: true });
    return;
  }
  if (event.shiftKey) return;
  const start = stagePoint(event);
  const cell = selectedCell();
  if (!cell) return;
  event.preventDefault();
  finishEdit();
  stage.setPointerCapture(event.pointerId);
  const targets = type === 'column' ? undefined : rowBoundarySnapTargets(state, cell.column, rowForBoundary(type, cell));
  drag = { type, cell, start, pointer: event.pointerId, targets };
  if (targets) stage.focus({ preventScroll: true });
  stage.dataset.posterDragging = type;
});
stage.addEventListener('pointermove', (event) => {
  if (drag?.pointer !== event.pointerId) return;
  const { type, cell, start } = drag;
  if (type === 'text') {
    updateTextDrag(event);
    return;
  }
  const point = stagePoint(event);
  if (type.startsWith('opla-')) {
    dragOpla(event, point);
    return;
  }
  const size = dimensions(state);
  const position = type === 'column'
    ? (cell.x + cell.width + point.x - start.x) / size.viewWidth
    : (cell.y + (type === 'top' ? 0 : cell.height) + point.y - start.y - size.gridY) / size.gridHeight;
  moveBoundary(type, cell, position, stage, { snap: true, targets: drag.targets });
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  stage.addEventListener(type, (event) => {
    if (drag?.pointer !== event.pointerId) return;
    if (drag.targets) {
      finishRowDrag(event.type !== 'pointerup');
      return;
    }
    const completed = drag;
    drag = null;
    delete stage.dataset.posterDragging;
    if (completed.type === 'text') {
      stage.querySelector('[data-poster-text-drop]')?.removeAttribute('data-poster-text-drop');
      if (event.type !== 'pointerup') return;
      if (!completed.moved) {
        selectBlock(completed.sourceId);
        focusCellEditor();
        return;
      }
      const target = textDropCell(event);
      const next = swapPosterBlocks(state, completed.sourceId, target);
      if (next !== state) {
        selectedIds.clear();
        selectedIds.add(target);
        focusedCellId = target;
        apply(next);
        focusStageCell(target);
      }
      return;
    }
    finishEdit(stage);
  });
}

function adjacentBlock(cells, cell, key) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const primary = horizontal ? 'x' : 'y';
  const cross = horizontal ? 'y' : 'x';
  const length = horizontal ? 'width' : 'height';
  const depth = horizontal ? 'height' : 'width';
  const center = cell[primary] + cell[length] / 2;
  const crossCenter = cell[cross] + cell[depth] / 2;
  let nearest;
  let best = Infinity;
  for (const candidate of cells) {
    const forward = direction * (candidate[primary] + candidate[length] / 2 - center);
    if (forward <= 0) continue;
    const across = Math.abs(candidate[cross] + candidate[depth] / 2 - crossCenter);
    const separation = Math.max(0, across - (cell[depth] + candidate[depth]) / 2);
    const score = forward + across / 2 + separation * 3;
    if (score < best) {
      nearest = candidate;
      best = score;
    }
  }
  return nearest;
}

function handleBlockKey(event) {
  if (activeTab === 'layout' || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
  const editing = event.currentTarget === cellEditor;
  const id = editing ? selectedCell()?.id : event.target.closest('[data-cell]')?.dataset.cell ?? focusedCellId;
  if (event.key === 'Escape') {
    if (drag?.targets) {
      event.preventDefault();
      finishRowDrag(true);
      return;
    }
    selectBlock();
    if (editing && id) focusStageCell(id);
    return;
  }
  if (activeTab !== 'opla' && ['Backspace', 'Delete'].includes(event.key)) {
    event.preventDefault();
    writeCellLetter(id, '');
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    if (editing && event.key === ' ') return;
    event.preventDefault();
    if (editing) focusStageCell(id);
    else {
      selectBlock(id, event.shiftKey);
      if (!event.shiftKey && activeTab !== 'opla' && event.key === 'Enter') focusCellEditor();
    }
    return;
  }
  if (arrowKeys.includes(event.key)) {
    if (activeTab === 'opla' && selectedOpla()) return;
    event.preventDefault();
    const cells = posterCells(state);
    const cell = cells.find((item) => item.id === id);
    const next = cell && adjacentBlock(cells, cell, event.key);
    if (editing && next) {
      selectBlock(next.id);
      focusCellEditor();
    } else if (next) focusStageCell(next.id);
    return;
  }
  if (!editing && activeTab !== 'opla' && graphemes(event.key).length === 1) {
    event.preventDefault();
    writeCellLetter(id, event.key);
    focusCellEditor();
  }
}
stage.addEventListener('keydown', handleBlockKey);
cellEditor.addEventListener('keydown', handleBlockKey);

const columnCountInput = $('poster-columns');
columnCountInput.max = maxColumns;
function applyColumnCount() {
  apply(setColumnCount(state, columnCountInput.valueAsNumber));
  columnCountInput.value = state.columns.length;
}
columnCountInput.addEventListener('change', applyColumnCount);
columnCountInput.addEventListener('blur', applyColumnCount);
$('poster-add-column').addEventListener('click', () => apply(setColumnCount(state, state.columns.length + 1)));
$('poster-remove-column').addEventListener('click', () => apply(setColumnCount(state, state.columns.length - 1)));
function shuffleGrid() {
  selectedIds.clear();
  return randomizeLayout(state, Math.random, {
    keepColumns: $('poster-random-lock-columns').checked,
    shuffleColors: $('poster-random-shuffle-colors').checked,
  });
}
$('poster-random-layout').addEventListener('click', () => {
  apply(shuffleGrid());
});
$('poster-reset-layout').addEventListener('click', () => apply(resetPosterLayout(state)));
$('poster-random-text').addEventListener('click', () => {
  const poster = $('poster-random-jumble-grid').checked ? shuffleGrid() : state;
  apply(randomizeTextPositions(poster));
});
$('poster-remove-text').addEventListener('click', () => apply(clearTextBlocks(state)));
for (const id of editorOptions) {
  $(id).addEventListener('change', () => {
    try {
      const view = Object.fromEntries(editorOptions.map((option) => [option, $(option).checked]));
      localStorage.setItem(viewKey, JSON.stringify(view));
    } catch { /* View controls still work if storage is unavailable. */ }
    refresh();
  });
}
$('poster-scheme').replaceChildren(...Object.entries(schemes).map(([id, { name }]) => new Option(`${id}. ${name}`, id)));
$('poster-scheme').addEventListener('change', (event) => apply({ ...state, scheme: Number(event.target.value) }));

$('poster-size-mode').addEventListener('change', (event) => {
  const [preset] = Object.entries(presets).find(([, choice]) => choice.mode === event.target.value);
  apply(setPreset(state, preset));
});
$('poster-size').addEventListener('change', (event) => apply(setPreset(state, event.target.value)));
$('poster-custom-size').addEventListener('submit', (event) => {
  event.preventDefault();
  apply(setPosterSize(state, $('poster-width').valueAsNumber, $('poster-height').valueAsNumber));
});
const backgroundPicker = $('poster-background-file');
$('poster-background-add').addEventListener('click', () => backgroundPicker.click());
$('poster-background-remove').addEventListener('click', () => {
  backgroundImageRequest++;
  if (state.backgroundImage) apply({ ...state, backgroundImage: undefined });
});
backgroundPicker.addEventListener('change', async () => {
  const [file] = backgroundPicker.files;
  if (!file) return;
  backgroundPicker.value = '';
  const request = ++backgroundImageRequest;
  const { viewWidth: width, viewHeight: height } = dimensions(state);
  try {
    const image = await importPosterContent(file, { width, height });
    if (request !== backgroundImageRequest) return;
    if (image?.type !== 'image') throw new Error('Choose a PNG, JPEG, WebP, GIF, or AVIF image.');
    apply({ ...state, backgroundImage: { name: image.name, source: image.source } });
    notify('Background image added.');
  } catch (error) {
    if (request === backgroundImageRequest) notify(error?.message ?? 'The background image could not be opened.');
  }
});
for (const edge of barEdges) {
  $(`poster-bar-${edge}-enabled`).addEventListener('change', (event) => {
    apply(setPosterBar(state, edge, { enabled: event.currentTarget.checked }));
  });
  $(`poster-bar-${edge}-mode`).addEventListener('change', (event) => {
    apply(setPosterBar(state, edge, { mode: event.currentTarget.value }));
  });
  const id = `poster-bar-${edge}-height`;
  const height = $(id);
  bindLiveInput(id, (input) => apply(setPosterBar(state, edge, { heightPx: input.valueAsNumber }), input));
  height.addEventListener('blur', () => { height.value = dimensions(state).barHeights[edge]; });
}

function setZoom(value) {
  zoom = Math.min(2.5, Math.max(.5, value));
  updateCanvas();
}

$('zoom-out').addEventListener('click', () => setZoom(zoom - .25));
$('zoom-in').addEventListener('click', () => setZoom(zoom + .25));
$('zoom-reset').addEventListener('click', () => setZoom(1));
$('undo-scene').addEventListener('click', () => restore(undo, redo));
$('redo-scene').addEventListener('click', () => restore(redo, undo));
function resetOplaPreview() {
  activeOplaId = '';
  oplaPlaying = false;
  oplaTime = 0;
}

function resetDesign(style) {
  selectedIds.clear();
  backgroundImageRequest++;
  resetOplaPreview();
  contentEditor.reset();
  if (style === 'example') {
    apply(createPoster());
    notify('Example restored.');
  } else {
    apply({ ...resetPosterGrid(state, style), content: [], backgroundImage: undefined });
    notify('Grid reset.');
  }
}
$('poster-reset').addEventListener('click', (event) => {
  event.target.closest('details').open = false;
  resetDesign('accentA');
});
$('poster-clear-oplas').addEventListener('click', () => {
  if (!state.oplas?.length) return;
  resetOplaPreview();
  apply({ ...state, oplas: [] });
  notify('All Oplas removed.');
});
for (const button of document.querySelectorAll('[data-poster-reset]')) {
  button.addEventListener('click', () => resetDesign(button.dataset.posterReset));
}

function showTab(active) {
  finishEdit();
  activeTab = active.dataset.posterTab;
  if (activeTab === 'layout') selectedIds.clear();
  for (const button of tabButtons) {
    const selected = button === active;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`poster-panel-${button.dataset.posterTab}`).hidden = !selected;
  }
  refresh();
}

for (const [index, button] of tabButtons.entries()) {
  button.addEventListener('click', () => showTab(button));
  button.addEventListener('keydown', (event) => {
    const count = tabButtons.length;
    const next = {
      ArrowLeft: (index + count - 1) % count, ArrowRight: (index + 1) % count,
      Home: 0, End: count - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showTab(tabButtons[next]);
    tabButtons[next].focus();
  });
}
const isEditingField = (event) => event.target.closest('input, textarea, select, [contenteditable]');
document.addEventListener('copy', (event) => {
  const placement = selectedOpla();
  if (activeTab !== 'opla' || !placement || isEditingField(event) || drag || window.getSelection()?.toString()) return;
  if (!event.clipboardData) return;
  event.clipboardData.setData('text/plain', posterClipboardPrefix + JSON.stringify(placement));
  event.preventDefault();
  notify('Opla copied.');
});
document.addEventListener('paste', (event) => {
  if (isEditingField(event) || drag || contentEditor.dragging) return;
  if (activeTab === 'layout') {
    contentEditor.paste(event);
    return;
  }
  if (activeTab !== 'opla') return;
  const text = event.clipboardData?.getData('text/plain');
  const prefix = [posterClipboardPrefix, oplaClipboardPrefix].find((start) => text?.startsWith(start));
  if (!prefix) return;
  let data;
  try { data = JSON.parse(text.slice(prefix.length)); }
  catch { return; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  event.preventDefault();
  const fromOpla = prefix === oplaClipboardPrefix;
  const ids = selectedIds.size ? [...selectedIds] : !fromOpla && Array.isArray(data.cellIds) ? data.cellIds : [];
  if (!ids.length) {
    notify('Select color blocks before pasting an Opla.');
    return;
  }
  const source = fromOpla ? {
    count: 1, size: data.scale, pose: data.pose, frame: data.frame, flip: data.flip, rotation: data.rotation,
  } : data;
  const placement = updatePosterOpla({ cellIds: ids }, source);
  const sameBlocks = Array.isArray(data.cellIds) && placement.cellIds.length === data.cellIds.length
    && placement.cellIds.every((id) => data.cellIds.includes(id));
  if (copyPosterPlacement(placement, ids, sameBlocks ? 20 : 0)) notify('Opla pasted.');
});
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || (event.target !== cellEditor && isEditingField(event)) || event.altKey || drag) return;
  const key = event.key.toLowerCase();
  const command = event.metaKey || event.ctrlKey;
  if (command && (key === 'z' || key === 'y')) {
    if (contentEditor.dragging) return;
    event.preventDefault();
    if (event.shiftKey || key === 'y') restore(redo, undo);
    else restore(undo, redo);
    return;
  }
  if (activeTab === 'layout') {
    if (!document.querySelector('.action-menu[open]')) contentEditor.keyDown(event);
    return;
  }
  const placement = selectedOpla();
  if (activeTab !== 'opla' || !placement) return;
  if (command && key === 'd') {
    event.preventDefault();
    if (copyPosterPlacement(placement)) notify('Opla duplicated.');
  } else if (!command && (key === 'delete' || key === 'backspace')) {
    event.preventDefault();
    removeSelectedOpla();
  } else if (!command && arrowKeys.includes(event.key)) {
    const geometry = oplaPreview?.placementGeometry.get(placement.id);
    if (!geometry) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const horizontal = Number(key === 'arrowright') - Number(key === 'arrowleft');
    const vertical = Number(key === 'arrowdown') - Number(key === 'arrowup');
    changeOplaOptions({
      x: placement.x + 2 * step * horizontal / geometry.frame.width,
      y: placement.y + 2 * step * vertical / geometry.frame.height,
    }, oplaTransform);
  }
});
document.addEventListener('keyup', (event) => {
  if (arrowKeys.includes(event.key)) finishEdit(oplaTransform);
});
window.addEventListener('blur', () => finishEdit(oplaTransform));
window.addEventListener('pagehide', () => { if (pendingEdit) save(); });

bindActionMenus();
bindProjectFiles({
  filename: 'animaloop-poster.json',
  notify,
  invalidMessage: 'Choose a valid Poster Studio project file.',
  getProject() {
    finishEdit();
    return { ...state, studio: 'poster', version: 1 };
  },
  openProject(data) {
    const next = readPoster(data, { strict: true });
    const backgroundImage = readBackgroundImage(data?.backgroundImage);
    if (!next || (data.studio !== undefined && data.studio !== 'poster')
      || (data.version !== undefined && data.version !== 1)
      || (data.oplas !== undefined && !Array.isArray(data.oplas))
      || (data.content !== undefined && !Array.isArray(data.content))
      || (data.backgroundImage != null && !backgroundImage)) {
      throw new Error('Invalid Poster Studio project.');
    }
    selectedIds.clear();
    backgroundImageRequest++;
    focusedCellId = undefined;
    resetOplaPreview();
    contentEditor.reset();
    apply({ ...next, oplas: data.oplas ?? [], content: readPosterContent(data.content), backgroundImage });
  },
});

for (const [format, button] of Object.entries(exportButtons)) {
  button.disabled = true;
  button.addEventListener('click', () => exportPoster(format));
}
$('export-cancel').addEventListener('click', () => {
  $('export-cancel').closest('details').open = false;
  exportJob?.abort();
});
new ResizeObserver(() => {
  renderRulers();
  renderOplaTransform();
  contentEditor.renderTransform();
}).observe($('stage-wrap'));
loadPalette().then((entries) => {
  if (entries.length) contentPalette = entries.map(({ name, hex: color }) => ({ name, color }));
  contentEditor.refresh();
}).catch(() => {
  // The current color scheme is available even when the shared palette cannot load.
});
const oplaRigPromise = loadPosterOplaRig().then((rig) => {
  oplaRig = rig;
  refresh();
}).catch((error) => {
  oplaRigError = true;
  updateOplaControls(posterCells(state));
  console.error(error);
});
refresh();
loadPosterFont().then(() => {
  fontReady = true;
  refresh();
}).catch((error) => {
  notify('The poster font could not load. Reload the page to try again.', 0);
  console.error(error);
});
