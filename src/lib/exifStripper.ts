export function stripJpegExif(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  if (view.byteLength < 4) return buffer;
  if (view.getUint16(0, false) !== 0xFFD8) return buffer;

  const bytes = new Uint8Array(buffer);
  const segments: Uint8Array[] = [];
  let offset = 2;
  segments.push(new Uint8Array([0xFF, 0xD8]));

  while (offset < view.byteLength) {
    if (offset + 1 >= view.byteLength) break;
    if (view.getUint8(offset) !== 0xFF) break;

    const marker = view.getUint8(offset + 1);
    offset += 2;

    if (marker === 0xD9 || marker === 0xDA) {
      segments.push(bytes.subarray(offset - 2));
      break;
    }

    if (offset + 2 > view.byteLength) break;
    const segmentLength = view.getUint16(offset, false);

    const isAppMetadata = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE;
    if (!isAppMetadata) {
      segments.push(bytes.subarray(offset - 2, offset + segmentLength));
    }
    offset += segmentLength;
  }

  let totalLength = 0;
  for (const seg of segments) totalLength += seg.length;
  if (totalLength === 0) return buffer;

  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const seg of segments) {
    result.set(seg, pos);
    pos += seg.length;
  }
  return result.buffer;
}

export function stripPngMetadata(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8) return buffer;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4E &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0D &&
    bytes[5] === 0x0A &&
    bytes[6] === 0x1A &&
    bytes[7] === 0x0A;
  if (!isPng) return buffer;

  const view = new DataView(buffer);
  const segments: Uint8Array[] = [];
  segments.push(bytes.subarray(0, 8));
  let offset = 8;

  const forbiddenChunks = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);

  while (offset + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(offset, false);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const totalChunkLength = 12 + chunkLength;
    if (offset + totalChunkLength > view.byteLength) {
      segments.push(bytes.subarray(offset));
      break;
    }

    if (!forbiddenChunks.has(chunkType)) {
      segments.push(bytes.subarray(offset, offset + totalChunkLength));
    }
    offset += totalChunkLength;
  }

  let totalLength = 0;
  for (const seg of segments) totalLength += seg.length;
  if (totalLength === 0) return buffer;

  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const seg of segments) {
    result.set(seg, pos);
    pos += seg.length;
  }
  return result.buffer;
}

export function stripExifMetadata(buffer: ArrayBuffer, mimeOrName?: string): ArrayBuffer {
  try {
    const hint = (mimeOrName || '').toLowerCase();
    const isJpeg = hint.includes('jpeg') || hint.includes('jpg') || hint.endsWith('.jpg') || hint.endsWith('.jpeg');
    const isPng = hint.includes('png') || hint.endsWith('.png');

    if (isJpeg) {
      return stripJpegExif(buffer);
    }
    if (isPng) {
      return stripPngMetadata(buffer);
    }
    const view = new DataView(buffer);
    if (view.byteLength >= 2 && view.getUint16(0, false) === 0xFFD8) {
      return stripJpegExif(buffer);
    }
    if (view.byteLength >= 8 && view.getUint32(0, false) === 0x89504E47) {
      return stripPngMetadata(buffer);
    }
    return buffer;
  } catch {
    return buffer;
  }
}