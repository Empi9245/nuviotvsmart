// Pure byte parsing shared by Node demux and the browser. No I/O or Buffer.
function error(code) {
  return Object.assign(new Error(code), { code });
}
function vintWidth(first) {
  for (let width = 1; first && width <= 8; width++) if (first & (1 << (8 - width))) return width;
  return 0;
}
function readElementId(data, offset) {
  const width = vintWidth(data[offset]);
  if (!width || width > 4 || offset + width > data.length) return null;
  let value = data[offset];
  for (let i = 1; i < width; i++) value = value * 256 + data[offset + i];
  return { value: value >>> 0, width };
}
function readVint(data, offset) {
  const width = vintWidth(data[offset]);
  if (!width || offset + width > data.length) return null;
  let value = data[offset] & ((1 << (8 - width)) - 1);
  let unknown = value === (1 << (8 - width)) - 1;
  for (let i = 1; i < width; i++) {
    value = value * 256 + data[offset + i];
    unknown = unknown && data[offset + i] === 255;
  }
  if (!unknown && !Number.isSafeInteger(value)) return null;
  return { value, width, unknown };
}
function readElement(data, offset, limit = data.length, allowTruncated = false) {
  const id = readElementId(data, offset);
  if (!id) return null;
  const size = readVint(data, offset + id.width);
  if (!size) return null;
  const dataStart = offset + id.width + size.width;
  const dataEnd = size.unknown ? limit : dataStart + size.value;
  if (!Number.isSafeInteger(dataEnd) || dataStart > limit || (!allowTruncated && dataEnd > limit))
    return null;
  return {
    id: id.value,
    start: offset,
    dataStart,
    dataEnd: Math.min(dataEnd, limit),
    declaredDataEnd: dataEnd,
    totalSize: size.unknown ? null : dataEnd - offset,
    truncated: dataEnd > limit,
    unknownSize: size.unknown
  };
}
function children(data, parent, max = 8192) {
  const result = [];
  for (let offset = parent.dataStart; offset < parent.dataEnd;) {
    if (result.length >= max) throw error("ELEMENT_LIMIT");
    const child = readElement(data, offset, parent.dataEnd);
    if (!child || child.unknownSize || child.declaredDataEnd <= offset)
      throw error("TRUNCATED_ELEMENT");
    result.push(child);
    offset = child.declaredDataEnd;
  }
  return result;
}
function unsigned(data, element) {
  if (!element || element.dataEnd <= element.dataStart || element.dataEnd - element.dataStart > 8)
    return null;
  let value = 0;
  for (let i = element.dataStart; i < element.dataEnd; i++) value = value * 256 + data[i];
  return Number.isSafeInteger(value) ? value : null;
}
function string(data, element) {
  if (!element) return "";
  if (element.dataEnd - element.dataStart > 4096) throw error("STRING_LIMIT");
  return new TextDecoder("utf-8", { fatal: true })
    .decode(data.subarray(element.dataStart, element.dataEnd))
    .replace(/\0+$/g, "")
    .trim();
}
const find = (data, parent, id) => children(data, parent).find((item) => item.id === id);
const number = (data, parent, id) => unsigned(data, find(data, parent, id));
const text = (data, parent, id) => string(data, find(data, parent, id));
function seekHead(data, parent = readElement(data, 0)) {
  if (!parent || parent.id !== 0x114d9b74) throw error("INVALID_SEEK_HEAD");
  const positions = {};
  for (const seek of children(data, parent)) {
    if (seek.id !== 0x4dbb) continue;
    const key = unsigned(data, find(data, seek, 0x53ab));
    const position = number(data, seek, 0x53ac);
    if (key !== null && position !== null) positions[key] = position;
  }
  return positions;
}
function header(data, totalSize) {
  let segment = null;
  for (let offset = 0; offset < data.length;) {
    const item = readElement(data, offset, data.length, true);
    if (!item) break;
    if (item.id === 0x18538067) {
      segment = item;
      break;
    }
    if (item.truncated || item.unknownSize) break;
    offset = item.declaredDataEnd;
  }
  if (!segment) throw error("INVALID_MATROSKA");
  const metadata = {
    segmentDataStart: segment.dataStart,
    segmentEnd: segment.unknownSize ? totalSize : segment.declaredDataEnd,
    totalSize,
    timecodeScaleNs: 1000000,
    infoParsed: false,
    positions: {},
    tracks: [],
    seekHeads: [],
    scanOffset: segment.dataStart
  };
  if (metadata.segmentEnd > totalSize) throw error("TRUNCATED_ELEMENT");
  for (let offset = segment.dataStart; offset < data.length;) {
    const item = readElement(data, offset, data.length, true);
    metadata.scanOffset = offset;
    if (item && ![0xec, 0xbf, 0x1f43b675].includes(item.id)) metadata.positions[item.id] = offset;
    if (!item || item.truncated || item.unknownSize) break;
    if (item.id === 0x114d9b74) {
      metadata.seekHeads.push(offset);
      for (const [key, position] of Object.entries(seekHead(data, item)))
        metadata.positions[key] = segment.dataStart + position;
    } else if (item.id === 0x1549a966) {
      metadata.timecodeScaleNs = number(data, item, 0x2ad7b1) || 1000000;
      metadata.infoParsed = true;
    } else if (item.id === 0x1654ae6b) metadata.tracks = tracks(data, item);
    offset = item.declaredDataEnd;
    metadata.scanOffset = offset;
  }
  return metadata;
}
function compression(data, entry) {
  const encodings = find(data, entry, 0x6d80);
  if (!encodings) return { type: "none", scope: 1, settings: new Uint8Array() };
  const list = children(data, encodings).filter((item) => item.id === 0x6240);
  if (list.length !== 1) return { type: "unsupported" };
  const encoding = list[0];
  const scope = number(data, encoding, 0x5032) ?? 1;
  if (
    (number(data, encoding, 0x5033) || 0) !== 0 ||
    find(data, encoding, 0x5035) ||
    (scope !== 1 && scope !== 2 && scope !== 3)
  )
    return { type: "unsupported" };
  const comp = find(data, encoding, 0x5034);
  if (!comp) return { type: "unsupported" };
  const algorithm = number(data, comp, 0x4254) || 0;
  const settings = find(data, comp, 0x4255);
  if (settings && settings.dataEnd - settings.dataStart > 4096)
    throw error("COMPRESSION_SETTINGS_LIMIT");
  return {
    type: algorithm === 0 ? "zlib" : algorithm === 3 ? "header" : "unsupported",
    scope,
    settings: settings ? data.slice(settings.dataStart, settings.dataEnd) : new Uint8Array()
  };
}
function tracks(data, parent = readElement(data, 0)) {
  if (!parent || parent.id !== 0x1654ae6b) throw error("TRACKS_NOT_FOUND");
  return children(data, parent, 64)
    .filter((item) => item.id === 0xae)
    .map((entry) => {
      const privateData = find(data, entry, 0x63a2);
      if (privateData && privateData.dataEnd - privateData.dataStart > 64 * 1024)
        throw error("CODEC_PRIVATE_LIMIT");
      const uid = find(data, entry, 0x73c5);
      const uidHex = uid
        ? Array.from(data.subarray(uid.dataStart, uid.dataEnd), (byte) =>
            byte.toString(16).padStart(2, "0")
          ).join("")
        : "";
      const scaleElement = find(data, entry, 0x23314f);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const trackScale = !scaleElement
        ? 1
        : scaleElement.dataEnd - scaleElement.dataStart === 4
          ? view.getFloat32(scaleElement.dataStart)
          : scaleElement.dataEnd - scaleElement.dataStart === 8
            ? view.getFloat64(scaleElement.dataStart)
            : NaN;
      const offsetElement = find(data, entry, 0x537f);
      return {
        number: number(data, entry, 0xd7),
        uid: uidHex,
        type: number(data, entry, 0x83),
        codecId: text(data, entry, 0x86),
        language: text(data, entry, 0x22b59d) || text(data, entry, 0x22b59c),
        name: text(data, entry, 0x536e),
        forced: Boolean(number(data, entry, 0x55aa)),
        encoded: Boolean(find(data, entry, 0x6d80)),
        defaultDurationNs: number(data, entry, 0x23e383) || 0,
        codecDelayNs: number(data, entry, 0x56aa) || 0,
        unsupportedTiming:
          trackScale !== 1 || (offsetElement && unsigned(data, offsetElement) !== 0),
        compression: compression(data, entry),
        codecPrivate: privateData
          ? data.slice(privateData.dataStart, privateData.dataEnd)
          : new Uint8Array()
      };
    });
}
function cues(data, scale) {
  const parent = readElement(data, 0);
  if (!parent || parent.id !== 0x1c53bb6b) throw error("INVALID_CUES");
  const result = [];
  for (const point of children(data, parent)) {
    if (point.id !== 0xbb) continue;
    const ticks = number(data, point, 0xb3);
    if (ticks === null) continue;
    for (const position of children(data, point)) {
      if (position.id !== 0xb7) continue;
      if (result.length >= 8192) throw error("CUE_LIMIT");
      const track = number(data, position, 0xf7);
      const clusterPosition = number(data, position, 0xf1);
      if (track === null || clusterPosition === null) continue;
      result.push({
        track,
        clusterPosition,
        relativePosition: number(data, position, 0xf0),
        timeMs: (ticks * scale) / 1000000,
        durationMs: ((number(data, position, 0xb2) || 0) * scale) / 1000000
      });
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}
function blockParts(data, trackNumber, scale, clusterMs) {
  const group = readElement(data, 0);
  if (!group || ![0xa0, 0xa3].includes(group.id)) throw error("INVALID_CUE_POSITION");
  const entry = group.id === 0xa0 ? find(data, group, 0xa1) : group;
  if (!entry) throw error("INVALID_CUE_POSITION");
  const track = readVint(data, entry.dataStart);
  if (!track || track.value !== trackNumber || entry.dataEnd - entry.dataStart < track.width + 3)
    throw error("INVALID_CUE_POSITION");
  const start = entry.dataStart + track.width;
  const ticks = new DataView(data.buffer, data.byteOffset + start, 2).getInt16(0);
  const payload = data.subarray(start + 3, entry.dataEnd);
  if (payload.length > 32 * 1024) throw error("BLOCK_LIMIT");
  let additions = new Uint8Array();
  const more = group.id === 0xa0 ? find(data, group, 0x75a1) : null;
  if (more)
    for (const entry of children(data, more, 64)) {
      if (entry.id !== 0xa6 || (number(data, entry, 0xee) ?? 1) !== 1) continue;
      const value = find(data, entry, 0xa5);
      if (value) additions = data.subarray(value.dataStart, value.dataEnd);
    }
  return {
    payloads: unlace(payload, data[start + 2] & 0x06),
    additions,
    start: (clusterMs + (ticks * scale) / 1000000) / 1000,
    duration: ((group.id === 0xa0 ? number(data, group, 0x9b) || 0 : 0) * scale) / 1000000000
  };
}
function unlace(payload, mode) {
  if (!mode) return [payload];
  const count = payload[0] + 1;
  if (!payload.length || count < 2 || count > 32) throw error("LACING_LIMIT");
  let offset = 1;
  const sizes = [];
  if (mode === 4) {
    if ((payload.length - 1) % count) throw error("INVALID_LACING");
    sizes.push(...Array(count).fill((payload.length - 1) / count));
  } else if (mode === 2) {
    for (let i = 0; i < count - 1; i++) {
      let length = 0;
      let byte;
      do {
        if (offset >= payload.length) throw error("INVALID_LACING");
        byte = payload[offset++];
        length += byte;
      } while (byte === 255);
      sizes.push(length);
    }
  } else {
    for (let i = 0; i < count - 1; i++) {
      const value = readVint(payload, offset);
      if (!value || value.unknown || value.width > 4) throw error("INVALID_LACING");
      offset += value.width;
      const length =
        i === 0 ? value.value : sizes[i - 1] + value.value - (2 ** (7 * value.width - 1) - 1);
      if (length < 0) throw error("INVALID_LACING");
      sizes.push(length);
    }
  }
  if (mode !== 4)
    sizes.push(payload.length - offset - sizes.reduce((sum, value) => sum + value, 0));
  if (
    sizes.some((value) => value < 0) ||
    offset + sizes.reduce((sum, value) => sum + value, 0) !== payload.length
  )
    throw error("INVALID_LACING");
  return sizes.map((length) => {
    const frame = payload.subarray(offset, offset + length);
    offset += length;
    return frame;
  });
}
function block(data, trackNumber, scale, clusterMs) {
  const parts = blockParts(data, trackNumber, scale, clusterMs);
  if (parts.payloads.length !== 1) throw error("LACED_TEXT_UNSUPPORTED");
  return {
    text: new TextDecoder("utf-8", { fatal: true }).decode(parts.payloads[0]).replace(/\0+$/g, ""),
    start: parts.start,
    duration: parts.duration
  };
}
module.exports = {
  readElementId,
  readVint,
  readElement,
  unsigned,
  children,
  header,
  seekHead,
  tracks,
  cues,
  block,
  blockParts,
  error
};
