import {
  createPosterTextContent, importPosterContent, maxPosterContentData, maxPosterContentItems, maxPosterContentPadding,
  posterContentBounds, posterContentClipboard, posterContentDisplayText, readPosterContent, updatePosterContent,
} from './poster-content.js?v=jumble';

const corners = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
const keyDirections = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const assetDragType = 'application/x-animaloop-poster-asset';
const minBoxSize = .01;
const maxBoxSize = 4;
const minFontSize = .004;
const maxFontSize = .6;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pixels = (value) => Number(value.toFixed(2));

export function bindPosterContent({ stage, getObjects, getLayout, isActive, apply, finishEdit, cancelEdit, notify }) {
  const control = (name) => document.getElementById(`poster-content-${name}`);
  const transform = control('transform');
  const list = control('list');
  const file = control('file');
  const swatches = control('color-swatches');
  const backgroundSwatches = control('background-swatches');
  const backgroundNone = control('background-none');
  const textAlignment = control('text-align');
  const gallery = control('assets');
  const artboard = stage.parentElement;
  const assets = new Map([...gallery.querySelectorAll('button[data-poster-asset]')].map((button) => [
    button, { source: button.dataset.posterAsset, name: button.dataset.posterAssetName },
  ]));
  const selectedIds = new Set();
  let drag;
  let draggedAsset;
  let importVersion = 0;

  const selection = () => getObjects().filter(({ id }) => selectedIds.has(id));

  function groupBounds(items, layout) {
    const boxes = items.map((item) => posterContentBounds(item, layout));
    const x = Math.min(...boxes.map((box) => box.x));
    const y = Math.min(...boxes.map((box) => box.y));
    return {
      x, y,
      width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
      height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
    };
  }

  function itemName(item) {
    if (item.type !== 'text') return item.name || (item.type === 'svg' ? 'Vector artwork' : 'Image');
    return posterContentDisplayText(item).trim().replace(/\s+/g, ' ').slice(0, 60) || 'Text box';
  }

  function renderTransform() {
    transform.replaceChildren();
    const items = selection();
    const screen = stage.getScreenCTM();
    const viewBox = stage.getAttribute('viewBox');
    const hidden = !isActive() || !items.length || !screen || !viewBox;
    transform.toggleAttribute('hidden', hidden);
    if (hidden) return;

    transform.setAttribute('viewBox', viewBox);
    const bounds = groupBounds(items, getLayout());
    const unit = 1 / Math.hypot(screen.a, screen.b);
    if (!Number.isFinite(unit)) return;
    const rect = (attributes) => {
      const shape = document.createElementNS(stage.namespaceURI, 'rect');
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      return shape;
    };
    transform.append(rect({ class: 'selection-box', ...bounds }));
    for (const [corner, [horizontal, vertical]] of Object.entries(corners)) {
      transform.append(rect({
        class: 'scale-handle', 'data-poster-content-handle': corner,
        x: bounds.x + (horizontal > 0 ? bounds.width : 0) - 4 * unit,
        y: bounds.y + (vertical > 0 ? bounds.height : 0) - 4 * unit,
        width: 8 * unit, height: 8 * unit,
      }));
    }
  }

  function refreshSwatches(container, palette, activeColor) {
    const colors = palette.map(({ color, name }) => ({ color: color.toLowerCase(), name }));
    if (colors.length !== container.children.length || colors.some(({ color, name }, index) => {
      const { dataset } = container.children[index];
      return dataset.color !== color || dataset.colorName !== name;
    })) {
      container.replaceChildren(...colors.map(({ color, name }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'swatch poster-content-swatch';
        button.dataset.color = color;
        button.dataset.colorName = name;
        button.title = `${name} (${color.toUpperCase()})`;
        button.setAttribute('aria-label', button.title);
        button.style.setProperty('--swatch-color', color);
        return button;
      }));
    }
    for (const button of container.children) {
      button.setAttribute('aria-pressed', String(button.dataset.color === activeColor));
    }
  }

  function refresh(source) {
    const objects = getObjects();
    for (const id of selectedIds) if (!objects.some((item) => item.id === id)) selectedIds.delete(id);
    if (!isActive()) {
      transform.setAttribute('hidden', '');
      return;
    }
    const items = selection();
    const [item] = items;
    const text = items.length === 1 && item.type === 'text' ? item : undefined;
    const asset = items.length === 1 && !text ? item : undefined;
    const setValue = (name, value) => {
      const input = control(name);
      if (input !== source && input.value !== String(value)) input.value = value;
    };
    const setPixels = (name, value, min, max) => {
      const input = control(name);
      input.min = pixels(min);
      input.max = pixels(max);
      input.step = '.01';
      setValue(name, pixels(value));
    };
    const ids = objects.map(({ id }) => id);
    if (ids.length !== list.children.length || ids.some((id, index) => list.children[index].dataset.contentId !== id)) {
      list.replaceChildren(...objects.map(({ id }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'item-select';
        button.dataset.contentId = id;
        return button;
      }));
    }
    objects.forEach((object, index) => {
      const button = list.children[index];
      button.textContent = itemName(object);
      button.setAttribute('aria-pressed', String(selectedIds.has(object.id)));
    });
    const layout = getLayout();
    control('selected').hidden = !items.length;
    control('selection-title').textContent = items.length > 1 ? 'Selected objects' : 'Selected object';
    control('remove').textContent = items.length > 1 ? 'Remove objects' : 'Remove object';
    control('asset-height-field').hidden = !asset;
    if (items.length) {
      const { width, height } = groupBounds(items, layout);
      const { min, max } = text
        ? { min: minBoxSize * layout.width, max: maxBoxSize * layout.width }
        : scaleLimits(items, width);
      setPixels('scale', width, min, max);
      if (asset) {
        const heightLimits = scaleLimits(items, height);
        setPixels('asset-height', height, heightLimits.min, heightLimits.max);
      }
    }
    for (const name of ['text-controls', 'color-controls', 'text-align-controls', 'background-controls']) control(name).hidden = !text;
    if (text) {
      setValue('text', text.text);
      setValue('style', text.style);
      setPixels('text-size', text.fontSize * layout.width, minFontSize * layout.width, maxFontSize * layout.width);
      setPixels('padding', text.padding * layout.width, 0, maxPosterContentPadding(text.width) * layout.width);
      const color = (text.color || layout.textColor).toLowerCase();
      const background = text.background.toLowerCase();
      setValue('text-color', color);
      setValue('background-color', background || color);
      backgroundNone.setAttribute('aria-pressed', String(!background));
      refreshSwatches(swatches, layout.palette, color);
      refreshSwatches(backgroundSwatches, layout.palette, background);
      for (const button of textAlignment.querySelectorAll('button[data-text-align]')) {
        button.setAttribute('aria-pressed', String(button.dataset.textAlign === text.align));
      }
    }
    renderTransform();
  }

  function select(id, extend = false) {
    finishEdit();
    if (!extend) selectedIds.clear();
    if (id) {
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
    }
    refresh();
  }

  function update(items, patch, source) {
    const byId = new Map(items.map((item) => [item.id, patch(item)]));
    const current = getObjects();
    const next = current.map((item) => {
      const changes = byId.get(item.id);
      if (!changes) return item;
      const updated = updatePosterContent(item, changes);
      return Object.keys(changes).some((key) => updated[key] !== item[key]) ? updated : item;
    });
    if (next.some((item, index) => item !== current[index])) apply(next, source);
  }

  function scaleLimits(items, size = 1) {
    let min = 0;
    let max = Infinity;
    for (const { width, height, fontSize } of items) {
      min = Math.max(min, minBoxSize / width, minBoxSize / height, fontSize ? minFontSize / fontSize : 0);
      max = Math.min(max, maxBoxSize / width, maxBoxSize / height, fontSize ? maxFontSize / fontSize : Infinity);
    }
    return { min: min * size, max: max * size };
  }

  function scaleItems(items, factor, anchor, source) {
    if (!Number.isFinite(factor)) return;
    const { min, max } = scaleLimits(items);
    const ratio = clamp(factor, min, max);
    update(items, (item) => ({
      x: anchor.x + (item.x - anchor.x) * ratio, y: anchor.y + (item.y - anchor.y) * ratio,
      width: item.width * ratio, height: item.height * ratio,
      ...(item.type === 'text' && { fontSize: item.fontSize * ratio, padding: item.padding * ratio }),
    }), source);
  }

  function resizeText(item, dx, dy) {
    const { layout, bounds, anchor, horizontal, vertical } = drag;
    const width = dx ? clamp((bounds.width + horizontal * dx) / layout.width, minBoxSize, maxBoxSize) : item.width;
    const height = dy ? clamp((bounds.height + vertical * dy) / layout.height, minBoxSize, maxBoxSize) : item.height;
    const x = horizontal < 0 ? anchor.x - width : item.x;
    const y = vertical < 0 ? anchor.y - posterContentBounds({ ...item, width, height }, layout).height / layout.height : item.y;
    update([item], () => ({ x, y, width, height }), transform);
  }

  function addObjects(incoming) {
    const current = getObjects();
    const next = readPosterContent([...current, ...incoming]);
    const added = next.slice(current.length);
    if (added.length) {
      selectedIds.clear();
      for (const { id } of added) selectedIds.add(id);
      apply([...current, ...added]);
    }
    return added.length;
  }

  async function addArtwork(sources, position) {
    if (!sources.length) return;
    const version = importVersion;
    const current = getObjects();
    const room = maxPosterContentItems - current.length;
    let size = current.reduce((total, item) => total + (item.source?.length ?? 0), 0);
    let exceeded = sources.length > room;
    let error;
    const imported = [];
    for (const source of sources.slice(0, room)) {
      try {
        const item = await importPosterContent(source, getLayout());
        if (version !== importVersion) return;
        if (size + item.source.length > maxPosterContentData) {
          exceeded = true;
          continue;
        }
        size += item.source.length;
        imported.push(position ? updatePosterContent(item, {
          x: position.x - item.width / 2, y: position.y - item.height / 2,
        }) : item);
      } catch (failure) { error ??= failure; }
      if (version !== importVersion) return;
    }
    const added = addObjects(imported);
    if (exceeded || added < imported.length) notify('The poster has reached its artwork limit.');
    else if (error) notify(error.message || 'The artwork could not be imported.');
    else if (added) notify(added === 1 ? 'Artwork added.' : `${added} items added.`);
  }

  async function addAsset(asset, position) {
    const version = importVersion;
    try {
      const response = await fetch(asset.source, { mode: 'same-origin' });
      if (!response.ok) throw new Error('The artwork could not be loaded.');
      const blob = await response.blob();
      if (version !== importVersion) return;
      const file = new File([blob], asset.name, { type: 'image/svg+xml' });
      await addArtwork([file], position);
    } catch {
      if (version === importVersion) notify('The artwork could not be loaded.');
    }
  }

  function clearAssetDrag() {
    draggedAsset = undefined;
    delete stage.dataset.posterAssetDrop;
  }

  function isAssetDrag(event) {
    return isActive() && draggedAsset && event.dataTransfer?.types.includes(assetDragType);
  }

  gallery.addEventListener('click', (event) => {
    const asset = assets.get(event.target.closest('[data-poster-asset]'));
    if (asset) void addAsset(asset);
  });
  gallery.addEventListener('dragstart', (event) => {
    draggedAsset = assets.get(event.target.closest('[data-poster-asset]'));
    if (!draggedAsset || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(assetDragType, draggedAsset.source);
  });
  gallery.addEventListener('dragend', clearAssetDrag);
  artboard.addEventListener('dragover', (event) => {
    if (!isAssetDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    stage.dataset.posterAssetDrop = '';
  });
  artboard.addEventListener('dragleave', (event) => {
    if (!artboard.contains(event.relatedTarget)) delete stage.dataset.posterAssetDrop;
  });
  artboard.addEventListener('drop', (event) => {
    if (!isAssetDrag(event) || event.dataTransfer.getData(assetDragType) !== draggedAsset.source) return;
    event.preventDefault();
    const asset = draggedAsset;
    clearAssetDrag();
    if (!stage.getScreenCTM()) return;
    const { x, y } = point(event);
    const { width, height } = getLayout();
    void addAsset(asset, { x: clamp(x / width, 0, 1), y: clamp(y / height, 0, 1) });
  });

  function removeSelected() {
    const next = getObjects().filter(({ id }) => !selectedIds.has(id));
    selectedIds.clear();
    apply(next);
  }

  function alignItems(axis, value) {
    const items = selection();
    if (!items.length || !value) return;
    const layout = getLayout();
    const field = axis === 'x' ? 'width' : 'height';
    const align = { left: 0, top: 0, center: .5, middle: .5, right: 1, bottom: 1 }[value];
    const target = items.length === 1 ? { x: 0, y: 0, ...layout } : groupBounds(items, layout);
    update(items, (item) => {
      const bounds = posterContentBounds(item, layout);
      return { [axis]: (target[axis] + (target[field] - bounds[field]) * align) / layout[field] };
    });
  }

  function point(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(stage.getScreenCTM().inverse());
  }

  function startDrag(event, corner) {
    const items = selection();
    if (!items.length) return;
    const layout = getLayout();
    const bounds = groupBounds(items, layout);
    const [horizontal, vertical] = corners[corner] ?? [1, 1];
    const anchor = {
      x: (bounds.x + (horizontal < 0 ? bounds.width : 0)) / layout.width,
      y: (bounds.y + (vertical < 0 ? bounds.height : 0)) / layout.height,
    };
    finishEdit();
    stage.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, start: point(event), items, layout, corner, bounds, anchor, horizontal, vertical };
    stage.dataset.posterContentDrag = corner ?? 'move';
  }

  function endDrag(cancelled) {
    const pointer = drag.pointer;
    drag = undefined;
    delete stage.dataset.posterContentDrag;
    if (stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
    if (cancelled) cancelEdit(transform);
    else finishEdit(transform);
  }

  function pointerDown(event) {
    if (event.button !== 0 || drag) return;
    const id = event.target.closest('[data-poster-content]')?.dataset.posterContent;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    if (event.shiftKey && id) select(id, true);
    else if (id) {
      if (!selectedIds.has(id)) select(id);
      startDrag(event);
    } else select();
  }

  transform.addEventListener('pointerdown', (event) => {
    const corner = event.target.dataset.posterContentHandle;
    if (event.button !== 0 || drag || !corner) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    startDrag(event, corner);
  });
  stage.addEventListener('pointermove', (event) => {
    if (drag?.pointer !== event.pointerId) return;
    const { start, items, layout, corner, bounds, anchor, horizontal, vertical } = drag;
    const next = point(event);
    const dx = next.x - start.x;
    const dy = next.y - start.y;
    if (corner) {
      if (items.length === 1 && items[0].type === 'text') {
        resizeText(items[0], dx, dy);
        return;
      }
      const vx = horizontal * bounds.width;
      const vy = vertical * bounds.height;
      scaleItems(items, 1 + (dx * vx + dy * vy) / (vx * vx + vy * vy), anchor, transform);
    } else {
      update(items, (item) => ({ x: item.x + dx / layout.width, y: item.y + dy / layout.height }), transform);
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stage.addEventListener(type, (event) => {
      if (drag?.pointer === event.pointerId) endDrag(event.type !== 'pointerup');
    });
  }

  function keyDown(event) {
    if (!isActive() || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (event.key === 'Escape') {
      if (drag) endDrag(true);
      else if (selectedIds.size) select();
      else return;
      event.preventDefault();
      return;
    }
    const items = selection();
    if (drag || !items.length) return;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      removeSelected();
    } else if (Object.hasOwn(keyDirections, event.key)) {
      event.preventDefault();
      const [x, y] = keyDirections[event.key];
      const step = event.shiftKey ? 10 : 1;
      const layout = getLayout();
      update(items, (item) => ({ x: item.x + x * step / layout.width, y: item.y + y * step / layout.height }), transform);
    }
  }

  control('add-text').addEventListener('click', () => {
    const item = createPosterTextContent(control('preset').value);
    if (!addObjects([item])) {
      notify('The poster has reached its content limit.');
      return;
    }
    control('text').focus();
    control('text').select();
  });
  control('import').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const sources = [...file.files];
    file.value = '';
    void addArtwork(sources);
  });
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-content-id]');
    if (item) select(item.dataset.contentId, event.shiftKey);
  });
  control('remove').addEventListener('click', removeSelected);
  for (const axis of ['x', 'y']) {
    control(`align-${axis}`).addEventListener('click', (event) => {
      alignItems(axis, event.target.closest('button[data-align]')?.dataset.align);
    });
  }
  function editText(patch, source) {
    const items = selection();
    if (items.length === 1 && items[0].type === 'text') update(items, () => patch, source);
  }

  textAlignment.addEventListener('click', (event) => {
    const align = event.target.closest('button[data-text-align]')?.dataset.textAlign;
    if (align) editText({ align });
  });
  swatches.addEventListener('click', (event) => {
    const color = event.target.closest('button[data-color]')?.dataset.color;
    if (!color) return;
    editText({ color: color === getLayout().textColor.toLowerCase() ? '' : color });
  });
  backgroundSwatches.addEventListener('click', (event) => {
    const background = event.target.closest('button[data-color]')?.dataset.color;
    if (background) editText({ background });
  });
  backgroundNone.addEventListener('click', () => editText({ background: '' }));
  for (const [name, key, value] of [
    ['text', 'text', (input) => input.value],
    ['style', 'style', (input) => input.value],
    ['text-size', 'fontSize', (input) => input.valueAsNumber / getLayout().width],
    ['text-color', 'color', (input) => input.value],
    ['background-color', 'background', (input) => input.value],
    ['padding', 'padding', (input) => input.valueAsNumber / getLayout().width],
  ]) {
    const input = control(name);
    const edit = (event) => {
      if (!event.isComposing && input.validity.valid) editText({ [key]: value(input) }, input);
    };
    input.addEventListener('input', edit);
    input.addEventListener('compositionend', edit);
    const commit = () => {
      finishEdit(input);
      refresh();
    };
    if (name !== 'text') input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
  }
  for (const [name, axis] of [['scale', 'width'], ['asset-height', 'height']]) {
    const input = control(name);
    input.addEventListener('input', () => {
      const items = selection();
      const value = input.valueAsNumber;
      if (!items.length || !input.validity.valid || !Number.isFinite(value)) return;
      const layout = getLayout();
      const text = items.length === 1 && items[0].type === 'text';
      if (text && axis === 'width') {
        editText({ width: value / layout.width }, input);
      } else if (axis === 'width' || (items.length === 1 && !text)) {
        const bounds = groupBounds(items, layout);
        scaleItems(items, value / bounds[axis], { x: bounds.x / layout.width, y: bounds.y / layout.height }, input);
      }
    });
    const commit = () => {
      finishEdit(input);
      refresh();
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
  }
  document.addEventListener('keyup', (event) => {
    if (Object.hasOwn(keyDirections, event.key)) finishEdit(transform);
  });
  window.addEventListener('blur', () => { if (!drag) finishEdit(transform); });

  return {
    refresh, renderTransform, pointerDown, keyDown,
    get dragging() { return Boolean(drag); },
    paste(event) {
      const sources = posterContentClipboard(event.clipboardData);
      if (!sources.length) return;
      event.preventDefault();
      void addArtwork(sources);
    },
    reset() {
      selectedIds.clear();
      clearAssetDrag();
      importVersion++;
    },
  };
}
