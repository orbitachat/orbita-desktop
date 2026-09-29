const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) {
    r = (r & 0x80000000) ? ((r << 1) ^ 0x04C11DB7) : (r << 1);
  }
  CRC_TABLE[i] = r >>> 0;
}

function oggCrc(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xFF]) >>> 0;
  }
  return crc;
}

function createOggPage(
  headerType: number,
  granulePosition: number,
  serialNumber: number,
  sequenceNumber: number,
  packets: Uint8Array[]
): Uint8Array {
  const segmentLengths: number[] = [];
  let totalPayloadSize = 0;

  for (const pkt of packets) {
    let len = pkt.length;
    totalPayloadSize += len;
    while (len >= 255) {
      segmentLengths.push(255);
      len -= 255;
    }
    segmentLengths.push(len);
  }

  const headerSize = 27 + segmentLengths.length;
  const page = new Uint8Array(headerSize + totalPayloadSize);
  const view = new DataView(page.buffer);

  page[0] = 0x4F;
  page[1] = 0x67;
  page[2] = 0x67;
  page[3] = 0x53;
  page[4] = 0;
  page[5] = headerType;
  view.setBigInt64(6, BigInt(granulePosition), true);
  view.setUint32(14, serialNumber >>> 0, true);
  view.setUint32(18, sequenceNumber >>> 0, true);
  view.setUint32(22, 0, true);
  page[26] = segmentLengths.length;

  for (let i = 0; i < segmentLengths.length; i++) {
    page[27 + i] = segmentLengths[i];
  }

  let offset = headerSize;
  for (const pkt of packets) {
    page.set(pkt, offset);
    offset += pkt.length;
  }

  const checksum = oggCrc(page);
  view.setUint32(22, checksum >>> 0, true);
  return page;
}

function getOpusPacketSamples(packet: Uint8Array): number {
  if (packet.length < 1) return 960;
  const toc = packet[0];
  const config = toc >> 3;
  let samplesPerFrame = 960;

  if (config <= 11) {
    if (config === 0 || config === 4 || config === 8) samplesPerFrame = 480;
    else if (config === 1 || config === 5 || config === 9) samplesPerFrame = 960;
    else if (config === 2 || config === 6 || config === 10) samplesPerFrame = 1920;
    else samplesPerFrame = 2880;
  } else if (config <= 15) {
    if (config === 12 || config === 14) samplesPerFrame = 480;
    else samplesPerFrame = 960;
  } else {
    const celtConfig = config - 16;
    const mode = celtConfig & 3;
    if (mode === 0) samplesPerFrame = 120;
    else if (mode === 1) samplesPerFrame = 240;
    else if (mode === 2) samplesPerFrame = 480;
    else samplesPerFrame = 960;
  }

  const frameCountCode = toc & 3;
  let frameCount = 1;
  if (frameCountCode === 1 || frameCountCode === 2) {
    frameCount = 2;
  } else if (frameCountCode === 3 && packet.length >= 2) {
    frameCount = packet[1] & 0x3F;
  }
  return samplesPerFrame * frameCount;
}

function readVint(buf: Uint8Array, offset: number): { length: number; value: number } | null {
  if (offset >= buf.length) return null;
  const firstByte = buf[offset];
  let length = 0;
  let mask = 0x80;
  for (let i = 0; i < 8; i++) {
    if (firstByte & mask) {
      length = i + 1;
      break;
    }
    mask >>= 1;
  }
  if (length === 0 || offset + length > buf.length) return null;
  let value = firstByte & (mask - 1);
  for (let i = 1; i < length; i++) {
    value = (value * 256) + buf[offset + i];
  }
  return { length, value };
}

function readElementId(buf: Uint8Array, offset: number): { length: number; id: number } | null {
  if (offset >= buf.length) return null;
  const firstByte = buf[offset];
  let length = 0;
  let mask = 0x80;
  for (let i = 0; i < 4; i++) {
    if (firstByte & mask) {
      length = i + 1;
      break;
    }
    mask >>= 1;
  }
  if (length === 0 || offset + length > buf.length) return null;
  let id = 0;
  for (let i = 0; i < length; i++) {
    id = (id * 256) + buf[offset + i];
  }
  return { length, id };
}

function extractOpusPacketsFromWebM(webmBytes: Uint8Array): { packets: Uint8Array[]; extractedOpusHead: Uint8Array | null } {
  const packets: Uint8Array[] = [];
  let extractedOpusHead: Uint8Array | null = null;
  const CONTAINER_IDS = new Set([
    0x1A45DFA3,
    0x18538067,
    0x114D9B74,
    0x1549A966,
    0x1654AE6B,
    0xAE,
    0xE1,
    0x1F43B675,
    0xA0,
  ]);

  let offset = 0;
  while (offset < webmBytes.length) {
    const elId = readElementId(webmBytes, offset);
    if (!elId) break;
    offset += elId.length;

    const elSize = readVint(webmBytes, offset);
    if (!elSize) break;
    offset += elSize.length;

    if (CONTAINER_IDS.has(elId.id)) {
      continue;
    }

    const dataEnd = offset + elSize.value;
    if (dataEnd > webmBytes.length) break;

    if (elId.id === 0x63A2 && elSize.value >= 19) {
      const headerStr = String.fromCharCode(...webmBytes.subarray(offset, offset + 8));
      if (headerStr === 'OpusHead') {
        extractedOpusHead = webmBytes.slice(offset, dataEnd);
      }
    } else if (elId.id === 0xA3 || elId.id === 0xA1) {
      let blockOffset = offset;
      const trackVint = readVint(webmBytes, blockOffset);
      if (trackVint) {
        blockOffset += trackVint.length + 3;
        if (blockOffset < dataEnd) {
          packets.push(webmBytes.slice(blockOffset, dataEnd));
        }
      }
    }

    offset = dataEnd;
  }

  return { packets, extractedOpusHead };
}

export function convertWebMOpusToOgg(webmBytes: Uint8Array): Uint8Array | null {
  const { packets, extractedOpusHead } = extractOpusPacketsFromWebM(webmBytes);
  if (packets.length === 0) return null;

  const serial = Math.floor(Math.random() * 0xFFFFFFFE) + 1;
  const pages: Uint8Array[] = [];
  let seq = 0;

  let opusHead = extractedOpusHead;
  if (!opusHead || opusHead.length < 19) {
    opusHead = new Uint8Array(19);
    opusHead[0] = 0x4F;
    opusHead[1] = 0x70;
    opusHead[2] = 0x75;
    opusHead[3] = 0x73;
    opusHead[4] = 0x48;
    opusHead[5] = 0x65;
    opusHead[6] = 0x61;
    opusHead[7] = 0x64;
    opusHead[8] = 1;
    opusHead[9] = 1;
    opusHead[10] = 0x00;
    opusHead[11] = 0x0F;
    opusHead[12] = 0x80;
    opusHead[13] = 0xBB;
    opusHead[14] = 0x00;
    opusHead[15] = 0x00;
    opusHead[16] = 0x00;
    opusHead[17] = 0x00;
    opusHead[18] = 0;
  }
  pages.push(createOggPage(0x02, 0, serial, seq++, [opusHead]));

  const vendorStr = 'Orbita';
  const vendorBytes = new TextEncoder().encode(vendorStr);
  const tagsLen = 8 + 4 + vendorBytes.length + 4;
  const opusTags = new Uint8Array(tagsLen);
  opusTags[0] = 0x4F;
  opusTags[1] = 0x70;
  opusTags[2] = 0x75;
  opusTags[3] = 0x73;
  opusTags[4] = 0x54;
  opusTags[5] = 0x61;
  opusTags[6] = 0x67;
  opusTags[7] = 0x73;
  const tagsView = new DataView(opusTags.buffer);
  tagsView.setUint32(8, vendorBytes.length, true);
  opusTags.set(vendorBytes, 12);
  tagsView.setUint32(12 + vendorBytes.length, 0, true);
  pages.push(createOggPage(0x00, 0, serial, seq++, [opusTags]));

  let cumulativeGranule = 0;
  let pagePackets: Uint8Array[] = [];
  let pageSegments = 0;

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];
    const isLast = (i === packets.length - 1);
    cumulativeGranule += getOpusPacketSamples(pkt);

    const segCount = Math.floor(pkt.length / 255) + 1;
    if (pageSegments + segCount > 250 || pagePackets.length >= 50 || isLast) {
      pagePackets.push(pkt);
      const headerType = isLast ? 0x04 : 0x00;
      pages.push(createOggPage(headerType, cumulativeGranule, serial, seq++, pagePackets));
      pagePackets = [];
      pageSegments = 0;
    } else {
      pagePackets.push(pkt);
      pageSegments += segCount;
    }
  }

  const totalLen = pages.reduce((sum, p) => sum + p.length, 0);
  const oggFile = new Uint8Array(totalLen);
  let writeOffset = 0;
  for (const page of pages) {
    oggFile.set(page, writeOffset);
    writeOffset += page.length;
  }

  return oggFile;
}
