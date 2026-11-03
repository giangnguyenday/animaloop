export const effectLabels = {
  none: 'None', onion: 'Frame-by-frame', echo: 'Echo', outline: 'Outline',
  solitaire: 'Solitaire trail', orbit: 'Orbit', fan: 'Fan', mirror: 'Mirror',
  ripple: 'Ripple', tiles: 'Tiles', prism: 'Prism', crowd: 'Crowd',
  continuous: 'Continuous line', contact: 'Contact sheet',
};

export const effectParameters = {
  onion: { frames: ['Frames between copies', 1, 24, 1, 1], opacity: ['Trail opacity', 5, 100, 1, 48, '%'] },
  echo: { angle: ['Direction', -180, 180, 1, 38, '°'], spacing: ['Spacing', 4, 140, 1, 24, ' px'], opacity: ['Trail opacity', 5, 100, 1, 48, '%'] },
  outline: { width: ['Stroke width', 1, 24, 1, 6, ' px'] },
  solitaire: { frames: ['Frames between stamps', 1, 36, 1, 3], opacity: ['Stamp opacity', 5, 100, 1, 100, '%'] },
  orbit: { radius: ['Radius', 4, 65, 1, 20, '%'], rate: ['Orbit speed', -3, 3, .1, .55], scale: ['Copy scale', 10, 120, 1, 48, '%'] },
  fan: { angle: ['Spread per copy', 1, 36, 1, 13, '°'], spacing: ['Spacing', 0, 120, 1, 30, ' px'], opacity: ['Opacity', 5, 100, 1, 72, '%'] },
  mirror: { angle: ['Axis', -180, 180, 1, 90, '°'], spacing: ['Separation', 0, 220, 1, 65, ' px'], opacity: ['Opacity', 5, 100, 1, 65, '%'] },
  ripple: { spacing: ['Wave height', 0, 100, 1, 26, ' px'], growth: ['Scale step', 1, 30, 1, 12, '%'], rate: ['Wave speed', 0, 10, .1, 3] },
  tiles: { columns: ['Columns', 1, 12, 1, 3], scale: ['Cell fill', 15, 120, 1, 76, '%'], frames: ['Phase offset', 0, 24, 1, 0] },
  prism: { angle: ['Direction', -180, 180, 1, 34, '°'], spacing: ['Separation', 2, 100, 1, 18, ' px'], opacity: ['Opacity', 5, 100, 1, 90, '%'] },
  crowd: { spread: ['Spread', 12, 100, 1, 90, '%'], scale: ['Crowd size', 10, 100, 1, 32, '%'], seed: ['Variation', 1, 100, 1, 8] },
  continuous: { angle: ['Line direction', -180, 180, 1, 0, '°'], spacing: ['Character spacing', 30, 800, 1, 220, ' px'], scale: ['Copy scale', 15, 120, 1, 65, '%'] },
  contact: { columns: ['Columns', 1, 12, 1, 4], frames: ['Frames between poses', 1, 24, 1, 3], scale: ['Cell fill', 15, 120, 1, 76, '%'] },
};

export const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'exclusion'];
export const renderFilters = ['none', 'particles', 'lofi', 'dither', 'halftone', 'scanlines', 'grain', 'ink-bleed'];

export function effectOptions(effect, saved) {
  return Object.fromEntries(Object.entries(effectParameters[effect] ?? {}).map(([key, [, min, max, , fallback]]) => {
    const value = saved?.[key];
    return [key, Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback];
  }));
}

export function copyCount(effect, amount, animated) {
  if (effect === 'onion' || effect === 'solitaire') return animated ? amount : 0;
  if (effect === 'mirror') return 1;
  return ['none', 'outline'].includes(effect) ? 0 : amount;
}

const repeat = (x, length) => ((x % length) + length) % length;
const spectrum = ['#F672FF', '#FF923E', '#EAFF74', '#A7F9FF', '#F5F5F5'];
const radians = (degrees) => degrees * Math.PI / 180;
const noise = (seed) => repeat(Math.sin(seed * 127.1) * 43758.5453, 1);
const vector = (angle, distance) => ({ dx: Math.cos(radians(angle)) * distance, dy: Math.sin(radians(angle)) * distance });

export function effectCopy(effect, { i, count, time, frame, base, width, height, x, y, scale, index, cycleSpeed, travel }, p) {
  const fade = (count + 1 - i) / (count + 1);
  switch (effect) {
    case 'onion':
      return { time: frame - i * p.frames / 24, opacity: fade * p.opacity / 100 };
    case 'echo':
      return { ...vector(p.angle, i * p.spacing * base), opacity: fade * p.opacity / 100 };
    case 'solitaire':
      return { time: Math.floor(time * 24 / p.frames) * p.frames / 24 - i * p.frames / 24, opacity: p.opacity / 100 };
    case 'orbit': {
      const angle = i * Math.PI * 2 / count + time * p.rate;
      const radius = p.radius * .01 * Math.min(width, height);
      return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius, scale: p.scale / 100, opacity: .74, rotation: angle * 180 / Math.PI + 90 };
    }
    case 'fan': {
      const sign = i % 2 ? 1 : -1;
      const arm = Math.ceil(i / 2) * sign;
      return { dx: arm * p.spacing * base, rotation: arm * p.angle, opacity: p.opacity / 100, scale: Math.max(.15, 1 - i * .025) };
    }
    case 'mirror': {
      const a = radians(p.angle);
      const normalX = -Math.sin(a);
      const normalY = Math.cos(a);
      const distance = (x - width / 2) * normalX + (y - height / 2) * normalY;
      const offset = -2 * distance + (distance > 0 ? -1 : 1) * p.spacing * base;
      return { dx: offset * normalX, dy: offset * normalY, opacity: p.opacity / 100, flip: true, rotation: p.angle * 2 - 180 };
    }
    case 'ripple':
      return { scale: 1 + i * p.growth / 100, dy: Math.sin(i * .65 + time * p.rate) * p.spacing * base, opacity: fade * .34 };
    case 'tiles':
    case 'contact': {
      const columns = Math.min(count, Math.round(p.columns));
      const rows = Math.ceil(count / columns);
      const cell = i - 1;
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      return {
        dx: (cell % columns + .5 + (x / width - .5) * .55) * cellWidth - x,
        dy: (Math.floor(cell / columns) + .5 + (y / height - .5) * .55) * cellHeight - y,
        scale: Math.min(cellWidth / 500, cellHeight / 770) * p.scale / (100 * scale),
        time: (effect === 'contact' ? 0 : time) + cell * p.frames / 24,
        inPlace: true,
      };
    }
    case 'prism':
      return { ...vector(p.angle + (i % 2 ? 0 : 180), Math.ceil(i / 2) * p.spacing * base), color: spectrum[(i - 1) % spectrum.length], opacity: p.opacity / 100 };
    case 'crowd': {
      const seed = p.seed * 131 + i * 17 + index * 59;
      const spread = p.spread / 100;
      const depth = noise(seed + 13);
      return {
        dx: width * (.5 + (noise(seed) - .5) * spread) - x,
        dy: height * (.5 + (depth - .5) * spread) - y,
        scale: p.scale / 100 * (.7 + depth * .6), time: time + noise(seed + 37), inPlace: true,
      };
    }
    case 'continuous': {
      const spacing = p.spacing * base;
      const angle = radians(p.angle);
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const reach = Math.abs(ux) * width + Math.abs(uy) * height;
      const span = Math.max((count + 1) * spacing, reach + 800 * scale);
      const step = span / (count + 1);
      const distance = repeat(span / 2 + (travel ? time * cycleSpeed * scale : 0) + step * i, span) - span / 2;
      return { ...vector(p.angle, distance), scale: p.scale / 100, time: time - i * .16, inPlace: true, direction: 'angled', angle: p.angle };
    }
  }
}

export function applyRenderFilter(svg, defs, art, kind, strength, base) {
  art.removeAttribute('filter');
  art.removeAttribute('mask');
  if (kind === 'none') return;
  const id = 'opla-render-filter';
  if (kind === 'grain' || kind === 'ink-bleed') {
    const filter = svg('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '140%', 'color-interpolation-filters': 'sRGB' });
    if (kind === 'grain') {
      const intensity = .18 + strength * .037;
      filter.append(
        svg('feTurbulence', { type: 'fractalNoise', baseFrequency: .49 / base, numOctaves: 3, seed: 23, result: 'noise' }),
        svg('feColorMatrix', {
          in: 'noise', type: 'matrix',
          values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${intensity * 2} 0 0 0 ${1 - intensity * 1.5}`,
          result: 'grain-alpha',
        }),
        svg('feComposite', { in: 'SourceGraphic', in2: 'grain-alpha', operator: 'in' }),
      );
    } else {
      filter.append(
        svg('feMorphology', { in: 'SourceGraphic', operator: 'dilate', radius: (1 + strength * .36) * base, result: 'spread' }),
        svg('feTurbulence', { type: 'fractalNoise', baseFrequency: .09 / base, numOctaves: 3, seed: 11, result: 'noise' }),
        svg('feDisplacementMap', {
          in: 'spread', in2: 'noise', scale: (3 + strength * 1.25) * base, xChannelSelector: 'R', yChannelSelector: 'G',
          result: 'bleed',
        }),
        svg('feComposite', { in: 'SourceGraphic', in2: 'bleed', operator: 'over' }),
      );
    }
    defs.append(filter);
    art.setAttribute('filter', `url(#${id})`);
    return;
  }

  if (kind === 'lofi') {
    const filter = svg('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '140%', 'color-interpolation-filters': 'sRGB' });
    const levels = Math.max(3, 13 - Math.round(strength / 2));
    const tableValues = Array.from({ length: levels }, (_, index) => index / (levels - 1)).join(' ');
    const transfer = svg('feComponentTransfer', { in: 'SourceGraphic', result: 'posterized' });
    transfer.append(...['R', 'G', 'B'].map((channel) => svg(`feFunc${channel}`, { type: 'discrete', tableValues })));
    filter.append(
      transfer,
      svg('feTurbulence', { baseFrequency: '.04 .28', numOctaves: 2, seed: 17, result: 'grain' }),
      svg('feDisplacementMap', { in: 'posterized', in2: 'grain', scale: (1 + strength) * base, xChannelSelector: 'R', yChannelSelector: 'G' }),
    );
    defs.append(filter);
    art.setAttribute('filter', `url(#${id})`);
    return;
  }

  const pitch = (kind === 'dither' ? 3 + strength * .55 : 14 + strength * .7) * base;
  const pattern = svg('pattern', { id: `${id}-pattern`, width: pitch * 4, height: pitch * 4, patternUnits: 'userSpaceOnUse' });
  const mask = svg('mask', { id, 'mask-type': 'alpha', x: '0%', y: '0%', width: '100%', height: '100%', maskUnits: 'userSpaceOnUse' });
  if (kind === 'halftone' || kind === 'scanlines') {
    const spacing = (kind === 'halftone' ? 5 + strength * .72 : 3 + strength * .46) * base;
    pattern.setAttribute('width', spacing);
    pattern.setAttribute('height', spacing);
    if (kind === 'halftone') {
      pattern.setAttribute('patternTransform', 'rotate(30)');
      pattern.append(svg('circle', { cx: spacing / 2, cy: spacing / 2, r: spacing * (.46 - strength * .008), fill: 'white' }));
    } else {
      pattern.append(svg('rect', { width: spacing, height: spacing * (.90 - strength * .021), fill: 'white' }));
    }
    mask.append(svg('rect', { width: '100%', height: '100%', fill: `url(#${id}-pattern)` }));
    defs.append(pattern, mask);
    art.setAttribute('mask', `url(#${id})`);
    return;
  }
  if (kind === 'particles') pattern.append(svg('rect', { width: pitch * 4, height: pitch * 4, fill: 'white', opacity: .48 - strength * .021 }));
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (const [i, rank] of matrix.entries()) {
    const cx = (i % 4 + .5) * pitch;
    const cy = (Math.floor(i / 4) + .5) * pitch;
    if (kind === 'dither') {
      const edge = pitch * (.86 - strength * .022) * (1 - rank * .014);
      pattern.append(svg('rect', { x: cx - edge / 2, y: cy - edge / 2, width: edge, height: edge, fill: 'white' }));
    } else {
      pattern.append(svg('circle', { cx: cx + (noise(i + 31) - .5) * pitch, cy: cy + (noise(i + 62) - .5) * pitch, r: pitch * (.09 + noise(i + 94) * .28), fill: 'white' }));
    }
  }
  mask.append(svg('rect', { width: '100%', height: '100%', fill: `url(#${id}-pattern)` }));
  defs.append(pattern, mask);
  art.setAttribute('mask', `url(#${id})`);
}
