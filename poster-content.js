import { isPosterFontLoaded, posterContentFontFamily, shapePosterContentLine } from './poster-render.js?v=poster-background';
import { layoutJumble } from './poster-jumble.js';

const svgNamespace = 'http://www.w3.org/2000/svg';
const maxVectorLength = 1_500_000;
const maxRasterBytes = 6_000_000;
const maxRasterLength = Math.ceil(maxRasterBytes / 3) * 4 + 32;
const maxTextLength = 2500;
export const maxPosterContentItems = 100;
export const maxPosterContentData = 16_000_000;

const textStyles = {
  body: { weight: 700, width: 100, tracking: .03 },
  note: { weight: 500, width: 100, tracking: .03, uppercase: true },
  wide: { weight: 700, width: 151, tracking: .03 },
  jumble: { weight: 900, tracking: -.01, uppercase: true, randomWidth: true },
};
const textAlignment = { left: 'start', center: 'middle', right: 'end' };
const labelName = { image: 'Image', svg: 'Vector', text: 'Text' };
const ids = /^[\w.-]{1,120}$/;
const rasterTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const rasterMimes = new Set(Object.values(rasterTypes));
const rasterDataPrefix = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,/;
const base64Data = /^[A-Za-z0-9+/]+={0,2}$/;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const vectorCache = new Map();
const textLayoutCache = new Map();

const vectorTags = new Set(('svg g defs symbol use path rect circle ellipse line polyline polygon '
  + 'linearGradient radialGradient stop clipPath mask pattern marker image text tspan textPath title desc').split(' '));
const geometryAttributes = new Set(('id x y x1 x2 y1 y2 cx cy fx fy fr r rx ry dx dy width height points d pathLength '
  + 'viewBox preserveAspectRatio transform gradientTransform gradientUnits spreadMethod offset '
  + 'clipPathUnits maskUnits maskContentUnits patternUnits patternContentUnits patternTransform '
  + 'markerWidth markerHeight markerUnits refX refY orient textLength lengthAdjust startOffset rotate').split(' '));
const presentationAttributes = new Set(('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap '
  + 'stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset clip-rule clip-path mask opacity '
  + 'color stop-color stop-opacity marker-start marker-mid marker-end vector-effect paint-order shape-rendering '
  + 'font-family font-size font-style font-stretch font-weight letter-spacing word-spacing text-anchor '
  + 'dominant-baseline alignment-baseline baseline-shift text-decoration direction unicode-bidi '
  + 'visibility display overflow').split(' '));
const referenceAttributes = new Set(['fill', 'stroke', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end']);
const referenceElements = new Set(['use', 'linearGradient', 'radialGradient', 'pattern', 'textPath']);
const fragmentId = /^[\w.:-]+$/;
const localUrl = /^url\(\s*['"]?#([\w.:-]+)['"]?\s*\)$/i;

function svg(tag, attributes = {}) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function bounded(value, limitLow, limitHigh, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(limitLow, Math.min(limitHigh, value)) : fallback;
}

function contentColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '';
}

export function maxPosterContentPadding(width) {
  return width * .45;
}

function textPadding(padding, width) {
  return bounded(padding, 0, maxPosterContentPadding(width), 0);
}

function objectId() {
  return `content-${crypto.randomUUID()}`;
}

function rasterHeaderMatches(type, header) {
  switch (type) {
    case 'image/png': return header.startsWith('\x89PNG\r\n\x1a\n');
    case 'image/jpeg': return header.startsWith('\xff\xd8\xff');
    case 'image/webp': return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
    case 'image/gif': return header.startsWith('GIF87a') || header.startsWith('GIF89a');
    case 'image/avif': return header.slice(4, 8) === 'ftyp' && /avi[fs]/.test(header.slice(8));
    default: return false;
  }
}

function validRaster(source) {
  if (typeof source !== 'string' || source.length > maxRasterLength) return false;
  const prefix = rasterDataPrefix.exec(source);
  if (!prefix) return false;
  const bytes = source.slice(prefix[0].length);
  return bytes.length % 4 === 0 && base64Data.test(bytes) && rasterHeaderMatches(prefix[1], atob(bytes.slice(0, 64)));
}

function contentGeometry(input) {
  return {
    x: bounded(input.x, -4, 4, .2), y: bounded(input.y, -4, 4, .2),
    width: bounded(input.width, .01, 4, .6), height: bounded(input.height, .01, 4, .15),
  };
}

function normalizeContent(input) {
  if (!input || !Object.hasOwn(labelName, input.type) || typeof input.id !== 'string' || !ids.test(input.id)) return;
  const item = { id: input.id, type: input.type, ...contentGeometry(input) };
  if (item.type === 'text') {
    return {
      ...item,
      text: typeof input.text === 'string' ? input.text.slice(0, maxTextLength).toWellFormed() : '',
      style: Object.hasOwn(textStyles, input.style) ? input.style : 'body',
      align: Object.hasOwn(textAlignment, input.align) ? input.align : 'left',
      fontSize: bounded(input.fontSize, .004, .6, .04),
      lineHeight: bounded(input.lineHeight, .8, 2.5, 1.2),
      color: contentColor(input.color),
      background: contentColor(input.background),
      padding: textPadding(input.padding, item.width),
    };
  }
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : labelName[item.type];
  if (item.type === 'image' && validRaster(input.source)) return { ...item, name, source: input.source };
  if (item.type === 'svg' && typeof input.source === 'string' && input.source.length <= maxVectorLength) {
    return { ...item, name, source: input.source };
  }
}

export function readPosterContent(input) {
  if (!Array.isArray(input)) return [];
  const result = [];
  const seen = new Set();
  let totalData = 0;
  for (const candidate of input.slice(0, maxPosterContentItems)) {
    const item = normalizeContent(candidate);
    if (!item || seen.has(item.id)) continue;
    if (item.type === 'svg') {
      try { item.source = vectorArtwork(item.source).source; }
      catch { continue; }
    }
    const length = item.source?.length ?? 0;
    if (totalData + length > maxPosterContentData) continue;
    totalData += length;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function createPosterTextContent(style = 'body') {
  return normalizeContent({ id: objectId(), type: 'text', style, x: .2, y: .18, width: .6, height: .045,
    text: 'Your text' });
}

export function updatePosterContent(object, patch) {
  const next = { ...object, ...patch };
  return object.type === 'text'
    ? normalizeContent({ ...next, id: object.id, type: object.type })
    : { ...object, ...contentGeometry(next) };
}

function firstSvg(text) {
  if (!text || text.length > maxVectorLength * 2) return;
  const startTags = /<\/?svg(?=[\s/>])[^>]*>/gi;
  let start;
  let depth = 0;
  for (const tag of text.matchAll(startTags)) {
    if (tag[0].startsWith('</')) {
      if (depth && --depth === 0) return text.slice(start, tag.index + tag[0].length);
    } else {
      if (!depth) start = tag.index;
      if (!tag[0].endsWith('/>')) depth++;
      else if (!depth) return tag[0];
    }
  }
}

function fileType(file) {
  const extension = file.name?.split('.').at(-1).toLowerCase();
  if (file.type === 'image/svg+xml' || extension === 'svg') return 'image/svg+xml';
  return rasterMimes.has(file.type) ? file.type : rasterTypes[extension];
}

export function posterContentClipboard(dataTransfer) {
  if (!dataTransfer) return [];
  const files = [...dataTransfer.files];
  const vectors = files.filter((file) => fileType(file) === 'image/svg+xml');
  if (vectors.length) return vectors;
  for (const format of ['image/svg+xml', 'text/plain', 'text/html']) {
    const vector = firstSvg(dataTransfer.getData(format));
    if (vector) return [vector];
  }
  return files.filter((file) => rasterMimes.has(fileType(file)));
}

function safePresentationValue(name, rawValue) {
  const value = rawValue.trim();
  const reference = referenceAttributes.has(name) && localUrl.exec(value);
  if (reference) return `url(#${reference[1]})`;
  if (value.length > 160) return;
  if (!value || /[\\;{}<>]|(?:url|var)\s*\(|(?:https?|data|javascript|blob):/i.test(value)) return;
  return value;
}

function vectorDeclarations(css) {
  const declarations = [];
  for (const declaration of css.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator === -1) continue;
    const name = declaration.slice(0, separator).trim().toLowerCase();
    if (!presentationAttributes.has(name)) continue;
    const value = safePresentationValue(name, declaration.slice(separator + 1).replace(/\s*!important\s*$/i, ''));
    if (value !== undefined) declarations.push([name, value]);
  }
  return declarations;
}

function vectorStyleRules(root) {
  const rules = new Map();
  for (const style of root.querySelectorAll('style')) {
    const css = style.textContent.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declarations = vectorDeclarations(body);
      for (const selector of selectors.split(',').map((part) => part.trim())) {
        if (!/^[.#]?[\w-]+$/.test(selector)) continue;
        if (!rules.has(selector)) rules.set(selector, new Map());
        const rule = rules.get(selector);
        for (const [name, value] of declarations) rule.set(name, value);
      }
    }
  }
  return rules;
}

function cleanVectorElement(original, rules, depth) {
  if (depth > 96 || !vectorTags.has(original.localName)
    || (original.namespaceURI && original.namespaceURI !== svgNamespace)) return;
  const element = svg(original.localName);
  for (const { localName: name, value, namespaceURI } of original.attributes) {
    if (name === 'href' && (!namespaceURI || namespaceURI === 'http://www.w3.org/1999/xlink')) {
      if (referenceElements.has(element.localName) && value.startsWith('#') && fragmentId.test(value.slice(1))) {
        element.setAttribute(name, value);
      }
      if (element.localName === 'image' && validRaster(value)) element.setAttribute(name, value);
    }
    if (namespaceURI) continue;
    if (geometryAttributes.has(name) && (name !== 'id' || fragmentId.test(value))) element.setAttribute(name, value);
    if (presentationAttributes.has(name)) {
      const cleaned = safePresentationValue(name, value);
      if (cleaned !== undefined) element.setAttribute(name, cleaned);
    }
  }

  const classes = (original.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
  const selectors = [original.localName, ...classes.map((name) => `.${name}`), `#${original.getAttribute('id')}`];
  for (const selector of selectors) {
    for (const [name, value] of rules.get(selector) ?? []) element.setAttribute(name, value);
  }
  for (const [name, value] of vectorDeclarations(original.getAttribute('style') ?? '')) element.setAttribute(name, value);

  for (const child of original.childNodes) {
    if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
      if (['text', 'tspan', 'textPath', 'title', 'desc'].includes(original.localName)) element.append(child.textContent);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const cleaned = cleanVectorElement(child, rules, depth + 1);
      if (cleaned) element.append(cleaned);
    }
  }
  return element;
}

function vectorArtwork(source) {
  const cached = vectorCache.get(source);
  if (cached) return cached;
  if (source.length > maxVectorLength) throw new Error('Choose an SVG smaller than 1.5 MB.');
  const markup = firstSvg(source);
  if (!markup) throw new Error('Choose a valid SVG file.');
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('Choose a valid SVG file.');
  if (root.querySelectorAll('*').length > 5000) throw new Error('Choose an SVG with fewer than 5,000 elements.');
  const element = cleanVectorElement(root, vectorStyleRules(root), 0);
  if (!element?.querySelector('path, rect, circle, ellipse, line, polyline, polygon, text, use, image')) {
    throw new Error('The SVG has no supported artwork.');
  }
  const viewBox = element.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number) ?? [];
  const dimensions = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
    ? viewBox : [0, 0, Number.parseFloat(element.getAttribute('width')) || 300, Number.parseFloat(element.getAttribute('height')) || 150];
  const [, , width, height] = dimensions;
  if (!(width > 0 && height > 0 && width <= 1_000_000 && height <= 1_000_000)) {
    throw new Error('The SVG artboard size is invalid.');
  }
  element.setAttribute('viewBox', dimensions.join(' '));
  const safeSource = new XMLSerializer().serializeToString(element);
  if (safeSource.length > maxVectorLength) throw new Error('Choose a simpler SVG under 1.5 MB.');
  const artwork = { element, width, height, source: safeSource, instances: new Map() };
  for (const key of new Set([source, safeSource])) {
    if (vectorCache.size >= 10) vectorCache.delete(vectorCache.keys().next().value);
    vectorCache.set(key, artwork);
  }
  return artwork;
}

function assetBounds(naturalWidth, naturalHeight, { width, height }) {
  const scale = Math.min(width * .6 / naturalWidth, height * .6 / naturalHeight);
  const boxWidth = naturalWidth * scale / width;
  const boxHeight = naturalHeight * scale / height;
  return { width: boxWidth, height: boxHeight, x: (1 - boxWidth) / 2, y: (1 - boxHeight) / 2 };
}

function readDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(reader.error), { once: true });
    reader.readAsDataURL(blob);
  });
}

export async function importPosterContent(source, size) {
  const type = typeof source === 'string' ? 'image/svg+xml' : fileType(source);
  const name = source.name;
  if (type === 'image/svg+xml') {
    if (source.size > maxVectorLength) throw new Error('Choose an SVG smaller than 1.5 MB.');
    const raw = typeof source === 'string' ? source : await source.text();
    const artwork = vectorArtwork(raw);
    return normalizeContent({
      id: objectId(), type: 'svg', name, source: artwork.source, ...assetBounds(artwork.width, artwork.height, size),
    });
  }
  if (!rasterMimes.has(type)) throw new Error('Choose an SVG, PNG, JPEG, WebP, GIF, or AVIF file.');
  if (source.size > maxRasterBytes) throw new Error('Choose an image smaller than 6 MB.');
  const blob = new Blob([source], { type });
  const header = new Uint8Array(await blob.slice(0, 48).arrayBuffer());
  if (!rasterHeaderMatches(type, String.fromCharCode(...header))) throw new Error('The image file format could not be read.');
  const url = URL.createObjectURL(blob);
  let width;
  let height;
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    ({ naturalWidth: width, naturalHeight: height } = image);
  } catch {
    throw new Error('The image could not be opened.');
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!width || !height || width * height > 64_000_000) throw new Error('Choose an image under 64 megapixels.');
  return normalizeContent({
    id: objectId(), type: 'image', name, source: await readDataUrl(blob), ...assetBounds(width, height, size),
  });
}

function wrapWord(word, measure, lineWidth) {
  const letters = [...graphemeSegmenter.segment(word)].map(({ segment }) => segment);
  const pieces = [];
  for (let start = 0; start < letters.length;) {
    const chunk = (end) => letters.slice(start, end).join('');
    let end = start + 1;
    let probe = Math.min(letters.length, start + 2);
    while (probe > end && measure(chunk(probe)) <= lineWidth) {
      end = probe;
      probe = Math.min(letters.length, start + 2 * (probe - start));
    }
    while (probe - end > 1) {
      const middle = Math.floor((end + probe) / 2);
      if (measure(chunk(middle)) <= lineWidth) end = middle;
      else probe = middle;
    }
    pieces.push(chunk(end));
    start = end;
  }
  return pieces;
}

function wrapParagraph(text, measure, lineWidth) {
  if (!text.trim()) return [''];
  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= lineWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    const pieces = measure(word) > lineWidth ? wrapWord(word, measure, lineWidth) : [word];
    line = pieces.pop();
    lines.push(...pieces);
  }
  if (line) lines.push(line);
  return lines;
}

export function posterContentDisplayText({ text, style }) {
  return textStyles[style]?.uppercase ? text.toUpperCase() : text;
}

function textLayout(item) {
  const variation = textStyles[item.style];
  const lineWidth = (item.width - 2 * textPadding(item.padding, item.width)) / item.fontSize;
  const seed = variation.randomWidth ? item.id : '';
  const key = `${isPosterFontLoaded()}:${item.style}:${seed}:${lineWidth.toPrecision(12)}:${item.text}`;
  const cached = textLayoutCache.get(key);
  if (cached) return cached;
  const text = posterContentDisplayText(item);
  const measure = (line) => shapePosterContentLine(line, variation).advance;
  const lines = variation.randomWidth
    ? layoutJumble(text, {
      seed,
      lineWidth,
      tracking: variation.tracking,
      measure: (letter, width) => shapePosterContentLine(letter, { width, weight: variation.weight, tracking: 0 }).advance,
    })
    : text.split(/\r\n?|\n/).flatMap((paragraph) => wrapParagraph(paragraph, measure, lineWidth));
  const layout = { lines, variation };
  if (textLayoutCache.size >= 100) textLayoutCache.delete(textLayoutCache.keys().next().value);
  textLayoutCache.set(key, layout);
  return layout;
}

export function posterContentBounds(item, { width, height }) {
  const box = { x: item.x * width, y: item.y * height, width: item.width * width, height: item.height * height };
  if (item.type === 'text') {
    const copyHeight = textLayout(item).lines.length * item.fontSize * width * item.lineHeight;
    box.height = Math.max(box.height, copyHeight + 2 * textPadding(item.padding, item.width) * width);
  }
  return box;
}

function fontVariations({ width, weight }) {
  return `font-variation-settings: 'wdth' ${width}, 'wght' ${weight}`;
}

function contentTextElement({ x, y, fill, pixelSize }, variation, anchor, fallback = false) {
  return svg('text', {
    x, y, fill, 'font-family': fallback ? 'sans-serif' : `'${posterContentFontFamily}', sans-serif`,
    'text-anchor': anchor, 'font-size': pixelSize, 'font-weight': variation.weight,
    'letter-spacing': `${variation.tracking}em`,
    style: `${fontVariations(variation)}; font-optical-sizing: none; font-variant-ligatures: none`,
  });
}

function drawContentRun(group, text, position, variation, { outline, allowFallbackText }) {
  const { x, y, fill, pixelSize, align, anchor } = position;
  const shaped = outline ? shapePosterContentLine(text, { ...variation, outline: true }) : undefined;
  if (shaped?.supported) {
    const paths = svg('g', { fill });
    for (const { path, x: dx, y: dy } of shaped.paths) {
      const left = x + (dx - shaped.advance * align) * pixelSize;
      paths.append(svg('path', {
        d: path, transform: `translate(${left} ${y + dy * pixelSize}) scale(${pixelSize / shaped.unitsPerEm} ${-pixelSize / shaped.unitsPerEm})`,
      }));
    }
    group.append(paths);
    return;
  }
  if (outline && !allowFallbackText) {
    throw new Error('Some content text cannot be outlined. Choose SVG with editable text to keep it.');
  }
  const element = contentTextElement(position, variation, anchor, outline);
  element.textContent = text;
  group.append(element);
}

function drawJumbleLine(group, { glyphs, advance }, position, variation, options) {
  if (!glyphs.length) return;
  const left = position.x - advance * position.align * position.pixelSize;
  if (options.outline) {
    for (const glyph of glyphs) {
      if (glyph.text === ' ') continue;
      const x = left + glyph.x * position.pixelSize;
      drawContentRun(group, glyph.text, { ...position, x, align: 0, anchor: 'start' },
        { ...variation, width: glyph.width, tracking: 0 }, options);
    }
    return;
  }

  const element = contentTextElement({ ...position, x: left }, { ...variation, width: 100 }, 'start');
  element.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  for (const glyph of glyphs) {
    const span = svg('tspan', {
      x: left + glyph.x * position.pixelSize,
      style: fontVariations({ ...variation, width: glyph.width }),
    });
    span.textContent = glyph.text;
    element.append(span);
  }
  group.append(element);
}

function drawContentText(group, item, box, { width, textColor }, options) {
  const { lines, variation } = textLayout(item);
  const pixelSize = item.fontSize * width;
  const padding = textPadding(item.padding, item.width) * width;
  const fill = item.color || textColor;
  const align = { left: 0, center: .5, right: 1 }[item.align];
  const x = box.x + padding + (box.width - 2 * padding) * align;
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    const y = box.y + padding + pixelSize * (.93 + index * item.lineHeight);
    const position = { x, y, fill, pixelSize, align, anchor: textAlignment[item.align] };
    if (variation.randomWidth) drawJumbleLine(group, line, position, variation, options);
    else drawContentRun(group, line, position, variation, options);
  }
}

function scopedVector(artwork, id) {
  const cached = artwork.instances.get(id);
  if (cached) return cached;
  const element = artwork.element.cloneNode(true);
  const prefix = `asset-${id.length}-${id}-`;
  for (const node of [element, ...element.querySelectorAll('*')]) {
    for (const attribute of node.attributes) {
      const { name, value } = attribute;
      if (name === 'id') attribute.value = prefix + value;
      if (name === 'href' && value.startsWith('#')) attribute.value = `#${prefix}${value.slice(1)}`;
      const reference = referenceAttributes.has(name) && localUrl.exec(value);
      if (reference) attribute.value = `url(#${prefix}${reference[1]})`;
    }
  }
  if (artwork.instances.size >= 4) artwork.instances.delete(artwork.instances.keys().next().value);
  artwork.instances.set(id, element);
  return element;
}

function drawVector(item, box) {
  const element = scopedVector(vectorArtwork(item.source), item.id).cloneNode(true);
  for (const [name, value] of Object.entries(box)) element.setAttribute(name, value);
  return element;
}

export function renderPosterContent(stage, objects, layout, options = {}) {
  if (!objects?.length) return;
  const layer = svg('g', { 'data-poster-content-layer': '' });
  for (const item of objects) {
    const box = posterContentBounds(item, layout);
    const group = svg('g', { 'data-poster-content': item.id });
    if (options.interactive) {
      group.append(svg('rect', { ...box, fill: 'transparent', 'data-poster-content-hit': '' }));
    }
    if (item.type === 'text') {
      if (item.background) group.append(svg('rect', { ...box, fill: item.background, 'data-poster-content-background': '' }));
      drawContentText(group, item, box, layout, options);
    }
    else if (item.type === 'svg') group.append(drawVector(item, box));
    else group.append(svg('image', { ...box, href: item.source }));
    layer.append(group);
  }
  stage.append(layer);
}
