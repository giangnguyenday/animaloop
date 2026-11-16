export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function svgToPng(svg, width, height) {
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a canvas at these dimensions.');
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Canvas export failed.');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function setPngDensity(png, pixelsPerInch) {
  const physicalType = 0x70485973; // pHYs
  const imageDataType = 0x49444154; // IDAT
  const chunk = new Uint8Array(21);
  const header = new DataView(chunk.buffer);
  const pixelsPerMetre = Math.round(pixelsPerInch / .0254);
  header.setUint32(0, 9);
  header.setUint32(4, physicalType);
  header.setUint32(8, pixelsPerMetre);
  header.setUint32(12, pixelsPerMetre);
  chunk[16] = 1;

  let crc = -1;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  header.setUint32(17, ~crc);

  const data = new DataView(await png.arrayBuffer());
  for (let position = 8; position + 12 <= data.byteLength;) {
    const end = position + 12 + data.getUint32(position);
    const type = data.getUint32(position + 4);
    if (type === physicalType || type === imageDataType) {
      return new Blob([
        png.slice(0, position), chunk,
        png.slice(type === physicalType ? end : position),
      ], { type: png.type });
    }
    position = end;
  }
  throw new Error('Could not set the print resolution.');
}
