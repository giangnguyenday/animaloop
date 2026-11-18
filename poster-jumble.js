const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const minWidth = 25;
const maxWidth = 151;
const spaceWidth = 100;

function widthsFromSeed(seed) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return minWidth + Math.floor(state / 2 ** 32 * (maxWidth - minWidth + 1));
  };
}

export function layoutJumble(text, { seed, lineWidth, tracking, measure }) {
  const nextWidth = widthsFromSeed(seed);
  const space = { text: ' ', width: spaceWidth, advance: measure(' ', spaceWidth) };
  const lines = [];
  let glyphs = [];
  let advance = 0;

  function append(glyph) {
    const x = glyphs.length ? advance + tracking : 0;
    glyphs.push({ text: glyph.text, width: glyph.width, x });
    advance = x + glyph.advance;
  }

  function nextLine() {
    lines.push({ glyphs, advance });
    glyphs = [];
    advance = 0;
  }

  for (const paragraph of text.split(/\r\n?|\n/)) {
    for (const word of paragraph.match(/\S+/g) ?? []) {
      let wordAdvance = 0;
      const letters = Array.from(segmenter.segment(word), ({ segment }, index) => {
        const width = nextWidth();
        const glyphAdvance = measure(segment, width);
        wordAdvance += glyphAdvance + (index ? tracking : 0);
        return { text: segment, width, advance: glyphAdvance };
      });

      if (glyphs.length) {
        if (advance + space.advance + 2 * tracking + wordAdvance <= lineWidth) append(space);
        else nextLine();
      }

      for (const glyph of letters) {
        // An oversized word can break at graphemes, even if one letter fills the line.
        if (wordAdvance > lineWidth && glyphs.length && advance + tracking + glyph.advance > lineWidth) nextLine();
        append(glyph);
      }
    }
    nextLine();
  }
  return lines;
}
