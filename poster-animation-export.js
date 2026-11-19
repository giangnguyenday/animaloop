const gifFramesPerSecond = 20;
const videoFramesPerSecond = 24;
const studioColors = [
  [66, 54, 37], [245, 245, 245], [167, 249, 255], [234, 255, 116],
  [53, 88, 227], [246, 137, 253], [254, 149, 68], [206, 33, 99],
  [0, 0, 0], [255, 255, 255],
];
let gifPalette;

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
}

function pause(milliseconds, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Export cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, Math.max(0, milliseconds));
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function colorPalette() {
  if (gifPalette) return gifPalette;
  const colors = [...studioColors];
  for (let red = 0; red < 6; red++) {
    for (let green = 0; green < 6; green++) {
      for (let blue = 0; blue < 6; blue++) colors.push([red * 51, green * 51, blue * 51]);
    }
  }
  while (colors.length < 256) {
    const value = Math.round((colors.length - 226) * 255 / 29);
    colors.push([value, value, value]);
  }
  const exact = new Map(colors.map(([red, green, blue], index) => [(red << 16) | (green << 8) | blue, index]));
  // Preserve the specified studio colors exactly, including white and black.
  studioColors.forEach(([red, green, blue], index) => exact.set((red << 16) | (green << 8) | blue, index));
  const nearest = new Uint8Array(32768);
  for (let index = 0; index < nearest.length; index++) {
    const red = ((index >> 10) & 31) * 255 / 31;
    const green = ((index >> 5) & 31) * 255 / 31;
    const blue = (index & 31) * 255 / 31;
    let distance = Infinity;
    for (let candidate = 0; candidate < colors.length; candidate++) {
      const [r, g, b] = colors[candidate];
      const delta = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
      if (delta < distance) {
        distance = delta;
        nearest[index] = candidate;
      }
    }
  }
  gifPalette = { colors: new Uint8Array(colors.flat()), exact, nearest };
  return gifPalette;
}

function indexPixels(data, palette) {
  const result = new Uint8Array(data.length / 4);
  for (let pixel = 0, offset = 0; pixel < result.length; pixel++, offset += 4) {
    const alpha = data[offset + 3] / 255;
    const red = Math.round(255 + (data[offset] - 255) * alpha);
    const green = Math.round(255 + (data[offset + 1] - 255) * alpha);
    const blue = Math.round(255 + (data[offset + 2] - 255) * alpha);
    result[pixel] = palette.exact.get((red << 16) | (green << 8) | blue)
      ?? palette.nearest[((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)];
  }
  return result;
}

function compressGif(pixels) {
  const clear = 256;
  const end = 257;
  const dictionary = new Map();
  let nextCode = 258;
  let codeSize = 9;
  let bits = 0;
  let bitCount = 0;
  const bytes = [];
  const write = (code) => {
    bits |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bits & 255);
      bits >>>= 8;
      bitCount -= 8;
    }
  };
  write(clear);
  let prefix = pixels[0];
  for (let index = 1; index < pixels.length; index++) {
    const suffix = pixels[index];
    const key = prefix * 256 + suffix;
    const match = dictionary.get(key);
    if (match !== undefined) {
      prefix = match;
      continue;
    }
    write(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++);
      // The decoder adds its entry after the following code, one step behind.
      if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      write(clear);
      dictionary.clear();
      nextCode = 258;
      codeSize = 9;
    }
    prefix = suffix;
  }
  write(prefix);
  if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
  write(end);
  if (bitCount) bytes.push(bits & 255);
  return new Uint8Array(bytes);
}

function appendGifFrame(parts, pixels, width, height, delay) {
  const compressed = compressGif(pixels);
  parts.push(new Uint8Array([
    0x21, 0xf9, 4, 4, delay & 255, delay >> 8, 0, 0,
    0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0,
    8,
  ]));
  for (let offset = 0; offset < compressed.length; offset += 255) {
    const block = compressed.subarray(offset, offset + 255);
    parts.push(new Uint8Array([block.length]), block);
  }
  parts.push(new Uint8Array([0]));
}

async function drawSvgFrame(context, width, height, blob, signal) {
  checkAbort(signal);
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    checkAbort(signal);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('An animation frame could not be rendered. Try exporting a smaller artboard.');
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
  }
}

async function exportGif({ context, width, height, duration, renderFrame, onProgress, signal }) {
  if (width > 65535 || height > 65535) throw new Error('GIF dimensions must be under 65,536 pixels per side.');
  const frames = Math.max(1, Math.round(duration * gifFramesPerSecond));
  const palette = colorPalette();
  const parts = [
    new TextEncoder().encode('GIF89a'),
    new Uint8Array([width & 255, width >> 8, height & 255, height >> 8, 0xf7, 0, 0]),
    palette.colors,
    new Uint8Array([0x21, 0xff, 11]),
    new TextEncoder().encode('NETSCAPE2.0'),
    new Uint8Array([3, 1, 0, 0, 0]),
  ];
  for (let frame = 0; frame < frames; frame++) {
    checkAbort(signal);
    await drawSvgFrame(context, width, height, await renderFrame(frame * duration / frames), signal);
    const pixels = indexPixels(context.getImageData(0, 0, width, height).data, palette);
    const start = Math.round(frame * duration * 100 / frames);
    const finish = Math.round((frame + 1) * duration * 100 / frames);
    appendGifFrame(parts, pixels, width, height, Math.max(1, finish - start));
    onProgress?.((frame + 1) / frames);
    // Let the interface update its progress and process cancellation between frames.
    await pause(0, signal);
  }
  parts.push(new Uint8Array([0x3b]));
  return new Blob(parts, { type: 'image/gif' });
}

function unsignedBytes(value) {
  const bytes = [];
  do {
    bytes.unshift(value % 256);
    value = Math.floor(value / 256);
  } while (value);
  return new Uint8Array(bytes);
}

function ebmlSize(size) {
  let length = 1;
  while (size >= 2 ** (7 * length) - 1) length++;
  const bytes = new Uint8Array(length);
  for (let index = length - 1; index >= 0; index--) {
    bytes[index] = size % 256;
    size = Math.floor(size / 256);
  }
  bytes[0] |= 1 << (8 - length);
  return bytes;
}

function ebmlElement(id, ...content) {
  const identifier = unsignedBytes(id);
  const size = ebmlSize(content.reduce((total, bytes) => total + bytes.length, 0));
  const result = new Uint8Array(identifier.length + size.length + content.reduce((total, bytes) => total + bytes.length, 0));
  result.set(identifier);
  result.set(size, identifier.length);
  let offset = identifier.length + size.length;
  for (const bytes of content) {
    result.set(bytes, offset);
    offset += bytes.length;
  }
  return result;
}

function ebmlNumber(id, number) {
  return ebmlElement(id, unsignedBytes(number));
}

function ebmlText(id, text) {
  return ebmlElement(id, new TextEncoder().encode(text));
}

function muxWebm(chunks, { width, height, duration, codecId, frameCount }) {
  const header = ebmlElement(0x1a45dfa3,
    ebmlNumber(0x4286, 1), ebmlNumber(0x42f7, 1), ebmlNumber(0x42f2, 4), ebmlNumber(0x42f3, 8),
    ebmlText(0x4282, 'webm'), ebmlNumber(0x4287, 4), ebmlNumber(0x4285, 2));
  const length = new Uint8Array(8);
  new DataView(length.buffer).setFloat64(0, duration * 1000);
  const info = ebmlElement(0x1549a966, ebmlNumber(0x2ad7b1, 1_000_000),
    ebmlElement(0x4489, length), ebmlText(0x4d80, 'ANIMALOOP'), ebmlText(0x5741, 'ANIMALOOP'));
  const video = ebmlElement(0xe0, ebmlNumber(0xb0, width), ebmlNumber(0xba, height));
  const track = ebmlElement(0xae,
    ebmlNumber(0xd7, 1), ebmlNumber(0x73c5, 1), ebmlNumber(0x83, 1), ebmlNumber(0x9c, 0),
    ebmlText(0x86, codecId), ebmlNumber(0x23e383, Math.round(duration * 1e9 / frameCount)), video);
  const tracks = ebmlElement(0x1654ae6b, track);
  const clusters = [];
  let baseTime = 0;
  let blocks = [ebmlNumber(0xe7, baseTime)];
  for (const chunk of chunks.sort((first, second) => first.timestamp - second.timestamp)) {
    const time = Math.round(chunk.timestamp / 1000);
    if (time - baseTime > 30_000) {
      clusters.push(ebmlElement(0x1f43b675, ...blocks));
      baseTime = time;
      blocks = [ebmlNumber(0xe7, baseTime)];
    }
    const relativeTime = time - baseTime;
    blocks.push(ebmlElement(0xa3,
      new Uint8Array([0x81, relativeTime >> 8, relativeTime & 255, chunk.key ? 0x80 : 0]), chunk.data));
  }
  clusters.push(ebmlElement(0x1f43b675, ...blocks));
  const parts = [info, tracks, ...clusters];
  const size = parts.reduce((total, bytes) => total + bytes.length, 0);
  return new Blob([header, unsignedBytes(0x18538067), ebmlSize(size), ...parts], { type: 'video/webm' });
}

async function videoEncoderConfiguration(width, height) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return;
  for (const [codec, codecId] of [['vp8', 'V_VP8'], ['vp09.00.10.08', 'V_VP9']]) {
    const config = {
      codec, width, height, bitrate: 8_000_000, framerate: videoFramesPerSecond,
      latencyMode: 'realtime', alpha: 'discard',
    };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, codecId };
    } catch { /* Try the other WebM codec before using native stream recording. */ }
  }
}

async function exportWebm(options) {
  const { canvas, context, width, height, duration, renderFrame, onProgress, signal } = options;
  const codec = await videoEncoderConfiguration(width, height);
  if (!codec) return exportRecordedWebm(options);

  const frameCount = Math.max(1, Math.round(duration * videoFramesPerSecond));
  const chunks = [];
  let encodingError;
  const encoder = new VideoEncoder({
    output(chunk) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ timestamp: chunk.timestamp, key: chunk.type === 'key', data });
    },
    error(error) { encodingError = error; },
  });
  const abort = () => { if (encoder.state !== 'closed') encoder.reset(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    checkAbort(signal);
    encoder.configure(codec.config);
    for (let index = 0; index < frameCount; index++) {
      checkAbort(signal);
      if (encodingError) throw encodingError;
      const timestamp = Math.round(index * duration * 1e6 / frameCount);
      const next = Math.round((index + 1) * duration * 1e6 / frameCount);
      await drawSvgFrame(context, width, height, await renderFrame(index * duration / frameCount), signal);
      const frame = new VideoFrame(canvas, { timestamp, duration: next - timestamp });
      try { encoder.encode(frame, { keyFrame: index === 0 }); }
      finally { frame.close(); }
      if (encoder.encodeQueueSize >= 4) await encoder.flush();
      onProgress?.((index + 1) / frameCount);
      await pause(0, signal);
    }
    await encoder.flush();
    checkAbort(signal);
    if (encodingError) throw encodingError;
    if (chunks.length !== frameCount) throw new Error('The video encoder did not produce every animation frame.');
    return muxWebm(chunks, { width, height, duration, codecId: codec.codecId, frameCount });
  } catch (error) {
    checkAbort(signal);
    throw new Error(error.message || 'The animation could not be encoded as video.');
  } finally {
    signal?.removeEventListener('abort', abort);
    if (encoder.state !== 'closed') encoder.close();
  }
}

async function exportRecordedWebm({ canvas, context, width, height, duration, renderFrame, onProgress, signal }) {
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    throw new Error('Video export is unavailable in this browser. Export a GIF instead.');
  }
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!type) throw new Error('This browser cannot record WebM video. Export a GIF instead.');

  await drawSvgFrame(context, width, height, await renderFrame(0), signal);
  const stream = canvas.captureStream(0);
  const [track] = stream.getVideoTracks();
  const manualFrames = typeof track?.requestFrame === 'function';
  const tracks = stream.getTracks();
  let recordingStream = stream;
  let recorder;
  try {
    if (!manualFrames) {
      for (const item of tracks) item.stop();
      recordingStream = canvas.captureStream(videoFramesPerSecond);
      tracks.push(...recordingStream.getTracks());
    }
    recorder = new MediaRecorder(recordingStream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    let recordingError;
    const stopped = new Promise((resolve) => {
      recorder.addEventListener('dataavailable', ({ data }) => { if (data.size) chunks.push(data); });
      recorder.addEventListener('error', ({ error }) => { recordingError = error ?? new Error('Video recording failed.'); });
      recorder.addEventListener('stop', resolve, { once: true });
    });
    const began = new Promise((resolve) => {
      recorder.addEventListener('start', resolve, { once: true });
      recorder.addEventListener('error', resolve, { once: true });
      recorder.addEventListener('stop', resolve, { once: true });
    });
    const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
    const abort = () => stop();
    signal?.addEventListener('abort', abort, { once: true });
    let started = false;
    try {
      checkAbort(signal);
      recorder.start();
      started = true;
      await began;
      checkAbort(signal);
      if (recordingError) throw recordingError;
      // Canvas streams capture on a later paint, so redraw after recorder startup
      // and leave the initial frame in place until the next scheduled sample.
      await drawSvgFrame(context, width, height, await renderFrame(0), signal);
      if (manualFrames) track.requestFrame();
      const start = performance.now();
      const durationMs = duration * 1000;
      const frameCount = Math.max(1, Math.round(duration * videoFramesPerSecond));
      const frameInterval = durationMs / frameCount;
      for (let frame = 1; frame <= frameCount;) {
        checkAbort(signal);
        if (recordingError) throw recordingError;
        await pause(start + frame * frameInterval - performance.now(), signal);
        await drawSvgFrame(context, width, height, await renderFrame(frame * duration / frameCount), signal);
        if (manualFrames) track.requestFrame();
        const elapsed = performance.now() - start;
        onProgress?.(Math.min(1, elapsed / durationMs));
        if (frame === frameCount) break;
        frame = Math.min(frameCount, Math.max(frame + 1, Math.floor(elapsed / frameInterval) + 1));
      }
      // Request the matching loop endpoint, then allow the final paint to reach
      // the encoder before stopping. WebM duration uses that last timestamp.
      await pause(frameInterval, signal);
      if (started) {
        stop();
        await stopped;
      }
      checkAbort(signal);
      if (recordingError) throw recordingError;
      if (!chunks.length) throw new Error('The browser produced an empty video. Try GIF export.');
      onProgress?.(1);
      return new Blob(chunks, { type: 'video/webm' });
    } finally {
      signal?.removeEventListener('abort', abort);
      if (started) {
        stop();
        await stopped;
      }
    }
  } finally {
    for (const item of tracks) item.stop();
  }
}

export async function exportPosterLoop({ format, width, height, duration, renderFrame, onProgress, signal }) {
  if (format === 'video') format = 'webm';
  if (format !== 'gif' && format !== 'webm') throw new Error('Choose GIF or WebM for animation export.');
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('The animation dimensions or duration are invalid.');
  }
  checkAbort(signal);
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: format === 'gif' });
  if (!context || canvas.width !== width || canvas.height !== height) {
    throw new Error('The artboard is too large to export in this browser.');
  }
  onProgress?.(0);
  const options = { canvas, context, width, height, duration, renderFrame, onProgress, signal };
  try {
    return await (format === 'gif' ? exportGif(options) : exportWebm(options));
  } finally {
    canvas.width = canvas.height = 1;
  }
}
