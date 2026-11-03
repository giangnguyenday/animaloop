import { loadRig, SVG_NS } from './rig.js';
import { cycles, cycleLabels, poses, poseLabels, walkAt, walkDirectionLabels } from './motion.js';
import { applyRenderFilter, blendModes, copyCount, effectCopy, effectLabels, effectOptions, effectParameters, renderFilters } from './effects.js';
import { createPhysics } from './physics.js';
import { createCamera } from './camera.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const stageWrap = $('stage-wrap');
const storageKey = 'animaloop-project-v1';
const dimensions = ['1080x1080', '1080x1350', '1920x1080', '1080x1920'];
const maxEffectAmount = 50;
const modes = ['place', 'walk', 'effect', 'physics', 'camera', 'settings'];
const physics = createPhysics();
let camera;
let cameraPose;
let customSize = false;
const ink = '#0C0C09';
const initialCharacter = { id: 1, color: ink, x: .5, y: .5, scale: 1, pose: 'neutral' };
const defaults = {
  size: dimensions[0], background: '#EAFF74',
  characters: [initialCharacter], walkers: [1], selected: 1,
  cycle: 'stroll', speed: 1, travel: true, time: 0,
  effect: 'none', amount: 4, params: {}, blend: 'normal', filter: 'none', filterStrength: 4,
  direction: 'right', angle: 0, walkMotion: 'one-way', guides: true, gravity: 1, bounce: .55, pile: false, puppet: false, dropCopies: false,
  transparent: false, snap: false, gridSize: 16, cameraZoom: true, cameraSensitivity: 1,
};

const hex = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback, min, max) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
const wrap = (value, period) => ((value % period) + period) % period;
let state = structuredClone(defaults);
let tab = 'place';
let usePlaceLayoutOnWalk = true;
let zoom = 1;
let playing = false;
let sceneUndo;
let boundsProbe;
let walkerColor = '#F672FF';
let palette = [];
let rig;
let art;
let effectDefs;
let selectionOverlay;
let showSelection = false;
let drag;
let persistTimer;
let statusTimer;

function validSize(value) {
  return typeof value === 'string' && /^\d{3,4}x\d{3,4}$/.test(value)
    && value.split('x').every((part) => +part >= 128 && +part <= 4096);
}

const poseKeys = ['head','hat','body','leftArm','rightArm','leftLeg','rightLeg','bob','lean','leftLift','rightLift','footDirection'];
function readFrame(frame) {
  if (!frame || typeof frame !== 'object') return undefined;
  return Object.fromEntries(poseKeys.filter((key) => Number.isFinite(frame[key])).map((key) => [key, clamp(frame[key], -360, 360)]));
}

function readProject(data) {
  if (!data || !Array.isArray(data.characters)) throw new Error('Choose a valid ANIMALOOP project.');
  const ids = new Set();
  const characters = data.characters.slice(0, 48).map((item, index) => {
    const value = item ?? {};
    let id = Number.isSafeInteger(value.id) && value.id > 0 ? value.id : index + 1;
    if (ids.has(id)) id = Array.from({ length: 49 }, (_, n) => n + 1).find((candidate) => !ids.has(candidate));
    ids.add(id);
    return {
      id, color: hex(value.color) ? value.color : ink,
      x: number(value.x, .5, 0, 1), y: number(value.y, .5, 0, 1),
      scale: number(value.scale, 1, .1, 3), walkSpeed: number(value.walkSpeed, 1, .25, 2.5),
      frame: readFrame(value.frame), rotation: number(value.rotation, 0, -360, 360), flip: value.flip === true,
      pose: Object.hasOwn(poses, value.pose) ? value.pose : 'neutral',
    };
  });
  return {
    characters,
    walkers: Array.isArray(data.walkers) ? [...new Set(data.walkers.filter((id) => ids.has(id)))] : [],
    selected: ids.has(data.selected) ? data.selected : characters[0]?.id,
    size: validSize(data.size) ? data.size : defaults.size,
    background: hex(data.background) ? data.background : defaults.background,
    cycle: Object.hasOwn(cycles, data.cycle) ? data.cycle : defaults.cycle,
    speed: number(data.speed, 1, .25, 2.5),
    travel: data.travel !== false,
    time: number(data.time, 0, 0, 1e9),
    effect: Object.hasOwn(effectLabels, data.effect) ? data.effect : 'none',
    guides: data.guides !== false,
    gravity: number(data.gravity, 1, 0, 2),
    bounce: number(data.bounce, .55, 0, 1),
    amount: Math.round(number(data.amount, 4, 1, maxEffectAmount)),
    direction: Object.hasOwn(walkDirectionLabels, data.direction) ? data.direction : 'right',
    angle: number(data.angle, 0, -180, 180),
    walkMotion: data.walkMotion === 'oscillate' ? 'oscillate' : 'one-way',
    params: Object.fromEntries(Object.keys(effectParameters).map((effect) => [effect, effectOptions(effect, data.params?.[effect])])),
    blend: blendModes.includes(data.blend) ? data.blend : 'normal',
    filter: renderFilters.includes(data.filter) ? data.filter : 'none',
    filterStrength: number(data.filterStrength, 4, 1, 20),
    pile: data.pile === true, puppet: data.puppet === true, dropCopies: data.dropCopies === true,
    transparent: data.transparent === true, snap: data.snap === true,
    gridSize: Math.round(number(data.gridSize, 16, 4, 128)),
    cameraZoom: data.cameraZoom !== false, cameraSensitivity: number(data.cameraSensitivity, 1, .25, 2),
  };
}

function notify(message) {
  const status = $('status');
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ''; }, 3600);
}

function saveLocal(keepUndo = false) {
  if (!keepUndo && sceneUndo) {
    sceneUndo = undefined;
    $('undo-scene').hidden = true;
  }
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Project export remains available. */ }
  }, 180);
}

function selected() {
  return state.characters.find((character) => character.id === state.selected);
}

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function size() {
  return state.size.split('x').map(Number);
}

function updateCanvas() {
  const [width, height] = size();
  stage.setAttribute('viewBox', `0 0 ${width} ${height}`);
  stageWrap.style.setProperty('--stage-ratio', `${width} / ${height}`);
  stageWrap.style.setProperty('--stage-aspect', width / height);
  stageWrap.style.setProperty('--view-zoom', zoom);
  $('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
  $('canvas-dimensions').textContent = `${width} × ${height}`;
  $('viewport').dataset.guides = state.guides;
  $('viewport').style.setProperty('--workspace-grid-size', `${state.gridSize}px`);
  stageWrap.dataset.transparent = state.transparent;
  stage.querySelector('[data-background]').setAttribute('fill', state.transparent ? 'none' : state.background);
  renderSelection();
}

function rebuildScene() {
  if (!rig) return;
  const stack = state.walkers.map((id) => state.characters.find((character) => character.id === id));
  const display = tab === 'walk' ? stack : state.characters;
  const effect = tab === 'effect' ? state.effect : 'none';
  art.replaceChildren();
  effectDefs.replaceChildren();
  const [width, height] = size();
  const effectMoves = ['onion', 'solitaire', 'tiles', 'crowd', 'continuous', 'contact'].includes(effect);
  const params = effectOptions(effect, state.params[effect]);
  applyRenderFilter(svg, effectDefs, art, tab === 'effect' ? state.filter : 'none', state.filterStrength, Math.min(width, height) / 1080);
  scene = display.map((character) => {
    const animated = tab === 'walk' || (tab === 'effect' && (effectMoves || state.walkers.includes(character.id)));
    const copyBudget = effect === 'continuous' ? Math.max(maxEffectAmount, Math.floor(960 / display.length)) : maxEffectAmount;
    let count = copyCount(effect, state.amount, animated);
    if (effect === 'continuous') {
      const base = Math.min(width, height) / 1080 * .99;
      const radians = params.angle * Math.PI / 180;
      const reach = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
      count = Math.max(count, Math.ceil((reach + 800 * character.scale * base) / (params.spacing * base)));
    }
    count = Math.min(count, copyBudget);
    const trails = Array.from({ length: count }, () => rig.create());
    const main = rig.create();
    if (['place', 'physics', 'camera'].includes(tab)) main.node.dataset.character = character.id;
    for (const entry of [...trails, main]) {
      if (tab === 'effect' && state.blend !== 'normal') entry.node.style.mixBlendMode = state.blend;
      art.append(entry.node);
    }
    if (effect === 'outline') {
      const id = `opla-outline-${character.id}`;
      const filter = svg('filter', { id, x: '-15%', y: '-15%', width: '130%', height: '130%', 'color-interpolation-filters': 'sRGB' });
      filter.append(
        svg('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: params.width, result: 'expanded' }),
        svg('feComposite', { in: 'expanded', in2: 'SourceAlpha', operator: 'out', result: 'ring' }),
        svg('feFlood', { 'flood-color': character.color, result: 'ink' }),
        svg('feComposite', { in: 'ink', in2: 'ring', operator: 'in' }),
      );
      effectDefs.append(filter);
      main.node.setAttribute('filter', `url(#${id})`);
    }
    return { character, animated, effect, trails, main };
  });
  renderScene();
}

let scene = [];
const fps = 24;

function characterMovement(character, seconds, width, height, scale, options = {}) {
  const stackIndex = state.walkers.indexOf(character.id);
  const index = stackIndex < 0 ? state.characters.indexOf(character) : stackIndex;
  return walkAt(seconds * (character.walkSpeed ?? 1), state.cycle, Math.max(0, index) * .23, width, scale, state.travel && !options.inPlace, character.x * width, {
    direction: options.direction ?? state.direction, angle: options.angle ?? state.angle, height, motion: state.walkMotion,
    anchorY: character.y * height, index: Math.max(0, index), count: state.walkers.length || state.characters.length,
  });
}

function renderScene() {
  const [width, height] = size();
  const base = Math.min(width, height) / 1080 * .99;
  const frame = Math.floor(state.time * fps) / fps;
  const params = effectOptions(state.effect, state.params[state.effect]);

  for (const [index, { character, animated, effect, trails, main }] of scene.entries()) {
    const scale = character.scale * base;
    const time = effect === 'onion' ? frame : state.time;
    const x = character.x * width;
    const y = character.y * height;
    const body = tab === 'physics' ? physics.bodies.get(character.id) : null;
    const tracked = tab === 'camera' && character.id === state.selected ? cameraPose : null;
    const gain = state.cameraSensitivity;
    const cameraScale = tracked && state.cameraZoom ? clamp(1 + ((tracked.scale ?? 1) - 1) * gain, .45, 2.2) : 1;

    function draw(entry, copy = {}) {
      const showPlacement = tab === 'walk' && !playing && state.time === 0;
      const movement = animated && !showPlacement
        ? characterMovement(character, copy.time ?? time, width, height, scale, copy)
        : { x: 0, y: 0, rotation: character.rotation ?? 0, flip: character.flip, pose: character.frame ?? poses[character.pose] };
      const pose = tracked
        ? Object.fromEntries(Object.entries(tracked.pose).map(([key, value]) => [key, value * gain]))
        : { ...movement.pose };
      for (const [key, value] of Object.entries(state.puppet ? body?.puppetPose ?? {} : {})) pose[key] = (pose[key] ?? 0) + value;
      entry.update({
        color: copy.color ?? character.color, scale: scale * (copy.scale ?? 1) * cameraScale,
        opacity: copy.opacity ?? 1, rotation: (body?.angle ?? 0) + (movement.rotation ?? 0) + (copy.rotation ?? 0),
        flip: Boolean(movement.flip) !== Boolean(copy.flip),
        x: (body?.x ?? x) + movement.x + (copy.dx ?? 0) + (tracked?.x ?? 0) * gain * width * .65,
        y: (body?.y ?? y) + (movement.y ?? 0) + (copy.dy ?? 0) + (tracked?.y ?? 0) * gain * height * .60,
        pose,
      });
    }

    const count = trails.length;
    const copyAt = (i) => effectCopy(effect, {
      i, count, time, frame, base, width, height, x, y, scale, index, cycleSpeed: cycles[state.cycle].travel * (character.walkSpeed ?? 1), travel: state.travel,
    }, params);
    for (const [trailIndex, entry] of trails.entries()) {
      const i = count - trailIndex;
      if (effect === 'solitaire') {
        const copy = copyAt(i);
        entry.node.style.display = copy.time < 0 ? 'none' : '';
        if (copy.time >= 0) draw(entry, copy);
      } else draw(entry, copyAt(i));
    }
    if (effect === 'tiles' || effect === 'contact') main.node.setAttribute('display', 'none');
    else draw(main, effect === 'continuous' ? copyAt(0) : {});
  }
  renderSelection();
}

function renderSelection() {
  if (!selectionOverlay) return;
  selectionOverlay.replaceChildren();
  if (tab !== 'place' || !showSelection) return;
  const entry = scene.find(({ character }) => character.id === state.selected);
  const node = entry?.main.node;
  if (!node) return;
  const bounds = node.getBBox();
  const matrix = stage.getCTM().inverse().multiply(node.getCTM());
  const corners = [
    [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height], [bounds.x, bounds.y + bounds.height],
  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
  const screen = stage.getScreenCTM();
  const unit = 1 / (Math.hypot(screen.a, screen.b) || 1);
  selectionOverlay.append(svg('polygon', { class: 'selection-box', points: corners.map(({ x, y }) => `${x},${y}`).join(' ') }));
  for (const [index, { x, y }] of corners.entries()) {
    selectionOverlay.append(svg('rect', {
      class: 'scale-handle', 'data-scale-handle': '', 'data-corner': ['nw', 'ne', 'se', 'sw'][index],
      x: x - 4 * unit, y: y - 4 * unit, width: 8 * unit, height: 8 * unit,
      transform: `rotate(${entry.character.rotation ?? 0} ${x} ${y})`,
    }));
  }
  const [leftTop, rightTop, rightBottom] = corners;
  const top = { x: (leftTop.x + rightTop.x) / 2, y: (leftTop.y + rightTop.y) / 2 };
  const edge = Math.hypot(rightTop.x - rightBottom.x, rightTop.y - rightBottom.y) || 1;
  const x = top.x + (rightTop.x - rightBottom.x) / edge * 24 * unit;
  const y = top.y + (rightTop.y - rightBottom.y) / edge * 24 * unit;
  selectionOverlay.append(
    svg('line', { class: 'rotation-stem', x1: top.x, y1: top.y, x2: x, y2: y }),
    svg('circle', { class: 'rotation-handle', 'data-rotation-handle': '', cx: x, cy: y, r: 5 * unit }),
  );
}

function refreshEffectParameters() {
  const container = $('effect-parameters');
  const effect = state.effect;
  const options = effectOptions(effect, state.params[effect]);
  container.replaceChildren();
  for (const [key, [label, min, max, step, , suffix = '']] of Object.entries(effectParameters[effect] ?? {})) {
    const field = document.createElement('label');
    field.className = 'field';
    const row = document.createElement('span');
    row.className = 'value-row';
    const output = document.createElement('output');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min, max, step, value: options[key] });
    output.textContent = options[key] + suffix;
    row.append(label, output);
    field.append(row, input);
    input.addEventListener('input', () => {
      state.params[effect] ??= options;
      state.params[effect][key] = input.valueAsNumber;
      output.textContent = input.valueAsNumber + suffix;
      captured = null;
      if (effect === 'outline') rebuildScene();
      else renderScene();
      saveLocal();
    });
    container.append(field);
  }
}

function paletteControls(target, current, label, setColor) {
  const container = $(target);
  container.replaceChildren();
  for (const { name, hex: color } of palette) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.style.setProperty('--swatch', color);
    button.title = `${name} · ${color}`;
    button.setAttribute('aria-label', `${label}: ${name}`);
    button.setAttribute('aria-pressed', String(color.toLowerCase() === current.toLowerCase()));
    button.disabled = !setColor;
    button.addEventListener('click', () => setColor(color));
    container.append(button);
  }
  const custom = document.createElement('label');
  custom.className = 'custom-color';
  custom.title = `Custom ${label.toLowerCase()}`;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = current;
  input.disabled = !setColor;
  input.setAttribute('aria-label', custom.title);
  input.addEventListener('input', () => {
    if (!setColor) return;
    setColor(input.value, false);
    for (const [index, button] of [...container.querySelectorAll('button')].entries()) {
      button.setAttribute('aria-pressed', String(palette[index].hex.toLowerCase() === input.value));
    }
  });
  input.addEventListener('change', refreshInspector);
  custom.append('+', input);
  container.append(custom);
}

function updateList(id, characters, isStack = false) {
  const list = $(id);
  list.replaceChildren();
  if (!characters.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = isStack ? 'Add an Opla to start the stack.' : 'Add an Opla to start composing.';
    list.append(empty);
  }
  for (const character of characters) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-select';
    button.setAttribute('aria-pressed', String(character.id === state.selected));
    const dot = document.createElement('span');
    dot.className = 'item-dot';
    dot.style.setProperty('--swatch', character.color);
    button.append(dot, `Opla ${String(character.id).padStart(2, '0')}`);
    button.addEventListener('click', () => {
      state.selected = character.id;
      if (tab === 'place') { showSelection = true; renderSelection(); }
      if (isStack) walkerColor = character.color;
      refreshInspector();
      saveLocal();
    });
    row.append(button);
    if (isStack) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'item-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove Opla ${character.id} from walking stack`);
      remove.addEventListener('click', () => {
        sceneAction('Walker removed from the stack.', () => {
          state.walkers = state.walkers.filter((id) => id !== character.id);
        });
      });
      const pace = document.createElement('label');
      pace.className = 'walker-speed';
      const speed = document.createElement('input');
      Object.assign(speed, { type: 'range', min: .25, max: 2.5, step: .05, value: character.walkSpeed ?? 1 });
      speed.setAttribute('aria-label', `Speed for Opla ${character.id}`);
      const value = document.createElement('output');
      value.textContent = `${speed.value}×`;
      speed.addEventListener('input', () => {
        character.walkSpeed = speed.valueAsNumber;
        value.textContent = `${speed.value}×`;
        captured = null;
        renderScene();
        saveLocal();
      });
      pace.append(speed, value);
      row.append(pace, remove);
    }
    list.append(row);
  }
}

function refreshInspector() {
  const character = selected();
  $('clear-scene').disabled = state.characters.length === 0;
  for (const id of ['remove-character', 'physics-remove', 'pose', 'scale', 'position-x', 'position-y', 'rotation']) $(id).disabled = !character;
  const poseSelect = $('pose');
  poseSelect.querySelector('[value="__frame"]')?.remove();
  if (character?.frame) poseSelect.prepend(new Option('Copied walk frame', '__frame'));
  poseSelect.value = character?.frame ? '__frame' : character?.pose ?? 'neutral';
  $('scale').value = character?.scale ?? 1;
  $('scale-value').textContent = character ? `${Math.round(character.scale * 100)}%` : '—';
  const [width, height] = size();
  $('position-x').value = character ? Math.round(character.x * width) : '';
  $('position-y').value = character ? Math.round(character.y * height) : '';
  $('position-x').max = width;
  $('position-y').max = height;
  $('rotation').value = character ? Math.round(character.rotation ?? 0) % 360 : '';
  $('canvas-size').value = customSize || !dimensions.includes(state.size) ? 'custom' : state.size;
  $('canvas-custom').hidden = $('canvas-size').value !== 'custom';
  $('canvas-width').value = width;
  $('canvas-height').value = height;
  $('show-guides').checked = state.guides;
  for (const key of ['gravity', 'bounce']) {
    $(`physics-${key}`).value = state[key];
    $(`physics-${key}-value`).textContent = state[key].toFixed(2);
  }
  $('walk-cycle').value = state.cycle;
  $('walk-speed').value = state.speed;
  $('walk-speed-value').textContent = `${+state.speed.toFixed(2)}×`;
  $('walk-travel').checked = state.travel;
  $('effect').value = state.effect;
  $('effect-amount').value = state.amount;
  $('effect-amount').disabled = ['none', 'outline', 'mirror'].includes(state.effect);
  $('effect-amount-value').textContent = state.amount;
  $('walk-direction').value = state.direction;
  $('walk-motion').value = state.walkMotion;
  $('walk-angle').value = state.angle;
  $('walk-angle').disabled = state.direction !== 'angled';
  $('walk-angle-value').textContent = `${state.angle}°`;
  $('walk-copy-place').disabled = state.walkers.length === 0;
  $('effect-blend').value = state.blend;
  $('effect-filter').value = state.filter;
  $('effect-filter-strength').value = state.filterStrength;
  $('effect-filter-strength').disabled = state.filter === 'none';
  $('effect-filter-strength-value').textContent = state.filterStrength;
  $('physics-pile').checked = state.pile;
  $('physics-puppet').checked = state.puppet;
  $('physics-drop-copies').checked = state.dropCopies;
  $('camera-auto-zoom').checked = state.cameraZoom;
  $('camera-sensitivity').value = state.cameraSensitivity;
  $('camera-sensitivity-value').textContent = `${state.cameraSensitivity}×`;
  $('settings-transparent').checked = state.transparent;
  $('settings-snap').checked = state.snap;
  $('settings-grid-size').value = state.gridSize;
  refreshEffectParameters();
  paletteControls('character-palette', character?.color ?? ink, 'Character color', character && ((color, refresh) => {
    character.color = color;
    changed(refresh);
  }));
  paletteControls('background-palette', state.background, 'Background color', (color, refresh) => {
    state.background = color;
    changed(refresh);
  });
  paletteControls('walker-palette', walkerColor, 'New walker color', (color, refresh = true) => {
    walkerColor = color;
    if (refresh) refreshInspector();
  });
  updateList('character-list', state.characters);
  updateList('walk-list', state.walkers.map((id) => state.characters.find((item) => item.id === id)), true);
  $('add-character').disabled = $('add-walker').disabled = state.characters.length >= 48;
  updateTransport();
}

let captured = null;
function changed(refresh = true, keepUndo = false) {
  captured = null;
  updateCanvas();
  rebuildScene();
  if (refresh) refreshInspector();
  saveLocal(keepUndo);
}

function sceneAction(message, apply) {
  if (drag) endDrag({ pointerId: drag.id, type: 'pointercancel' });
  rememberScene();
  apply();
  changed(true, true);
  $('undo-scene').hidden = false;
  if (message) notify(message);
}

function rememberScene() {
  sceneUndo = {
    state: structuredClone(state), customSize, zoom, tab,
    bodies: tab === 'physics' ? structuredClone(physics.bodies) : null,
  };
}

function removeSelected() {
  const character = selected();
  if (!character) return;
  sceneAction('Selected Opla removed.', () => {
    state.characters = state.characters.filter(({ id }) => id !== character.id);
    state.walkers = state.walkers.filter((id) => id !== character.id);
    physics.bodies.delete(character.id);
    state.selected = state.characters.at(-1)?.id;
  });
}

const resetFields = {
  walk: ['cycle', 'speed', 'travel', 'time', 'direction', 'angle', 'walkMotion'],
  effect: ['effect', 'amount', 'params', 'blend', 'filter', 'filterStrength'],
  physics: ['gravity', 'bounce', 'pile', 'puppet', 'dropCopies'],
  camera: ['cameraZoom', 'cameraSensitivity'],
  settings: ['size', 'background', 'guides', 'transparent', 'snap', 'gridSize'],
};

function resetMode() {
  if (tab === 'place' && !selected()) {
    notify('Select an Opla to reset its placement.');
    return;
  }
  const messages = {
    place: 'Selected Opla placement reset.', walk: 'Walk controls reset.',
    effect: 'Effects cleared.', physics: 'Physics controls and positions reset.',
    camera: 'Camera controls reset.', settings: 'Artboard settings reset.',
  };
  sceneAction(messages[tab], () => {
    if (tab === 'place') {
      const character = selected();
      Object.assign(character, { x: .5, y: .5, scale: 1, pose: 'neutral' });
      delete character.frame;
      delete character.rotation;
      delete character.flip;
      return;
    }
    for (const key of resetFields[tab]) state[key] = structuredClone(defaults[key]);
    if (tab === 'walk') {
      for (const character of state.characters) delete character.walkSpeed;
    }
    if (tab === 'walk' || tab === 'effect') playing = false;
    if (tab === 'physics') physics.reset(state.characters, ...size());
    if (tab === 'camera') camera.stop();
    if (tab === 'settings') { customSize = false; zoom = 1; }
  });
}

function nextCharacterId() {
  const usedIds = new Set(state.characters.map(({ id }) => id));
  return Array.from({ length: 49 }, (_, index) => index + 1).find((value) => !usedIds.has(value));
}

function addCharacter(walking) {
  if (state.characters.length >= 48) return;
  const id = nextCharacterId();
  const count = state.characters.length;
  const x = walking || !count ? .5 : [.66, .34, .72, .28, .5][(count - 1) % 5];
  const y = walking || !count ? .5 : [.54, .47, .42, .61, .35][(count - 1) % 5];
  const color = walking ? walkerColor : palette[(count % Math.max(1, palette.length))]?.hex ?? ink;
  state.characters.push({ id, color, x, y, scale: count && !walking ? .68 : 1, pose: 'neutral' });
  if (walking) state.walkers.push(id);
  state.selected = id;
  showSelection = !walking;
  changed();
}

function setTab(next) {
  if (next === tab) return;
  if (tab === 'camera') camera.stop();
  if (drag) endDrag({ pointerId: drag.id, type: 'pointercancel' });
  tab = next;
  captured = null;
  if (tab === 'place') usePlaceLayoutOnWalk = true;
  if (tab === 'walk' && usePlaceLayoutOnWalk) {
    state.walkers = state.characters.map(({ id }) => id);
    state.time = 0;
    playing = false;
    usePlaceLayoutOnWalk = false;
    refreshInspector();
    saveLocal(true);
  }
  if (tab === 'physics') physics.reset(state.characters, ...size());
  if (tab !== 'walk' && tab !== 'effect') playing = false;
  for (const button of $('tabs').querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`panel-${button.dataset.tab}`).hidden = !active;
  }
  stage.dataset.mode = tab;
  rebuildScene();
  updateTransport();
}

function canPlay(mode) {
  return mode === 'walk'
    ? state.walkers.length > 0
    : state.walkers.length > 0 || (state.characters.length > 0 && ['onion', 'solitaire', 'orbit', 'ripple', 'tiles', 'crowd', 'continuous'].includes(state.effect));
}

function updateTransport() {
  const duration = cycles[state.cycle].duration;
  const phase = Math.floor(wrap(state.time, duration) / duration * 1000);
  for (const mode of ['walk', 'effect']) {
    const play = $(`${mode}-play`);
    const frame = $(`${mode}-frame`);
    if (!play || !frame) continue;
    play.disabled = frame.disabled = !canPlay(mode);
    play.setAttribute('aria-pressed', String(playing));
    play.textContent = playing ? 'Pause' : 'Play';
    frame.value = phase;
  }
}

function setZoom(value) {
  zoom = clamp(value, .5, 2.5);
  updateCanvas();
}

function stagePoint(event) {
  const matrix = stage.getScreenCTM();
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}

const measuredPhysicsBounds = new Map();

function artBounds(body, id) {
  const character = scene.find((entry) => entry.character.id === id)?.character;
  if (!character) return undefined;
  const pose = { ...(character.frame ?? poses[character.pose]) };
  for (const [key, value] of Object.entries(state.puppet ? body.puppetPose ?? {} : {})) {
    pose[key] = (pose[key] ?? 0) + value;
  }
  const rotation = body.angle + (character.rotation ?? 0);
  const key = JSON.stringify([body.scale, rotation, character.flip, pose]);
  let bounds = measuredPhysicsBounds.get(key);
  if (!bounds) {
    boundsProbe.art.update({ scale: body.scale, rotation, flip: character.flip, pose });
    const { x, y, width, height } = boundsProbe.node.getBBox();
    if (!width || !height) return undefined;
    bounds = { left: x, top: y, right: x + width, bottom: y + height };
    if (measuredPhysicsBounds.size >= 256) measuredPhysicsBounds.clear();
    measuredPhysicsBounds.set(key, bounds);
  }
  return bounds;
}

function addPhysicsCopy(point) {
  if (state.characters.length >= 48) return;
  const [width, height] = size();
  const source = selected() ?? initialCharacter;
  rememberScene();
  const character = { ...source, id: nextCharacterId(), x: clamp(point.x / width, 0, 1), y: clamp(point.y / height, 0, 1) };
  state.characters.push(character);
  state.selected = character.id;
  physics.add(character.id, point, character.scale * Math.min(width, height) / 1080 * .99);
  changed(true, true);
  return character;
}

stage.addEventListener('pointerdown', (event) => {
  if (!['place', 'physics', 'camera'].includes(tab) || event.button !== 0 || drag) return;
  const scaling = tab === 'place' && event.target.hasAttribute('data-scale-handle');
  const rotating = tab === 'place' && event.target.hasAttribute('data-rotation-handle');
  const target = event.target.closest('[data-character]');
  const origin = stagePoint(event);
  const hit = scaling || rotating ? selected() : state.characters.find(({ id }) => id === Number(target?.dataset.character));
  const added = !hit && tab === 'physics' && state.dropCopies ? addPhysicsCopy(origin) : undefined;
  const character = hit ?? added;
  if (!character) {
    if (tab === 'place') { showSelection = false; renderSelection(); }
    return;
  }
  event.preventDefault();
  state.selected = character.id;
  if (tab === 'camera') {
    captured = null;
    renderScene();
    saveLocal();
    return;
  }
  if (tab === 'place') { showSelection = true; refreshInspector(); renderSelection(); }
  if (tab === 'physics') {
    $('physics-remove').disabled = false;
    physics.grab(character.id, origin, event.timeStamp);
  }
  captured = null;
  drag = {
    id: event.pointerId, character, origin, x: character.x, y: character.y,
    scaling, rotating, added: Boolean(added), scale: character.scale, rotation: character.rotation ?? 0,
    duplicate: tab === 'place' && !scaling && !rotating && event.altKey,
  };
  stage.setPointerCapture(event.pointerId);
  stage.dataset.dragging = 'true';
});

stage.addEventListener('pointermove', (event) => {
  if (event.pointerId !== drag?.id) return;
  const point = stagePoint(event);
  if (tab === 'physics') {
    physics.move(point, event.timeStamp);
    renderScene();
    return;
  }
  const [width, height] = size();
  const { origin, x, y, scaling, rotating, scale } = drag;
  if (!drag.edited) {
    if (Math.hypot(point.x - origin.x, point.y - origin.y) < 2) return;
    const copy = drag.duplicate || (!scaling && !rotating && event.altKey);
    if (copy && state.characters.length >= 48) return;
    rememberScene();
    drag.edited = true;
    if (copy) {
      drag.character = duplicateCharacter(drag.character, 0);
      rebuildScene();
      refreshInspector();
    }
  }
  const character = drag.character;
  if (rotating) {
    const centerX = x * width;
    const centerY = y * height;
    const start = Math.atan2(origin.y - centerY, origin.x - centerX);
    const current = Math.atan2(point.y - centerY, point.x - centerX);
    const angle = drag.rotation + (current - start) * 180 / Math.PI;
    character.rotation = wrap(event.shiftKey ? Math.round(angle / 15) * 15 : angle, 360);
    $('rotation').value = Math.round(character.rotation) % 360;
  } else if (scaling) {
    const cx = x * width;
    const cy = y * height;
    const dx = origin.x - cx;
    const dy = origin.y - cy;
    const ratio = ((point.x - cx) * dx + (point.y - cy) * dy) / Math.max(1, dx * dx + dy * dy);
    character.scale = clamp(scale * ratio, .1, 3);
    $('scale').value = character.scale;
    $('scale-value').textContent = `${Math.round(character.scale * 100)}%`;
  } else {
    const snap = (value) => state.snap ? Math.round(value / state.gridSize) * state.gridSize : value;
    character.x = clamp(snap(x * width + point.x - origin.x) / width, 0, 1);
    character.y = clamp(snap(y * height + point.y - origin.y) / height, 0, 1);
    $('position-x').value = Math.round(character.x * width);
    $('position-y').value = Math.round(character.y * height);
  }
  captured = null;
  renderScene();
});

function endDrag(event) {
  if (event.pointerId !== drag?.id) return;
  if (tab === 'physics') {
    if (drag.added && event.type === 'pointerup') {
      const point = stagePoint(event);
      physics.move(point, event.timeStamp);
      const [width, height] = size();
      drag.character.x = clamp(point.x / width, 0, 1);
      drag.character.y = clamp(point.y / height, 0, 1);
    }
    physics.release(event.timeStamp ?? performance.now(), event.type === 'pointerup' && !drag.added);
  }
  const keepUndo = tab === 'place' || drag.added;
  if (drag.edited || drag.added) $('undo-scene').hidden = false;
  drag = null;
  delete stage.dataset.dragging;
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  saveLocal(keepUndo);
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('lostpointercapture', endDrag);

function snapshot() {
  renderScene();
  const [width, height] = size();
  const copy = stage.cloneNode(true);
  for (const attribute of ['id', 'class', 'style', 'data-mode', 'data-dragging', 'aria-label', 'role', 'tabindex']) {
    copy.removeAttribute(attribute);
  }
  copy.querySelector('[data-selection-overlay]')?.remove();
  copy.querySelector('[data-bounds-probe]')?.remove();
  copy.querySelectorAll('[data-character]').forEach((node) => node.removeAttribute('data-character'));
  copy.setAttribute('width', width);
  copy.setAttribute('height', height);
  return {
    width, height,
    svg: new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }),
  };
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportImage(format) {
  if (!rig) return;
  const frame = captured ?? snapshot();
  try {
    if (format === 'svg') download(frame.svg, 'animaloop-opla.svg');
    else {
      const url = URL.createObjectURL(frame.svg);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Canvas export failed.');
        download(blob, 'animaloop-opla.png');
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    notify(`${format.toUpperCase()} exported · ${frame.width} × ${frame.height}`);
  } catch {
    notify('Export failed. Try capturing the frame again.');
  }
}

function duplicateCharacter(source, offset = 20) {
  const [width, height] = size();
  const character = {
    ...structuredClone(source), id: nextCharacterId(),
    x: clamp(source.x + offset / width, 0, 1), y: clamp(source.y + offset / height, 0, 1),
  };
  state.characters.push(character);
  state.selected = character.id;
  showSelection = true;
  return character;
}

function bindShortcuts() {
  const isEditingField = (event) => event.target.closest('input, textarea, select, [contenteditable]');
  const clipboardPrefix = 'ANIMALOOP Opla: ';
  document.addEventListener('copy', (event) => {
    const character = selected();
    if (tab !== 'place' || !character || isEditingField(event) || drag || window.getSelection()?.toString()) return;
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', clipboardPrefix + JSON.stringify(character));
    event.preventDefault();
    notify('Opla copied.');
  });
  document.addEventListener('paste', (event) => {
    if (tab !== 'place' || isEditingField(event) || drag || state.characters.length >= 48) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text?.startsWith(clipboardPrefix)) return;
    let character;
    try {
      const data = JSON.parse(text.slice(clipboardPrefix.length));
      if (!data || typeof data !== 'object') return;
      [character] = readProject({ characters: [data] }).characters;
    } catch {
      return;
    }
    event.preventDefault();
    sceneAction('Opla pasted.', () => duplicateCharacter(character));
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || isEditingField(event) || drag) return;
    const key = event.key.toLowerCase();
    const command = (event.metaKey || event.ctrlKey) && !event.altKey;
    if (command && key === 'z' && !event.shiftKey && sceneUndo) {
      event.preventDefault();
      $('undo-scene').click();
      return;
    }
    if (tab !== 'place') return;
    const character = selected();
    if (command && key === 'd' && character) {
      event.preventDefault();
      if (state.characters.length < 48) sceneAction('Opla duplicated.', () => duplicateCharacter(character));
    } else if (character && !command && !event.altKey && ['delete', 'backspace'].includes(key)) {
      event.preventDefault();
      removeSelected();
    } else if (character && !command && !event.altKey && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      event.preventDefault();
      const [width, height] = size();
      const step = event.shiftKey ? 10 : 1;
      if (!event.repeat || !sceneUndo) rememberScene();
      character.x = clamp(character.x + (Number(key === 'arrowright') - Number(key === 'arrowleft')) * step / width, 0, 1);
      character.y = clamp(character.y + (Number(key === 'arrowdown') - Number(key === 'arrowup')) * step / height, 0, 1);
      showSelection = true;
      changed(true, true);
      $('undo-scene').hidden = false;
    }
  });
}

function bindControls() {
  bindShortcuts();
  $('tabs').addEventListener('click', (event) => {
    const next = event.target.closest('[data-tab]')?.dataset.tab;
    if (next) setTab(next);
  });
  $('tabs').addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const current = modes.indexOf(tab);
    const index = [wrap(current - 1, modes.length), wrap(current + 1, modes.length), 0, modes.length - 1][keys.indexOf(event.key)];
    event.preventDefault();
    setTab(modes[index]);
    $(`tab-${tab}`).focus();
  });

  $('add-character').addEventListener('click', () => addCharacter(false));
  $('add-walker').addEventListener('click', () => addCharacter(true));
  $('remove-character').addEventListener('click', removeSelected);
  $('physics-remove').addEventListener('click', removeSelected);
  $('reset-mode').addEventListener('click', (event) => {
    event.target.closest('details').open = false;
    resetMode();
  });
  $('clear-scene').addEventListener('click', (event) => {
    event.target.closest('details').open = false;
    sceneAction('All characters removed.', () => {
      state.characters = [];
      state.walkers = [];
      state.selected = undefined;
      playing = false;
      physics.reset([], ...size());
    });
  });
  $('undo-scene').addEventListener('click', () => {
    if (!sceneUndo) return;
    const previous = sceneUndo;
    state = previous.state;
    customSize = previous.customSize;
    zoom = previous.zoom;
    playing = false;
    if (tab === 'physics') {
      physics.reset(state.characters, ...size());
      if (previous.tab === 'physics') {
        for (const [id, body] of previous.bodies) physics.bodies.set(id, body);
      }
    }
    changed();
    notify('Previous scene restored.');
  });
  $('pose').addEventListener('change', (event) => {
    const character = selected();
    if (event.target.value === '__frame') return;
    character.pose = event.target.value;
    if (character.frame) delete character.flip;
    delete character.frame;
    changed(false);
  });
  $('scale').addEventListener('input', (event) => {
    selected().scale = event.target.valueAsNumber;
    $('scale-value').textContent = `${Math.round(selected().scale * 100)}%`;
    changed(false);
  });
  for (const [index, axis] of ['x', 'y'].entries()) {
    $(`position-${axis}`).addEventListener('change', (event) => {
      const character = selected();
      const extent = size()[index];
      character[axis] = number(event.target.valueAsNumber / extent, character[axis], 0, 1);
      event.target.value = Math.round(character[axis] * extent);
      changed(false);
    });
  }
  $('rotation').addEventListener('change', (event) => {
    const character = selected();
    const angle = event.target.valueAsNumber;
    if (!Number.isFinite(angle)) {
      event.target.value = Math.round(character.rotation ?? 0) % 360;
      return;
    }
    sceneAction('', () => { character.rotation = wrap(angle, 360); });
  });
  $('walk-copy-place').addEventListener('click', () => {
    const [width, height] = size();
    playing = false;
    for (const character of state.characters) {
      if (state.time === 0 || !state.walkers.includes(character.id)) continue;
      const scale = character.scale * Math.min(width, height) / 1080 * .99;
      const movement = characterMovement(character, state.time, width, height, scale);
      character.x = clamp(character.x + movement.x / width, 0, 1);
      character.y = clamp(character.y + (movement.y ?? 0) / height, 0, 1);
      character.frame = movement.pose;
      character.rotation = movement.rotation ?? 0;
      character.flip = Boolean(movement.flip);
    }
    state.time = 0;
    showSelection = false;
    setTab('place');
    changed();
    notify('Walk frame copied to Place.');
  });
  for (const [id, key] of [
    ['settings-transparent', 'transparent'], ['settings-snap', 'snap'], ['physics-pile', 'pile'],
    ['physics-puppet', 'puppet'], ['physics-drop-copies', 'dropCopies'], ['camera-auto-zoom', 'cameraZoom'],
  ]) {
    $(id).addEventListener('change', (event) => {
      state[key] = event.target.checked;
      captured = null;
      updateCanvas();
      renderScene();
      saveLocal();
    });
  }
  $('settings-grid-size').addEventListener('change', (event) => {
    state.gridSize = Math.round(number(event.target.valueAsNumber, state.gridSize, 4, 128));
    event.target.value = state.gridSize;
    updateCanvas();
    saveLocal();
  });
  $('camera-sensitivity').addEventListener('input', (event) => {
    state.cameraSensitivity = event.target.valueAsNumber;
    $('camera-sensitivity-value').textContent = `${state.cameraSensitivity}×`;
    captured = null;
    renderScene();
    saveLocal();
  });
  $('canvas-size').addEventListener('change', (event) => {
    customSize = event.target.value === 'custom';
    if (!customSize) state.size = event.target.value;
    changed();
  });
  $('canvas-custom').addEventListener('submit', (event) => {
    event.preventDefault();
    const next = `${$('canvas-width').valueAsNumber}x${$('canvas-height').valueAsNumber}`;
    if (!validSize(next)) return;
    state.size = next;
    changed();
  });
  $('show-guides').addEventListener('change', (event) => {
    state.guides = event.target.checked;
    updateCanvas();
    saveLocal();
  });
  for (const key of ['gravity', 'bounce']) {
    $(`physics-${key}`).addEventListener('input', (event) => {
      state[key] = event.target.valueAsNumber;
      $(`physics-${key}-value`).textContent = state[key].toFixed(2);
      saveLocal();
    });
  }
  $('physics-reset').addEventListener('click', () => {
    sceneAction('Physics positions reset.', () => physics.reset(state.characters, ...size()));
  });
  $('camera-start').addEventListener('click', () => camera.start());
  $('camera-stop').addEventListener('click', () => camera.stop());
  window.addEventListener('pagehide', () => camera.stop());
  $('zoom-in').addEventListener('click', () => setZoom(zoom + .25));
  $('zoom-out').addEventListener('click', () => setZoom(zoom - .25));
  $('zoom-reset').addEventListener('click', () => setZoom(1));

  $('walk-cycle').addEventListener('change', (event) => {
    state.cycle = event.target.value;
    state.time = 0;
    changed();
  });
  $('walk-speed').addEventListener('input', (event) => {
    state.speed = event.target.valueAsNumber;
    $('walk-speed-value').textContent = `${+state.speed.toFixed(2)}×`;
    saveLocal();
  });
  $('walk-motion').addEventListener('change', (event) => {
    state.walkMotion = event.target.value;
    state.time = 0;
    changed();
  });
  $('walk-direction').addEventListener('change', (event) => {
    state.direction = event.target.value;
    state.time = 0;
    changed();
  });
  $('walk-angle').addEventListener('input', (event) => {
    state.angle = event.target.valueAsNumber;
    $('walk-angle-value').textContent = `${state.angle}°`;
    changed(false);
  });
  $('walk-travel').addEventListener('change', (event) => {
    state.travel = event.target.checked;
    changed(false);
  });
  for (const mode of ['walk', 'effect']) {
    $(`${mode}-play`)?.addEventListener('click', () => {
      playing = !playing;
      if (playing) captured = null;
      else saveLocal();
      updateTransport();
    });
    $(`${mode}-frame`)?.addEventListener('input', (event) => {
      playing = false;
      captured = null;
      const duration = cycles[state.cycle].duration;
      const start = Math.floor(state.time / duration) * duration;
      state.time = start + Math.min(999, event.target.valueAsNumber) / 1000 * duration;
      renderScene();
      updateTransport();
      saveLocal();
    });
  }
  $('effect').addEventListener('change', (event) => {
    state.effect = event.target.value;
    if (state.effect === 'solitaire' && state.characters.length) { state.time = 0; playing = true; }
    else if (!canPlay('effect')) playing = false;
    changed();
  });
  $('effect-amount').addEventListener('input', (event) => {
    state.amount = event.target.valueAsNumber;
    $('effect-amount-value').textContent = state.amount;
    changed(false);
  });
  for (const [id, key] of [['effect-blend', 'blend'], ['effect-filter', 'filter']]) {
    $(id).addEventListener('change', (event) => {
      state[key] = event.target.value;
      changed();
    });
  }
  $('effect-filter-strength').addEventListener('input', (event) => {
    state.filterStrength = event.target.valueAsNumber;
    $('effect-filter-strength-value').textContent = state.filterStrength;
    changed(false);
  });
  $('capture').addEventListener('click', () => {
    playing = false;
    updateTransport();
    captured = snapshot();
    saveLocal();
    notify('Frame captured. Export as SVG or PNG.');
  });
  for (const format of ['svg', 'png']) {
    $(`export-${format}`).addEventListener('click', (event) => {
      event.target.closest('details').open = false;
      exportImage(format);
    });
  }
  $('project-save').addEventListener('click', (event) => {
    event.target.closest('details').open = false;
    const project = { ...state, version: 1, mode: tab };
    download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'animaloop-project.json');
    notify('Editable project saved.');
  });
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json,.json';
  $('project-open').addEventListener('click', (event) => {
    event.target.closest('details').open = false;
    picker.click();
  });
  picker.addEventListener('change', async () => {
    if (!picker.files.length) return;
    try {
      const data = JSON.parse(await picker.files[0].text());
      state = readProject(data);
      playing = false;
      customSize = !dimensions.includes(state.size);
      usePlaceLayoutOnWalk = data.mode !== 'walk';
      setTab(modes.includes(data.mode) ? data.mode : 'place');
      if (tab === 'physics') physics.reset(state.characters, ...size());
      changed();
      notify('Project opened.');
    } catch {
      notify('Choose a valid ANIMALOOP project file.');
    } finally {
      picker.value = '';
    }
  });
  document.addEventListener('click', (event) => {
    for (const menu of document.querySelectorAll('.action-menu[open]')) {
      if (!menu.contains(event.target)) menu.open = false;
    }
  });
}

async function loadPalette() {
  const response = await fetch('./palette.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Could not load palette.json.');
  const data = await response.json();
  const entries = Array.isArray(data) ? data : data.colors;
  if (!Array.isArray(entries)) throw new Error('palette.json needs an array of colors.');
  return entries.map((entry) => typeof entry === 'string' ? { name: entry, hex: entry } : entry)
    .filter((entry) => hex(entry?.hex))
    .map((entry) => ({ name: entry.name || entry.hex, hex: entry.hex }));
}

async function init() {
  try {
    const local = localStorage.getItem(storageKey);
    if (local) state = readProject(JSON.parse(local));
  } catch { /* An unreadable local project opens a fresh artboard. */ }

  const [parts, colors] = await Promise.allSettled([loadRig(), loadPalette()]);
  if (colors.status === 'fulfilled') {
    palette = colors.value;
    walkerColor = palette[1]?.hex ?? palette[0]?.hex ?? walkerColor;
  } else {
    notify('Palette unavailable. Custom colors are still available.');
    console.error(colors.reason);
  }
  if (parts.status === 'rejected') {
    const status = $('status');
    status.textContent = parts.reason.message;
    status.setAttribute('role', 'alert');
    stage.append(svg('rect', { width: '100%', height: '100%', fill: state.background }));
    console.error(parts.reason);
    return;
  }
  rig = parts.value;
  for (const [id, labels] of [['pose', poseLabels], ['walk-cycle', cycleLabels], ['effect', effectLabels], ['walk-direction', walkDirectionLabels]]) {
    $(id).replaceChildren(...Object.entries(labels).map(([value, label]) => new Option(label, value)));
  }
  camera = createCamera({
    video: $('camera-video'),
    onPose(pose) {
      cameraPose = pose;
      if (tab === 'camera') renderScene();
    },
    onStatus(message, status) {
      const inactive = status === 'idle' || status === 'error';
      $('camera-status').textContent = message;
      $('camera-start').disabled = !inactive;
      $('camera-stop').disabled = inactive;
      $('camera-preview').hidden = inactive || status === 'loading';
      if (status === 'loading') captured = null;
    },
  });
  stage.dataset.mode = tab;
  effectDefs = svg('defs');
  const canvasClip = svg('clipPath', { id: 'opla-artboard-clip' });
  canvasClip.append(svg('rect', { width: '100%', height: '100%' }));
  rig.defs.append(canvasClip);
  art = svg('g', { 'clip-path': 'url(#opla-artboard-clip)' });
  selectionOverlay = svg('g', { 'data-selection-overlay': '', 'aria-hidden': 'true' });
  boundsProbe = { node: svg('g', { visibility: 'hidden', 'pointer-events': 'none', 'data-bounds-probe': '' }), art: rig.create() };
  boundsProbe.node.append(boundsProbe.art.node);
  stage.append(boundsProbe.node);
  stage.append(rig.defs, effectDefs, svg('rect', { 'data-background': '', width: '100%', height: '100%' }), art, selectionOverlay);
  updateCanvas();
  rebuildScene();
  refreshInspector();
  bindControls();

  let last = performance.now();
  function tick(now) {
    const elapsed = Math.min((now - last) / 1000, .1);
    last = now;
    if (tab === 'physics') {
      const [width, height] = size();
      const steps = Math.max(1, Math.ceil(elapsed / .012));
      for (let i = 0; i < steps; i++) physics.step(elapsed / steps, width, height, state.gravity, state.bounce, { pile: state.pile, puppet: state.puppet, artBounds });
      renderScene();
    } else if (playing && canPlay(tab)) {
      state.time += elapsed * state.speed;
      renderScene();
      updateTransport();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

init();
