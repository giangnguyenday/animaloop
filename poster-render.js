const SVG_NS = 'http://www.w3.org/2000/svg';
const fontUrl = new URL('./src/fonts/google-sans-flex-poster.ttf.gz', import.meta.url);
const fontFamily = 'Google Sans Flex Poster';
const fontSize = 1000;
const weight = 700;
const minWidth = 25;
const maxWidth = 151;
const fallbackFamily = 'sans-serif';

// The poster face retains the width axis of the official Google Sans Flex font.
const fontDescriptors = { weight: String(weight), stretch: `${minWidth}% ${maxWidth}%` };
let font;
let fontBytes;
let harfBuzz;
let shapingBuffer;
let fontPromise;
let embeddedFontStyle;
let measureContext;
const glyphCache = new Map();

async function loadFont() {
  const [shaper, response] = await Promise.all([
    import('./src/vendor/harfbuzz/index.mjs'),
    fetch(fontUrl),
  ]);
  if (!response.ok) throw new Error('The poster font could not be downloaded.');
  let bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, 2);
  if (header[0] === 0x1f && header[1] === 0x8b) {
    const uncompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = await new Response(uncompressed).arrayBuffer();
  }
  const face = new FontFace(fontFamily, bytes, fontDescriptors);
  await face.load();
  document.fonts.add(face);
  harfBuzz = shaper;
  font = new shaper.Font(new shaper.Face(new shaper.Blob(bytes)));
  font.setScale(fontSize, fontSize);
  shapingBuffer = new shaper.Buffer();
  fontBytes = bytes;
}

export function loadPosterFont() {
  fontPromise ??= loadFont().catch((error) => {
    fontPromise = undefined;
    throw error;
  });
  return fontPromise;
}

function svg(tag, attributes) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function embeddedFont() {
  if (!embeddedFontStyle) {
    const bytes = new Uint8Array(fontBytes);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    embeddedFontStyle = `@font-face { font-family: '${fontFamily}'; font-weight: ${weight}; font-stretch: ${fontDescriptors.stretch}; src: url('data:font/ttf;base64,${btoa(binary)}') format('truetype'); }`;
  }
  const style = svg('style', {});
  style.textContent = embeddedFontStyle;
  return style;
}

function glyphAtWidth(letter, width) {
  const key = `${letter}:${width}`;
  if (!glyphCache.has(key)) {
    font.setVariations([new harfBuzz.Variation('wdth', width)]);
    shapingBuffer.reset();
    shapingBuffer.addText(letter);
    shapingBuffer.guessSegmentProperties();
    harfBuzz.shape(font, shapingBuffer);

    const positions = shapingBuffer.getGlyphInfosAndPositions();
    const supported = positions.length > 0 && positions.every(({ codepoint }) => codepoint !== 0);
    let advanceX = 0;
    let advanceY = 0;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const glyphs = [];
    for (const { codepoint, xOffset, yOffset, xAdvance, yAdvance } of positions) {
      const x = advanceX + xOffset;
      const y = advanceY + yOffset;
      const bounds = font.glyphExtents(codepoint);
      if (bounds) {
        left = Math.min(left, x + bounds.xBearing);
        top = Math.min(top, -y - bounds.yBearing);
        right = Math.max(right, x + bounds.xBearing + bounds.width);
        bottom = Math.max(bottom, -y - bounds.yBearing - bounds.height);
        glyphs.push({ codepoint, x, y });
      }
      advanceX += xAdvance;
      advanceY += yAdvance;
    }

    if (glyphCache.size >= 3000) glyphCache.clear();
    glyphCache.set(key, { glyphs, supported, x: left, y: top, width: right - left, height: bottom - top });
  }
  return glyphCache.get(key);
}

function fitLetter(letter, targetWidth, targetHeight) {
  const targetRatio = targetWidth / targetHeight;
  const narrowest = glyphAtWidth(letter, minWidth);
  const widest = glyphAtWidth(letter, maxWidth);
  if (targetRatio <= narrowest.width / narrowest.height) {
    return { ...narrowest, variationWidth: minWidth };
  }
  if (targetRatio >= widest.width / widest.height) {
    return { ...widest, variationWidth: maxWidth };
  }
  let narrow = minWidth;
  let wide = maxWidth;
  while (wide - narrow > .5) {
    const middle = Math.round(narrow + wide) / 2;
    const shape = glyphAtWidth(letter, middle);
    if (shape.width / shape.height < targetRatio) narrow = middle;
    else wide = middle;
  }
  const width = (narrow + wide) / 2;
  return { ...glyphAtWidth(letter, width), variationWidth: width };
}

function fallbackGlyph(letter) {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d');
    measureContext.font = `${weight} ${fontSize}px ${fallbackFamily}`;
  }
  const metrics = measureContext.measureText(letter);
  return {
    x: -metrics.actualBoundingBoxLeft,
    y: -metrics.actualBoundingBoxAscent,
    width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
    height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
  };
}

function drawLetter(cell, color, outline, allowFallbackText) {
  const letter = cell.text.normalize('NFC');
  const { supported } = glyphAtWidth(letter, 100);
  if (outline && !supported && !allowFallbackText) {
    throw new Error(`Google Sans Flex does not include “${cell.text}”. Choose SVG with editable text to keep this character.`);
  }
  const targetWidth = cell.width * .94;
  const targetHeight = cell.height * .98;
  const glyph = supported ? fitLetter(letter, targetWidth, targetHeight) : fallbackGlyph(letter);
  if (!(glyph.width > 0 && glyph.height > 0)) return;

  const scaleY = targetHeight / glyph.height;
  const naturalWidth = glyph.width * scaleY;
  // Extend the width range only once the native axis reaches its limit.
  const atWidthLimit = glyph.variationWidth === minWidth || glyph.variationWidth === maxWidth;
  const scaleX = !supported || atWidthLimit || naturalWidth > targetWidth ? targetWidth / glyph.width : scaleY;
  const x = cell.x + (cell.width - glyph.width * scaleX) / 2 - glyph.x * scaleX;
  const y = cell.y + (cell.height - targetHeight) / 2 - glyph.y * scaleY;
  const attributes = { fill: color, transform: `translate(${x} ${y}) scale(${scaleX} ${scaleY})` };

  if (outline && supported) {
    font.setVariations([new harfBuzz.Variation('wdth', glyph.variationWidth)]);
    const outlines = svg('g', {
      fill: color,
      transform: `translate(${x} ${y}) scale(${scaleX} ${-scaleY})`,
    });
    for (const { codepoint, x: dx, y: dy } of glyph.glyphs) {
      const path = font.glyphToPath(codepoint);
      if (path) outlines.append(svg('path', { d: path, transform: `translate(${dx} ${dy})` }));
    }
    return outlines;
  }

  const text = svg('text', {
    ...attributes,
    'font-family': supported ? `'${fontFamily}', 'Google Sans Flex', ${fallbackFamily}` : fallbackFamily,
    'font-size': fontSize,
    'font-weight': weight,
  });
  if (supported) {
    text.setAttribute('style', `font-variation-settings: 'wdth' ${glyph.variationWidth}; font-optical-sizing: none;`);
  }
  text.textContent = cell.text;
  return text;
}

export function renderPoster(stage, layout, {
  outline = false,
  embedFont = false,
  allowFallbackText = false,
  crispBlocks = false,
  width = layout.width,
  height = layout.height,
} = {}) {
  if (!font) throw new Error('The poster font is still loading.');
  stage.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  stage.setAttribute('width', width);
  stage.setAttribute('height', height);

  const content = document.createDocumentFragment();
  if (embedFont && !outline) content.append(embeddedFont());
  content.append(svg('rect', { width: layout.width, height: layout.height, fill: layout.background }));
  for (const cell of layout.cells) {
    const group = svg('g', { 'data-cell': cell.id });
    group.append(svg('rect', {
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      fill: cell.color,
      // Fractional shared edges can otherwise reveal the artboard between two antialiased fills.
      ...(crispBlocks && { 'shape-rendering': 'crispEdges' }),
    }));
    if (cell.text?.trim()) {
      const letter = drawLetter(cell, layout.textColor, outline, allowFallbackText);
      if (letter) group.append(letter);
    }
    content.append(group);
  }
  stage.replaceChildren(content);
  return stage;
}
