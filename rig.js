export const SVG_NS = 'http://www.w3.org/2000/svg';
export const RIG_WIDTH = 493.18;
export const RIG_HEIGHT = 759.381;

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const dimensions = {
  a: [202.2, 199.4],
  o: [206.16, 202.22],
  p: [136.22, 196.6],
  l: [146.06, 196.6],
};

const shapeTags = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line',
  'polygon', 'polyline', 'clipPath', 'mask', 'linearGradient', 'radialGradient',
  'stop', 'pattern',
]);
const geometryAttributes = new Set([
  'd', 'points', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'fx',
  'fy', 'fr', 'x1', 'x2', 'y1', 'y2', 'viewBox', 'preserveAspectRatio', 'offset',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'maskUnits',
  'maskContentUnits', 'clipPathUnits', 'patternUnits', 'patternContentUnits',
  'patternTransform',
]);
const paintAttributes = new Set([
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'stroke-dashoffset', 'clip-rule', 'clip-path', 'mask', 'mask-type', 'opacity',
  'display', 'visibility', 'transform', 'vector-effect', 'paint-order', 'overflow',
  'stop-color', 'stop-opacity',
]);

let rigCount = 0;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, value);
  }
  return element;
}

function linkTo(element, id) {
  element.setAttribute('href', `#${id}`);
  element.setAttributeNS(XLINK_NS, 'xlink:href', `#${id}`);
}

function svgViewBox(root, part) {
  const values = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (values?.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return values.join(' ');
  }
  const size = ['width', 'height'].map(name => {
    const value = root.getAttribute(name)?.trim().match(/^([\d.]+)(?:px)?$/);
    return value ? Number(value[1]) : 0;
  });
  if (size.every(value => Number.isFinite(value) && value > 0)) return `0 0 ${size.join(' ')}`;
  throw new Error(`src/${part}.svg needs a positive viewBox or pixel dimensions.`);
}

function getStyleRules(root) {
  const styles = [...root.querySelectorAll('style')];
  if (!styles.length) return [];
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles.map(element => element.textContent).join('\n'));
  return Array.from(sheet.cssRules).filter(rule => rule.selectorText && rule.style);
}

function readPaint(source, rules, declarationProbe) {
  const attributes = new Map();
  for (const name of paintAttributes) {
    if (source.hasAttribute(name)) attributes.set(name, source.getAttribute(name));
  }
  for (const rule of rules) {
    if (!source.matches(rule.selectorText)) continue;
    for (const name of Array.from(rule.style)) {
      if (paintAttributes.has(name)) attributes.set(name, rule.style.getPropertyValue(name));
    }
  }
  declarationProbe.cssText = source.getAttribute('style') || '';
  for (const name of Array.from(declarationProbe)) {
    if (paintAttributes.has(name)) attributes.set(name, declarationProbe.getPropertyValue(name));
  }
  return attributes;
}

function rewritePaint(value, ids) {
  return value.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (_, quote, target) => {
    const id = target.startsWith('#') && ids.get(target.slice(1));
    return id ? `url(#${id})` : 'none';
  });
}

async function loadPart(part, prefix) {
  const response = await fetch(new URL(`./src/${part}.svg`, import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load src/${part}.svg (${response.status}).`);
  const root = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) {
    throw new Error(`src/${part}.svg is not a valid SVG.`);
  }

  const id = `${prefix}-${part}`;
  const ids = new Map();
  if (root.id) ids.set(root.id, id);
  for (const element of root.querySelectorAll('[id]')) {
    if (!ids.has(element.id)) ids.set(element.id, `${id}-${ids.size}`);
  }
  const rules = getStyleRules(root);
  const declarationProbe = svgElement('g').style;
  const symbol = svgElement('symbol', {
    id, viewBox: svgViewBox(root, part), preserveAspectRatio: 'none',
  });
  // The P silhouette touches the viewport edge. Keep its corners when a rotated instance is antialiased.
  if (part === 'p') symbol.setAttribute('overflow', 'visible');

  function copyContent(source, target, preservePaint = false) {
    if (source !== root) {
      if (source.id) target.id = ids.get(source.id);
      for (const attribute of source.attributes) {
        if (geometryAttributes.has(attribute.name)) target.setAttribute(attribute.name, attribute.value);
      }
    }
    const reference = source.getAttribute('href') ?? source.getAttributeNS(XLINK_NS, 'href');
    const referenceId = reference?.startsWith('#') && ids.get(reference.slice(1));
    if (referenceId) linkTo(target, referenceId);

    const paint = readPaint(source, rules, declarationProbe);
    if (source === root && !paint.has('fill')) paint.set('fill', 'currentColor');
    for (const [name, value] of paint) {
      const isColor = name === 'fill' || name === 'stroke';
      const isTransparent = isColor && /^transparent$/i.test(value.trim());
      if (isTransparent) {
        target.setAttribute(name, 'none');
        continue;
      }
      const keepsValue = /^(none|inherit|unset|revert)$/i.test(value.trim());
      target.setAttribute(name, !preservePaint && isColor && !keepsValue
        ? 'currentColor'
        : rewritePaint(value, ids));
    }

    for (const child of source.children) {
      if (child.namespaceURI !== SVG_NS || !shapeTags.has(child.localName)) continue;
      const element = svgElement(child.localName);
      copyContent(child, element, preservePaint || ['mask', 'clipPath'].includes(child.localName));
      target.append(element);
    }
  }

  copyContent(root, symbol);
  return symbol;
}

const partLayout = {
  body: ['o', 'translate(143.5 399.961)', 246.58, 501.061],
  leftLeg: ['l', 'translate(220.12 562.781) scale(-1 1)', 197.65, 562.781],
  rightLeg: ['l', 'translate(273.04 562.781)', 295.51, 562.781],
  leftArm: ['p', 'matrix(0 1 1 0 0 417.861)', 196.6, 444],
  rightArm: ['p', 'matrix(0 1 -1 0 493.18 417.861)', 296.58, 444],
  head: ['o', 'translate(143.5 179.961)', 246.58, 365],
  hat: ['a', 'translate(145.48 0)', 246.58, 192],
};

function createCharacter(symbols) {
  const node = svgElement('g');
  const torso = svgElement('g');
  const head = svgElement('g');
  const parts = new Map();
  node.append(torso);

  for (const [name, [part, transform]] of Object.entries(partLayout)) {
    const [width, height] = dimensions[part];
    const joint = svgElement('g');
    const instance = svgElement('use', { width, height, transform });
    linkTo(instance, symbols[part].id);
    joint.append(instance);
    parts.set(name, joint);
    if (name === 'head' || name === 'hat') head.append(joint);
    else torso.append(joint);
  }
  torso.append(head);

  function update({ color = '#000000', x = 0, y = 0, scale = 1, rotation = 0, opacity = 1, flip = false, pose = {} } = {}) {
    const { bob = 0, lean = 0, leftLift = 0, rightLift = 0, footDirection = 0 } = pose;
    node.setAttribute('color', color);
    node.setAttribute('fill', color);
    node.setAttribute('opacity', opacity);
    node.setAttribute('transform',
      `translate(${x} ${y}) rotate(${rotation}) scale(${flip ? -scale : scale} ${scale}) translate(${-RIG_WIDTH / 2} ${-RIG_HEIGHT / 2})`);
    torso.setAttribute('transform', `translate(0 ${bob}) rotate(${lean} 246.58 562.781)`);
    head.setAttribute('transform', `translate(${pose.headX ?? 0} ${pose.headY ?? 0}) rotate(${pose.head ?? 0} 246.58 365)`);

    for (const [name, joint] of parts) {
      if (name === 'head') continue;
      const [, , pivotX, pivotY] = partLayout[name];
      const angle = pose[name] ?? 0;
      const isArm = name === 'leftArm' || name === 'rightArm';
      const swing = isArm ? Math.abs(angle) : 0;
      const clearance = Math.min(swing * .045, 3);
      const outward = name === 'leftArm' ? -clearance : clearance;
      const xOffset = (pose[`${name}X`] ?? 0) + outward;
      const lift = name === 'leftLeg' ? leftLift : name === 'rightLeg' ? rightLift : 0;
      // Keep the square end of the arm inside the shoulder as it rotates.
      const yOffset = (pose[`${name}Y`] ?? 0) - lift + Math.min(swing * .20, 9);
      const reflectFoot = (name === 'leftLeg' && footDirection === 1) || (name === 'rightLeg' && footDirection === -1);
      // Reflect around the leg's attachment, so turning the toe never shifts the hip.
      const facing = reflectFoot ? ` translate(${pivotX * 2} 0) scale(-1 1)` : '';
      joint.setAttribute('transform', `translate(${xOffset} ${yOffset}) rotate(${angle} ${pivotX} ${pivotY})${facing}`);
    }
  }

  update();
  return { node, update };
}

export async function loadRig() {
  const prefix = `opla-rig-${++rigCount}`;
  const defs = svgElement('defs');
  const parts = Object.keys(dimensions);
  const symbols = Object.fromEntries(await Promise.all(parts.map(async part => [part, await loadPart(part, prefix)])));
  defs.append(...Object.values(symbols));
  return { defs, create: () => createCharacter(symbols) };
}
