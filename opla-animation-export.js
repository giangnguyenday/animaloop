import { exportPosterLoop } from './poster-animation-export.js';

export const maxOplaRecordingSeconds = 30;
const movieFramesPerSecond = 30;
// Match the shared GIF encoder's frame schedule without changing poster exports.
const gifFramesPerSecond = 20;
const movieTimeScale = 60000;
const maxMovieBytes = 512 * 1024 * 1024;
const textEncoder = new TextEncoder();
const identityMatrix = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
}

function u16(...values) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value));
  return bytes;
}

function u32(...values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value));
  return bytes;
}

function atom(type, ...parts) {
  const length = 8 + parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = new Uint8Array(length);
  bytes.set(u32(length));
  bytes.set(textEncoder.encode(type), 4);
  let offset = 8;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function countedText(value, length) {
  const text = textEncoder.encode(value);
  const bytes = new Uint8Array(length ?? text.length + 1);
  bytes[0] = Math.min(text.length, bytes.length - 1, 255);
  bytes.set(text.subarray(0, bytes[0]), 1);
  return bytes;
}

function movieHeader(duration) {
  return atom('mvhd', u32(0, 0, 0, movieTimeScale, duration, 0x10000), u16(0x100), new Uint8Array(10),
    u32(...identityMatrix), u32(0, 0, 0, 0, 0, 0, 2));
}

function trackHeader(width, height, duration) {
  return atom('tkhd', u32(7, 0, 0, 1, 0, duration, 0, 0), u16(0, 0, 0, 0),
    u32(...identityMatrix), u32(width * 65536, height * 65536));
}

function videoDescription(width, height) {
  // QuickTime's JPEG sample entry, using one complete JPEG image per sample.
  // https://developer.apple.com/documentation/quicktime-file-format/video_sample_description
  const jpeg = atom('jpeg', new Uint8Array(6), u16(1, 0, 0), textEncoder.encode('appl'), u32(0, 512),
    u16(width, height), u32(72 * 65536, 72 * 65536, 0), u16(1), countedText('ANIMALOOP JPEG', 32), u16(24, 0xffff));
  return atom('stsd', u32(0, 1), jpeg);
}

function timeToSample(count, duration) {
  const entries = [];
  for (let frame = 0; frame < count; frame++) {
    const ticks = Math.round((frame + 1) * duration / count) - Math.round(frame * duration / count);
    const previous = entries.at(-1);
    if (previous?.[1] === ticks) previous[0]++;
    else entries.push([1, ticks]);
  }
  return atom('stts', u32(0, entries.length, ...entries.flat()));
}

function movieMetadata(width, height, duration, sizes, offset) {
  const description = videoDescription(width, height);
  const samples = atom('stbl', description, timeToSample(sizes.length, duration),
    atom('stsc', u32(0, 1, 1, sizes.length, 1)), atom('stsz', u32(0, 0, sizes.length, ...sizes)),
    atom('stco', u32(0, 1, offset)));
  const data = atom('dinf', atom('dref', u32(0, 1), atom('url ', u32(1))));
  const information = atom('minf', atom('vmhd', u32(1), u16(0, 0, 0, 0)), data, samples);
  const handler = atom('hdlr', u32(0), textEncoder.encode('mhlrvide'), u32(0, 0, 0), countedText('ANIMALOOP Video'));
  const media = atom('mdia', atom('mdhd', u32(0, 0, 0, movieTimeScale, duration), u16(0, 0)), handler, information);
  return atom('moov', movieHeader(duration), atom('trak', trackHeader(width, height, duration), media));
}

function validateAnimation({ width, height, duration, renderFrame }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || !Number.isFinite(duration) || duration <= 0 || duration > maxOplaRecordingSeconds || typeof renderFrame !== 'function') {
    throw new Error('Choose an animation duration from 0 to 30 seconds and a valid artboard size.');
  }
  width = Math.round(width);
  height = Math.round(height);
  if (width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new Error('Animation export supports artboards up to 4096 pixels per side.');
  }
  return { width, height };
}

// Pure container assembly also makes the produced sample tables independently verifiable.
export function buildQuickTimeMovie({ width, height, duration, samples }) {
  ({ width, height } = validateAnimation({ width, height, duration, renderFrame: () => {} }));
  if (!Array.isArray(samples) || !samples.length || samples.length > maxOplaRecordingSeconds * movieFramesPerSecond) {
    throw new Error('The movie has no frames or exceeds the 30-second recording limit.');
  }
  const sizes = samples.map((sample) => sample.size ?? sample.byteLength);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (sizes.some((size) => !Number.isSafeInteger(size) || size <= 0) || total > maxMovieBytes) {
    throw new Error('The recording is too large. Choose a smaller export size or a shorter recording.');
  }
  const ticks = Math.max(samples.length, Math.round(duration * movieTimeScale));
  const type = atom('ftyp', textEncoder.encode('qt  '), u32(0), textEncoder.encode('qt  '));
  const metadataSize = movieMetadata(width, height, ticks, sizes, 0).byteLength;
  const metadata = movieMetadata(width, height, ticks, sizes, type.byteLength + metadataSize + 8);
  return new Blob([type, metadata, u32(total + 8), textEncoder.encode('mdat'), ...samples], { type: 'video/quicktime' });
}

function svgBlob(frame) {
  return frame instanceof Blob ? frame : new Blob([frame], { type: 'image/svg+xml;charset=utf-8' });
}

async function drawFrame(context, width, height, frame, signal) {
  checkAbort(signal);
  const url = URL.createObjectURL(svgBlob(frame));
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    checkAbort(signal);
    // JPEG video has no alpha channel; keep transparent artboards on white.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('An animation frame could not be rendered. Try a smaller export size.');
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
  }
}

function yieldToInterface(signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Export cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, 0);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function exportMovie({ width, height, duration, renderFrame, onProgress, signal }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context || canvas.width !== width || canvas.height !== height) throw new Error('The artboard is too large to export.');
  const frames = Math.max(1, Math.round(duration * movieFramesPerSecond));
  const samples = [];
  let bytes = 0;
  try {
    onProgress?.(0);
    for (let frame = 0; frame < frames; frame++) {
      checkAbort(signal);
      await drawFrame(context, width, height, await renderFrame(frame * duration / frames, {
        index: frame, frameCount: frames, duration,
      }), signal);
      const sample = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .94));
      checkAbort(signal);
      if (!sample || sample.type !== 'image/jpeg') throw new Error('This browser could not encode the movie frames.');
      bytes += sample.size;
      if (bytes > maxMovieBytes) throw new Error('The recording is too large. Choose a smaller export size or a shorter recording.');
      samples.push(sample);
      onProgress?.((frame + 1) / frames);
      await yieldToInterface(signal);
    }
    checkAbort(signal);
    return buildQuickTimeMovie({ width, height, duration, samples });
  } finally {
    samples.length = 0;
    canvas.width = canvas.height = 1;
  }
}

export async function exportOplaAnimation({ format, width, height, duration, renderFrame, onProgress, signal }) {
  if (format !== 'mov' && format !== 'gif') throw new Error('Choose MOV or GIF for animation export.');
  ({ width, height } = validateAnimation({ width, height, duration, renderFrame }));
  checkAbort(signal);
  const options = { width, height, duration, renderFrame, onProgress, signal };
  const gifFrameCount = Math.max(1, Math.round(duration * gifFramesPerSecond));
  return format === 'mov' ? exportMovie(options) : exportPosterLoop({ ...options, format: 'gif',
    renderFrame: async (seconds) => svgBlob(await renderFrame(seconds, {
      index: Math.max(0, Math.min(gifFrameCount - 1, Math.round(seconds * gifFrameCount / duration))),
      frameCount: gifFrameCount, duration,
    })),
  });
}
