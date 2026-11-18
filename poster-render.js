const SVG_NS = 'http://www.w3.org/2000/svg';
const fontUrl = new URL('./src/fonts/google-sans-flex-poster-variable.ttf.gz', import.meta.url);
const fontFamily = 'Google Sans Flex Poster';
export const posterContentFontFamily = fontFamily;
const fontSize = 1000;
const minWidth = 25;
const maxWidth = 151;
// Block width divided by height, calibrated to the narrow E, round O, and wide M.
const narrowRatio = .35;
const normalRatio = 1.11;
const wideRatio = 2.4;
const lightWeight = 400;
const normalWeight = 700;
const heavyWeight = 1000;
const fallbackFamily = 'sans-serif';

const fontDescriptors = {
  weight: `${lightWeight} ${heavyWeight}`,
  stretch: `${minWidth}% ${maxWidth}%`,
};
let font;
let fontBytes;
let harfBuzz;
let shapingBuffer;
let contentTextFeatures;
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
  contentTextFeatures = [new shaper.Feature('liga', 0), new shaper.Feature('clig', 0)];
  fontBytes = bytes;
}

export function loadPosterFont() {
  fontPromise ??= loadFont().catch((error) => {
    fontPromise = undefined;
    throw error;
  });
  return fontPromise;
}

export function isPosterFontLoaded() {
  return !!font;
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
    embeddedFontStyle = `@font-face { font-family: '${fontFamily}'; font-weight: ${fontDescriptors.weight}; font-stretch: ${fontDescriptors.stretch}; src: url('data:font/ttf;base64,${btoa(binary)}') format('truetype'); }`;
  }
  const style = svg('style', {});
  style.textContent = embeddedFontStyle;
  return style;
}

function weightForAspectRatio(aspectRatio) {
  const ratio = Math.max(narrowRatio, Math.min(wideRatio, aspectRatio));
  if (ratio <= normalRatio) {
    const progress = (ratio - narrowRatio) / (normalRatio - narrowRatio);
    return Math.round(lightWeight + progress * (normalWeight - lightWeight));
  }
  const progress = (ratio - normalRatio) / (wideRatio - normalRatio);
  return Math.round(normalWeight + progress * (heavyWeight - normalWeight));
}

function setGlyphVariations(width, weight) {
  font.setVariations([
    new harfBuzz.Variation('wdth', width),
    new harfBuzz.Variation('wght', weight),
  ]);
}

export function shapePosterContentLine(text, { width, weight, tracking, outline = false }) {
  if (!text) return { advance: 0, supported: false, paths: [] };
  let glyphs = [];
  if (font) {
    setGlyphVariations(width, weight);
    shapingBuffer.reset();
    shapingBuffer.addText(text);
    shapingBuffer.guessSegmentProperties();
    harfBuzz.shape(font, shapingBuffer, contentTextFeatures);
    glyphs = shapingBuffer.getGlyphInfosAndPositions();
  }
  if (!glyphs.length || glyphs.some(({ codepoint }) => codepoint === 0)) {
    measureContext ??= document.createElement('canvas').getContext('2d');
    measureContext.font = `${weight} ${fontSize}px sans-serif`;
    const advance = measureContext.measureText(text).width / fontSize;
    return { advance: advance + Math.max(0, Array.from(text).length - 1) * tracking, supported: false, paths: [] };
  }
  let advance = 0;
  let previousCluster;
  const paths = [];
  for (const { codepoint, cluster, xOffset, yOffset, xAdvance } of glyphs) {
    if (previousCluster !== undefined && cluster !== previousCluster) advance += tracking * fontSize;
    if (outline) {
      const path = font.glyphToPath(codepoint);
      if (path) paths.push({ path, x: (advance + xOffset) / fontSize, y: -yOffset / fontSize });
    }
    advance += xAdvance;
    previousCluster = cluster;
  }
  return { advance: advance / fontSize, supported: true, paths, unitsPerEm: fontSize };
}

function glyphAtWidth(letter, width, weight) {
  const key = `${letter}:${width}:${weight}`;
  if (!glyphCache.has(key)) {
    setGlyphVariations(width, weight);
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
    glyphCache.set(key, {
      glyphs, supported,
      x: left, y: top, width: right - left, height: bottom - top,
      variationWidth: width,
    });
  }
  return glyphCache.get(key);
}

function fitLetter(letter, targetRatio, weight) {
  const narrowest = glyphAtWidth(letter, minWidth, weight);
  if (!narrowest.supported || targetRatio <= narrowest.width / narrowest.height) {
    return narrowest;
  }
  const widest = glyphAtWidth(letter, maxWidth, weight);
  if (targetRatio >= widest.width / widest.height) {
    return widest;
  }
  let narrow = minWidth;
  let wide = maxWidth;
  while (wide - narrow > .5) {
    const middle = Math.round(narrow + wide) / 2;
    const shape = glyphAtWidth(letter, middle, weight);
    if (shape.width / shape.height < targetRatio) narrow = middle;
    else wide = middle;
  }
  return glyphAtWidth(letter, (narrow + wide) / 2, weight);
}

function fallbackGlyph(letter, weight) {
  measureContext ??= document.createElement('canvas').getContext('2d');
  measureContext.font = `${weight} ${fontSize}px ${fallbackFamily}`;
  const metrics = measureContext.measureText(letter);
  return {
    x: -metrics.actualBoundingBoxLeft,
    y: -metrics.actualBoundingBoxAscent,
    width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
    height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
  };
}

function drawLetter(cell, color, padding, outline, allowFallbackText, iWidthCompensation = 0) {
  const letter = cell.text.normalize('NFC');
  // A very narrow block still needs room for a letter when the requested padding exceeds its width.
  let targetWidth = Math.max(cell.width * .1, cell.width - 2 * padding);
  const targetHeight = cell.height * .98;
  const weight = weightForAspectRatio(cell.width / cell.height);
  if (letter === 'I' && iWidthCompensation > 0) {
    const natural = glyphAtWidth(letter, 100, weight);
    if (natural.supported && natural.height > 0) {
      const naturalWidth = targetHeight * natural.width / natural.height;
      targetWidth -= Math.max(0, targetWidth - naturalWidth) * iWidthCompensation / 100;
    }
  }
  const fit = fitLetter(letter, targetWidth / targetHeight, weight);
  const { supported } = fit;
  if (outline && !supported && !allowFallbackText) {
    throw new Error(`Google Sans Flex does not include “${cell.text}”. Choose SVG with editable text to keep this character.`);
  }
  const glyph = supported ? fit : fallbackGlyph(letter, weight);
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
    setGlyphVariations(glyph.variationWidth, weight);
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
    text.setAttribute('style', `font-variation-settings: 'wdth' ${glyph.variationWidth}, 'wght' ${weight}; font-optical-sizing: none;`);
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

  const padding = layout.textPaddingPx;
  const content = document.createDocumentFragment();
  if (embedFont && !outline) content.append(embeddedFont());
  content.append(svg('rect', { width: layout.width, height: layout.height, fill: layout.background }));
  if (layout.backgroundImage) {
    content.append(svg('image', {
      'data-poster-background-image': '',
      'aria-hidden': 'true',
      'pointer-events': 'none',
      href: layout.backgroundImage,
      width: layout.width,
      height: layout.height,
      overflow: 'hidden',
      preserveAspectRatio: 'xMidYMid slice',
    }));
  }
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
      const letter = drawLetter(cell, layout.textColor, padding, outline, allowFallbackText, layout.iWidthCompensation);
      if (letter) group.append(letter);
    }
    content.append(group);
  }
  stage.replaceChildren(content);
  return stage;
}

export function renderPosterBars(stage, { width, height, background, barHeights }, { crispBlocks = false } = {}) {
  const { top, bottom } = barHeights;
  if (!top && !bottom) return;
  const bars = svg('g', { 'data-poster-bars': '', 'aria-hidden': 'true' });
  const addBar = (y, height) => {
    if (!height) return;
    bars.append(svg('rect', {
      y, width, height, fill: background,
      ...(crispBlocks && { 'shape-rendering': 'crispEdges' }),
    }));
  };
  addBar(0, top);
  addBar(height - bottom, bottom);
  stage.append(bars);
}
