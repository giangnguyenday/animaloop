const SVG_NS = 'http://www.w3.org/2000/svg';
const fontUrl = new URL('./src/fonts/google-sans-flex-poster-variable.ttf.gz', import.meta.url);
const fontFamily = 'Google Sans Flex Poster';
export const posterContentFontFamily = fontFamily;
const fontSize = 1000;
const minWidth = 25;
const maxWidth = 151;
const lightWeight = 400;
const heavyWeight = 1000;
const columnTypeSteps = [
  { width: 150, weight: 1000 },
  { width: 125, weight: 900 },
  { width: 100, weight: 800 },
  { width: 75, weight: 700 },
  { width: 50, weight: 600 },
  { width: 25, weight: 500 },
  { width: 25, weight: 400 },
];
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

function columnKey(cell) {
  if (Number.isInteger(cell.column)) return `${cell.column}:${cell.columnEnd ?? cell.column}`;
  return `${cell.x.toPrecision(12)}:${cell.width.toPrecision(12)}`;
}

function availableLetterWidth(cell, padding) {
  return Math.max(cell.width * .1, cell.width - 2 * padding);
}

function columnTypography(cells, padding) {
  const columns = new Map();
  for (const cell of cells) {
    if (!cell.text?.trim()) continue;
    const key = columnKey(cell);
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(cell);
  }

  const typography = new Map();
  for (const [key, column] of columns) {
    let chosen;
    for (const step of columnTypeSteps) {
      const measurements = column.map((cell) => {
        const shaped = glyphAtWidth(cell.text.normalize('NFC'), step.width, step.weight);
        const glyph = shaped.supported ? shaped : fallbackGlyph(cell.text, step.weight);
        return { cell, glyph };
      }).filter(({ glyph }) => glyph.width > 0 && glyph.height > 0 && Number.isFinite(glyph.width + glyph.height));
      const heightScale = Math.min(...measurements.map(({ cell, glyph }) => cell.height * .98 / glyph.height));
      const widthScale = Math.min(...measurements.map(({ cell, glyph }) => availableLetterWidth(cell, padding) / glyph.width));
      chosen = { ...step, scale: Math.min(heightScale, widthScale) };
      if (heightScale <= widthScale) break;
    }
    typography.set(key, chosen);
  }
  return typography;
}

function drawLetter(cell, color, padding, outline, allowFallbackText, typography, iWidthCompensation = 0) {
  const letter = cell.text.normalize('NFC');
  const { width: variationWidth, weight, scale: columnScale } = typography;
  const shaped = glyphAtWidth(letter, variationWidth, weight);
  const { supported } = shaped;
  if (outline && !supported && !allowFallbackText) {
    throw new Error(`Google Sans Flex does not include “${cell.text}”. Choose SVG with editable text to keep this character.`);
  }
  const glyph = supported ? shaped : fallbackGlyph(letter, weight);
  if (!(glyph.width > 0 && glyph.height > 0 && Number.isFinite(columnScale))) return;

  const scaleY = cell.height * .98 / glyph.height;
  let scaleX = columnScale;
  if (letter === 'I') {
    const fullWidth = availableLetterWidth(cell, padding);
    const naturalWidth = glyph.width * scaleY;
    const compensation = Math.max(0, Math.min(100, iWidthCompensation)) / 100;
    scaleX = (fullWidth - Math.max(0, fullWidth - naturalWidth) * compensation) / glyph.width;
  }
  const x = cell.x + (cell.width - glyph.width * scaleX) / 2 - glyph.x * scaleX;
  const y = cell.y + (cell.height - glyph.height * scaleY) / 2 - glyph.y * scaleY;
  const attributes = { fill: color, transform: `translate(${x} ${y}) scale(${scaleX} ${scaleY})` };

  if (outline && supported) {
    setGlyphVariations(variationWidth, weight);
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
    text.setAttribute('style', `font-variation-settings: 'wdth' ${variationWidth}, 'wght' ${weight}; font-optical-sizing: none;`);
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
  const typography = columnTypography(layout.cells, padding);
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
      const letter = drawLetter(cell, layout.textColor, padding, outline, allowFallbackText,
        typography.get(columnKey(cell)), layout.iWidthCompensation);
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
