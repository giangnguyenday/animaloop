const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const svgType = 'image/svg+xml;charset=utf-8';

// Fade durations share the clip's time scale and each occupy at most half the clip.
export function timelineFadeOpacity(seconds, duration, fadeIn = 0, fadeOut = 0) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const time = Number.isFinite(seconds) ? clamp(seconds, 0, duration) : 0;
  const incoming = Number.isFinite(fadeIn) ? clamp(fadeIn, 0, duration / 2) : 0;
  const outgoing = Number.isFinite(fadeOut) ? clamp(fadeOut, 0, duration / 2) : 0;
  const visible = Math.min(incoming ? time / incoming : 1, outgoing ? (duration - time) / outgoing : 1, 1);
  return clamp(1 - visible, 0, 1);
}

function markupEnd(source, start, declaration = false) {
  let quote;
  let brackets = 0;
  for (let index = start + 1; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") quote = character;
    else if (declaration && character === '[') brackets++;
    else if (declaration && character === ']') brackets--;
    else if (character === '>' && brackets === 0) return index;
  }
  throw new Error('The recording frame contains an incomplete SVG tag.');
}

function rootSvgBoundary(source) {
  const stack = [];
  let root;
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    const section = [
      ['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>'],
    ].find(([opening]) => source.startsWith(opening, start));
    if (section) {
      const end = source.indexOf(section[1], start + section[0].length);
      if (end < 0) throw new Error('The recording frame contains incomplete SVG markup.');
      cursor = end + section[1].length;
      continue;
    }
    const declaration = source.startsWith('<!', start);
    const end = markupEnd(source, start, declaration);
    cursor = end + 1;
    if (declaration) continue;
    const tag = source.slice(start, end + 1);
    const closing = /^<\//.test(tag);
    const name = tag.match(closing ? /^<\/\s*([^\s>]+)/ : /^<\s*([^\s/>]+)/)?.[1];
    if (!name) throw new Error('The recording frame contains an invalid SVG tag.');
    if (closing) {
      if (stack.pop() !== name) throw new Error('The recording frame contains mismatched SVG tags.');
      if (!stack.length) return { close: start, name: root.name };
    } else {
      const selfClosing = /\/\s*>$/.test(tag);
      if (!root) {
        if (name.split(':').at(-1) !== 'svg') throw new Error('The recording frame is not an SVG image.');
        root = { name, start, end, tag };
        if (selfClosing) return { selfClosing: root };
      }
      if (!selfClosing) stack.push(name);
    }
  }
  throw new Error('The recording frame has no complete SVG root.');
}

export async function fadeOplaFrame(frame, {
  seconds, duration, fadeIn = 0, fadeOut = 0, width, height,
} = {}) {
  const opacity = timelineFadeOpacity(seconds, duration, fadeIn, fadeOut);
  if (opacity === 0) return frame instanceof Blob ? frame : new Blob([frame], { type: svgType });
  const source = frame instanceof Blob ? await frame.text() : String(frame);
  const boundary = rootSvgBoundary(source);
  const frameWidth = Number.isFinite(width) && width > 0 ? width : '100%';
  const frameHeight = Number.isFinite(height) && height > 0 ? height : '100%';
  const name = boundary.selfClosing?.name ?? boundary.name;
  const prefix = name.includes(':') ? `${name.split(':')[0]}:` : '';
  const overlay = `<${prefix}rect x="0" y="0" width="${frameWidth}" height="${frameHeight}" fill="#000000" opacity="${opacity}" style="fill:#000000;opacity:${opacity};pointer-events:none"/>`;
  let result;
  if (boundary.selfClosing) {
    const root = boundary.selfClosing;
    result = source.slice(0, root.start) + root.tag.replace(/\/\s*>$/, '>') + overlay
      + `</${root.name}>` + source.slice(root.end + 1);
  } else result = source.slice(0, boundary.close) + overlay + source.slice(boundary.close);
  return new Blob([result], { type: svgType });
}
