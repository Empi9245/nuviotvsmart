import demux from "../../../services/webos/src/matroskaTextDemux.cjs";
import textWindows from "../../../services/webos/src/matroskaTextWindows.cjs";

export const VIDAA_EMBEDDED_TEXT_LIMITS = Object.freeze({
  headerBytes: 128 * 1024,
  indexBytes: 256 * 1024,
  blockBytes: 32 * 1024 + 64,
  residentBytes: 2 * 1024 * 1024,
  discoveryBytes: 1024 * 1024,
  windowBytes: 1024 * 1024,
  discoveryRequests: 192,
  windowRequests: 2048,
  sessionBytes: 64 * 1024 * 1024,
  sessionRequests: 131072,
  requestsPerMinute: 2048,
  structurePageBytes: 256,
  parsedClusterBytes: 512 * 1024,
  parsedClusterEntries: 64,
  windowCues: 512,
  windowBodyBytes: 128 * 1024,
  timeoutMs: 5000,
  operationTimeoutMs: 15000
});
const fail = demux.error;
const encoder = () => new TextEncoder();

export function createVidaaEmbeddedTextProvider({
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now()
} = {}) {
  const limits = VIDAA_EMBEDDED_TEXT_LIMITS;
  let current = null;
  let nextIdentity = 0;
  function cancelWindow() {
    current?.windowController?.abort();
  }
  function dispose() {
    const previous = current;
    current = null;
    previous?.metadataController?.abort();
    previous?.windowController?.abort();
    previous?.cache.clear();
    previous?.parsedClusters.clear();
  }
  function source(url, headers = {}) {
    let target;
    try {
      target = new URL(url);
    } catch (_) {
      throw fail("INVALID_URL");
    }
    if (!/^https?:$/.test(target.protocol) || target.username || target.password)
      throw fail("INVALID_URL");
    const supplied = new Headers(headers);
    for (const key of ["range", "host", "origin", "cookie", "accept-encoding"])
      supplied.delete(key);
    const headerKey = JSON.stringify([...supplied.entries()].sort());
    if (current?.url === target.href && current.headerKey === headerKey) return current;
    dispose();
    current = {
      url: target.href,
      headers: supplied,
      headerKey,
      identity: `vidaa-range-${++nextIdentity}`,
      metadata: null,
      pending: null,
      retryAt: 0,
      cache: new Map(),
      parsedClusters: new Map(),
      metadataBytes: 0,
      requestedBytes: 0,
      receivedBytes: 0,
      requests: 0,
      requestTimes: [],
      residentBytes: 0,
      peakResidentBytes: 0,
      errorCode: "",
      accessVerified: false
    };
    return current;
  }
  const check = (s, signal) => {
    if (s !== current || signal.aborted) throw fail("REQUEST_SUPERSEDED");
  };
  function own(s, bytes) {
    s.peakResidentBytes = Math.max(s.peakResidentBytes, s.residentBytes + bytes);
    if (s.residentBytes + bytes > limits.residentBytes) throw fail("RESIDENT_BUDGET");
  }
  const budget = (kind) => ({
    bytes: 0,
    requests: 0,
    clusterTimes: new Map(),
    deadline: now() + limits.operationTimeoutMs,
    maxBytes: kind === "discovery" ? limits.discoveryBytes : limits.windowBytes,
    maxRequests: kind === "discovery" ? limits.discoveryRequests : limits.windowRequests
  });
  const bodyBytes = (item) => ((item.body?.length || 0) + (item.assBody?.length || 0)) * 2;
  const retainedFrameBytes = (frame) =>
    (frame.text.length + (frame.settings?.length || 0)) * 2 + 128;
  const retainedBytes = (s) =>
    s.metadataBytes +
    [...s.cache.values()].reduce((sum, item) => sum + bodyBytes(item), 0) +
    [...s.parsedClusters.values()].reduce((sum, item) => sum + item.bytes, 0);
  async function range(s, start, size, operation, signal) {
    check(s, signal);
    if (now() >= operation.deadline) throw fail("RANGE_TIMEOUT");
    const end = s.metadata?.totalSize
      ? Math.min(s.metadata.totalSize - 1, start + size - 1)
      : start + size - 1;
    const capacity = end - start + 1;
    if (!Number.isSafeInteger(start) || start < 0 || capacity <= 0 || size > limits.indexBytes)
      throw fail("INVALID_RANGE");
    s.requestTimes = s.requestTimes.filter((time) => time > now() - 60000);
    if (
      operation.requests >= operation.maxRequests ||
      operation.bytes + capacity > operation.maxBytes ||
      s.requests >= limits.sessionRequests ||
      s.requestedBytes + capacity > limits.sessionBytes ||
      s.requestTimes.length >= limits.requestsPerMinute
    )
      throw fail("TRAFFIC_BUDGET");
    operation.requests++;
    operation.bytes += capacity;
    s.requests++;
    s.requestedBytes += capacity;
    s.requestTimes.push(now());
    const controller = new AbortController();
    let rejectAbort;
    const abort = () => {
      controller.abort();
      rejectAbort?.(fail("REQUEST_SUPERSEDED"));
    };
    const cancelled = new Promise((_, reject) => {
      rejectAbort = reject;
    });
    signal.addEventListener("abort", abort, { once: true });
    let reader;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(
        () => {
          controller.abort();
          reject(fail("RANGE_TIMEOUT"));
        },
        Math.min(limits.timeoutMs, operation.deadline - now())
      );
    });
    const bounded = (promise) => Promise.race([promise, deadline, cancelled]);
    try {
      const headers = new Headers(s.headers);
      headers.set("Range", `bytes=${start}-${end}`);
      const response = await bounded(
        fetchImpl(s.url, {
          headers,
          signal: controller.signal,
          mode: "cors",
          credentials: "omit",
          redirect: "error",
          cache: "no-store"
        })
      );
      check(s, signal);
      if (response.status === 401 || response.status === 403) throw fail("AUTH_DENIED");
      if (
        response.status !== 206 ||
        response.redirected ||
        ["opaque", "opaqueredirect"].includes(response.type)
      )
        throw fail("RANGE_UNAVAILABLE");
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get("Content-Range") || "");
      if (!match) throw fail("CONTENT_RANGE_UNREADABLE");
      const totalSize = Number(match[3]);
      const actualEnd = Number(match[2]);
      if (
        !Number.isSafeInteger(totalSize) ||
        totalSize <= 0 ||
        Number(match[1]) !== start ||
        actualEnd !== Math.min(end, totalSize - 1) ||
        (s.metadata && s.metadata.totalSize !== totalSize)
      )
        throw fail("CONTENT_RANGE_MISMATCH");
      if (actualEnd - start + 1 >= totalSize) throw fail("WHOLE_FILE_REFUSED");
      const validator = response.headers.get("ETag") || response.headers.get("Last-Modified");
      if (s.validator && validator && s.validator !== validator) throw fail("SOURCE_CHANGED");
      if (validator) s.validator = validator;
      const contentLength = response.headers.get("Content-Length");
      const actualSize = actualEnd - start + 1;
      if (
        contentLength !== null &&
        (!/^\d+$/.test(contentLength) || Number(contentLength) !== actualSize)
      )
        throw fail("RANGE_TOO_LARGE");
      const encoding = response.headers.get("Content-Encoding");
      if (encoding && encoding.toLowerCase() !== "identity")
        throw fail("ENCODED_RANGE_UNSUPPORTED");
      if (!response.body?.getReader) throw fail("STREAM_READER_UNAVAILABLE");
      own(s, actualSize);
      const bytes = new Uint8Array(actualSize);
      reader = response.body.getReader();
      let received = 0;
      while (true) {
        const chunk = await bounded(reader.read());
        check(s, signal);
        if (chunk.done) break;
        received += chunk.value.byteLength;
        s.receivedBytes += chunk.value.byteLength;
        own(s, actualSize + chunk.value.buffer.byteLength);
        if (received > actualSize || s.receivedBytes > limits.sessionBytes)
          throw fail("RANGE_TOO_LARGE");
        bytes.set(chunk.value, received - chunk.value.byteLength);
      }
      if (received !== actualSize) throw fail("TRUNCATED_RANGE");
      return { bytes, totalSize };
    } catch (error) {
      throw error?.code
        ? error
        : fail(signal.aborted || s !== current ? "REQUEST_SUPERSEDED" : "TRANSPORT_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      controller.abort();
      try {
        void reader?.cancel().catch(() => {});
      } catch (_) {}
      try {
        reader?.releaseLock();
      } catch (_) {}
    }
  }
  async function indexedElement(s, start, id, maxSize, operation, signal) {
    const probe = await range(s, start, 12, operation, signal);
    const item = demux.readElement(probe.bytes, 0, probe.bytes.length, true);
    if (!item || item.id !== id || item.totalSize === null || item.totalSize > maxSize)
      throw fail("INDEX_ELEMENT_LIMIT");
    if (item.totalSize <= probe.bytes.length) return probe.bytes.subarray(0, item.totalSize);
    return (await range(s, start, item.totalSize, operation, signal)).bytes;
  }
  // Replace one short structure page as the cursor moves. Skip video/audio and
  // attachments by declared size; no raw Cluster is accumulated or cached.
  async function peek(s, start, end, operation, signal) {
    check(s, signal);
    if (
      operation.page &&
      start >= operation.page.start &&
      start + Math.min(12, end - start) <= operation.page.end
    ) {
      return operation.page.bytes.subarray(
        start - operation.page.start,
        Math.min(end, operation.page.end) - operation.page.start
      );
    }
    operation.page = null;
    const bytes = (
      await range(s, start, Math.min(limits.structurePageBytes, end - start), operation, signal)
    ).bytes;
    operation.page = { start, end: start + bytes.length, bytes };
    return bytes;
  }
  async function elementAt(s, start, end, operation, signal) {
    const bytes = await peek(s, start, end, operation, signal);
    const item = demux.readElement(bytes, 0, bytes.length, true);
    if (!item || (!item.unknownSize && start + item.totalSize > end))
      throw fail("TRUNCATED_ELEMENT");
    return { item, bytes };
  }
  async function decodePayload(s, data, compression, scope, maxBytes, operation, signal) {
    if (!(compression.scope & scope) || compression.type === "none") return data;
    if (compression.type === "header") {
      if (data.length + compression.settings.length > maxBytes)
        throw fail("DECOMPRESSED_BLOCK_LIMIT");
      own(s, data.length + compression.settings.length);
      const output = new Uint8Array(data.length + compression.settings.length);
      output.set(compression.settings);
      output.set(data, compression.settings.length);
      return output;
    }
    if (compression.type !== "zlib" || typeof DecompressionStream !== "function")
      throw fail("COMPRESSION_UNSUPPORTED");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    }).pipeThrough(new DecompressionStream("deflate"));
    const reader = stream.getReader();
    const output = new Uint8Array(maxBytes);
    own(s, maxBytes * 2 + data.length);
    let length = 0;
    let timer;
    let rejectAbort;
    const cancelled = new Promise((_, reject) => {
      rejectAbort = reject;
    });
    const abort = () => rejectAbort(fail("REQUEST_SUPERSEDED"));
    signal.addEventListener("abort", abort, { once: true });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(fail("RANGE_TIMEOUT")),
        Math.max(1, Math.min(limits.timeoutMs, operation.deadline - now()))
      );
    });
    try {
      while (true) {
        check(s, signal);
        if (now() >= operation.deadline) throw fail("RANGE_TIMEOUT");
        const chunk = await Promise.race([reader.read(), cancelled, timeout]);
        check(s, signal);
        if (chunk.done) break;
        own(s, maxBytes + chunk.value.buffer.byteLength + data.length);
        if (length + chunk.value.length > maxBytes) throw fail("DECOMPRESSED_BLOCK_LIMIT");
        output.set(chunk.value, length);
        length += chunk.value.length;
      }
      return output.subarray(0, length);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  async function decodeBlock(s, track, bytes, clusterMs, durationMs, operation, signal) {
    const parts = demux.blockParts(bytes, track.number, s.metadata.timecodeScaleNs, clusterMs);
    const count = parts.payloads.length;
    const duration =
      (parts.duration || durationMs / 1000) / count || track.defaultDurationNs / 1000000000;
    if (duration <= 0 || !Number.isFinite(duration)) throw fail("CUE_DURATION_UNAVAILABLE");
    const frames = [];
    for (let index = 0; index < count; index++) {
      const payload = await decodePayload(
        s,
        parts.payloads[index],
        track.compression,
        1,
        32 * 1024,
        operation,
        signal
      );
      const text = new TextDecoder("utf-8", { fatal: true }).decode(payload).replace(/\0+$/g, "");
      const start = parts.start - track.codecDelayNs / 1000000000 + index * duration;
      if (!Number.isFinite(start) || start + duration <= 0) throw fail("INVALID_BLOCK_TIMESTAMP");
      if (textWindows.isAss(track.codecId)) textWindows.packet({ text });
      const settings =
        track.codecId === "S_TEXT/WEBVTT"
          ? new TextDecoder("utf-8", { fatal: true }).decode(parts.additions).split(/\r?\n/)[0]
          : "";
      frames.push({
        start: Math.max(0, start),
        end: start + duration,
        text,
        settings,
        track: track.number
      });
    }
    return frames;
  }
  async function clusterHeader(s, position, operation, signal) {
    const metadata = s.metadata;
    const start = metadata.segmentDataStart + position;
    if (
      !Number.isSafeInteger(start) ||
      start < metadata.segmentDataStart ||
      start >= metadata.segmentEnd
    )
      throw fail("INVALID_CUE_POSITION");
    if (operation.clusterTimes.has(start)) return operation.clusterTimes.get(start);
    const prefix = (
      await range(s, start, Math.min(64, metadata.segmentEnd - start), operation, signal)
    ).bytes;
    const cluster = demux.readElement(prefix, 0, prefix.length, true);
    if (!cluster || cluster.id !== 0x1f43b675) throw fail("INVALID_CLUSTER");
    const end = cluster.unknownSize ? metadata.segmentEnd : start + cluster.totalSize;
    if (end > metadata.segmentEnd) throw fail("TRUNCATED_ELEMENT");
    let offset = start + cluster.dataStart;
    for (let count = 0; offset < end && count < 4096; count++) {
      let bytes = prefix.subarray(offset - start);
      let item =
        offset >= start && offset + 12 <= start + prefix.length
          ? demux.readElement(bytes, 0, bytes.length, true)
          : null;
      if (!item || (item.id === 0xe7 && item.truncated))
        ({ item, bytes } = await elementAt(s, offset, end, operation, signal));
      if (item.id === 0xe7) {
        const ticks = demux.unsigned(bytes, item);
        if (ticks === null) throw fail("CLUSTER_TIMESTAMP_UNAVAILABLE");
        const info = {
          milliseconds: (ticks * metadata.timecodeScaleNs) / 1000000,
          dataStart: cluster.dataStart,
          end,
          unknownSize: cluster.unknownSize
        };
        operation.clusterTimes.set(start, info);
        return info;
      }
      if (item.unknownSize || (cluster.unknownSize && topLevel(item.id))) break;
      offset += item.totalSize;
    }
    throw fail("CLUSTER_TIMESTAMP_UNAVAILABLE");
  }
  const topLevel = (id) =>
    [
      0x1f43b675, 0x114d9b74, 0x1549a966, 0x1654ae6b, 0x1c53bb6b, 0x1941a469, 0x1043a770, 0x1254c367
    ].includes(id);
  async function scanCluster(s, position, operation, signal) {
    const cached = s.parsedClusters.get(position);
    if (cached) {
      check(s, signal);
      return cached;
    }
    const metadata = s.metadata;
    const start = metadata.segmentDataStart + position;
    const info = await clusterHeader(s, position, operation, signal);
    const frames = [];
    const errors = new Map();
    let offset = start + info.dataStart;
    let bytesOwned = 128;
    for (let count = 0; offset < info.end; count++) {
      if (count >= 16384) throw fail("CLUSTER_ELEMENT_LIMIT");
      const { item } = await elementAt(s, offset, info.end, operation, signal);
      if (info.unknownSize && topLevel(item.id)) break;
      if (item.unknownSize || item.totalSize <= 0) throw fail("INVALID_CLUSTER");
      if (item.id === 0xa0 || item.id === 0xa3) {
        // Find only the Block header inside a BlockGroup, even for huge video
        // groups. The rest of that group is skipped unless its track is text.
        let blockOffset = offset;
        let blockItem = item;
        if (item.id === 0xa0) {
          blockItem = null;
          for (
            let cursor = offset + item.dataStart, count = 0;
            cursor < offset + item.totalSize && count < 64;
            count++
          ) {
            const child = (await elementAt(s, cursor, offset + item.totalSize, operation, signal))
              .item;
            if (child.id === 0xa1) {
              blockOffset = cursor;
              blockItem = child;
              break;
            }
            if (child.unknownSize) throw fail("INVALID_CLUSTER");
            cursor += child.totalSize;
          }
        }
        if (!blockItem) throw fail("INVALID_CLUSTER");
        const trackBytes = await peek(
          s,
          blockOffset + blockItem.dataStart,
          blockOffset + blockItem.totalSize,
          operation,
          signal
        );
        const id = demux.readVint(trackBytes, 0);
        if (!id || id.unknown) throw fail("INVALID_BLOCK_TRACK");
        const track = metadata.tracks.find((entry) => entry.number === id.value);
        if (track) {
          if (item.totalSize > limits.blockBytes) throw fail("BLOCK_LIMIT");
          const body = (await range(s, offset, item.totalSize, operation, signal)).bytes;
          const indexed = metadata.cues.find(
            (cue) =>
              cue.track === track.number &&
              cue.clusterPosition === position &&
              cue.relativePosition === offset - start - info.dataStart
          );
          try {
            const decoded = await decodeBlock(
              s,
              track,
              body,
              info.milliseconds,
              indexed?.durationMs || 0,
              operation,
              signal
            );
            if (
              indexed &&
              Math.abs(
                (decoded[0].start + track.codecDelayNs / 1000000000) * 1000 - indexed.timeMs
              ) > 1
            )
              throw fail("CUE_TIMESTAMP_MISMATCH");
            for (const frame of decoded) {
              bytesOwned += retainedFrameBytes(frame);
              if (frames.length >= limits.windowCues || bytesOwned > limits.parsedClusterBytes)
                throw fail("CLUSTER_TEXT_LIMIT");
              own(s, bytesOwned + limits.blockBytes * 3);
              frames.push(frame);
            }
          } catch (error) {
            if (/LIMIT|BUDGET|TIMEOUT|SUPERSEDED/.test(error.code || "")) throw error;
            errors.set(track.number, error.code || "TEXT_DECODER_UNAVAILABLE");
          }
        }
      }
      offset += item.totalSize;
    }
    check(s, signal);
    const result = {
      frames,
      errors,
      milliseconds: info.milliseconds,
      nextOffset: offset,
      bytes: bytesOwned
    };
    while (
      s.parsedClusters.size &&
      (s.parsedClusters.size >= limits.parsedClusterEntries ||
        [...s.parsedClusters.values()].reduce((sum, entry) => sum + entry.bytes, 0) + bytesOwned >
          limits.parsedClusterBytes)
    )
      s.parsedClusters.delete(s.parsedClusters.keys().next().value);
    s.residentBytes = retainedBytes(s) + (operation.frameBytes || 0);
    own(s, bytesOwned);
    // Failed decoding is retried, just like failed transport. It cannot poison
    // the parsed-cue cache for the rest of this source's lifetime.
    if (!errors.size) s.parsedClusters.set(position, result);
    s.residentBytes = retainedBytes(s) + (operation.frameBytes || 0);
    return result;
  }
  async function readCue(s, track, cue, operation, signal) {
    const metadata = s.metadata;
    if (cue.relativePosition === null) throw fail("SUBTITLE_INDEX_UNAVAILABLE");
    const clusterStart = metadata.segmentDataStart + cue.clusterPosition;
    const clusterInfo = await clusterHeader(s, cue.clusterPosition, operation, signal);
    const clusterEnd = clusterInfo.end;
    const start = clusterStart + clusterInfo.dataStart + cue.relativePosition;
    if (!Number.isSafeInteger(start) || start < clusterStart || start >= clusterEnd)
      throw fail("INVALID_CUE_POSITION");
    let bytes = (await range(s, start, Math.min(64, clusterEnd - start), operation, signal)).bytes;
    const item = demux.readElement(bytes, 0, bytes.length, true);
    if (
      !item ||
      ![0xa0, 0xa3].includes(item.id) ||
      item.totalSize === null ||
      item.totalSize > limits.blockBytes ||
      item.totalSize > clusterEnd - start
    )
      throw fail("BLOCK_LIMIT");
    if (item.totalSize > bytes.length)
      bytes = (await range(s, start, item.totalSize, operation, signal)).bytes;
    const frames = await decodeBlock(
      s,
      track,
      bytes,
      clusterInfo.milliseconds,
      cue.durationMs,
      operation,
      signal
    );
    if (Math.abs((frames[0].start + track.codecDelayNs / 1000000000) * 1000 - cue.timeMs) > 1)
      throw fail("CUE_TIMESTAMP_MISMATCH");
    return frames;
  }
  async function loadMetadata(s, head, operation, signal) {
    const metadata = demux.header(head.bytes, head.totalSize);
    s.metadata = metadata;
    const mergeSeek = (bytes) => {
      for (const [id, relative] of Object.entries(demux.seekHead(bytes))) {
        const absolute = metadata.segmentDataStart + relative;
        if (
          !Number.isSafeInteger(absolute) ||
          absolute < metadata.segmentDataStart ||
          absolute >= metadata.segmentEnd
        )
          throw fail("INVALID_SEEK_POSITION");
        metadata.positions[id] = absolute;
      }
    };
    const followed = new Set(metadata.seekHeads);
    for (let count = 0; count < 4; count++) {
      const next = metadata.positions[0x114d9b74];
      if (next === undefined || followed.has(next)) break;
      followed.add(next);
      mergeSeek(await indexedElement(s, next, 0x114d9b74, limits.headerBytes, operation, signal));
    }
    let tailIndex = null;
    if (metadata.positions[0x1c53bb6b] === undefined && metadata.tracks.length) {
      // Some muxers put Cues at EOF without SeekHead. One bounded tail probe
      // accepts only a complete, parseable index referencing declared tracks.
      const tailStart = Math.max(
        metadata.segmentDataStart,
        metadata.segmentEnd - limits.indexBytes
      );
      const tail = (await range(s, tailStart, metadata.segmentEnd - tailStart, operation, signal))
        .bytes;
      let candidates = 0;
      for (let offset = 0; offset + 5 < tail.length; offset++) {
        if (
          tail[offset] !== 0x1c ||
          tail[offset + 1] !== 0x53 ||
          tail[offset + 2] !== 0xbb ||
          tail[offset + 3] !== 0x6b
        )
          continue;
        if (++candidates > 4) break;
        const item = demux.readElement(tail, offset);
        if (!item || item.unknownSize) continue;
        try {
          const bytes = tail.subarray(offset, offset + item.totalSize);
          const cues = demux.cues(bytes, metadata.timecodeScaleNs);
          if (
            !cues.length ||
            cues.some((cue) => !metadata.tracks.some((track) => track.number === cue.track))
          )
            continue;
          tailIndex = bytes;
          metadata.positions[0x1c53bb6b] = tailStart + offset;
          break;
        } catch (_) {
          /* An ID inside a media payload is not itself an index. */
        }
      }
    }
    // An absent SeekHead is valid. Walk top-level EBML headers, skipping even
    // large finite Clusters/attachments. Unknown-size unindexed Clusters have
    // no cheap proven boundary and are deliberately not searched byte-by-byte.
    if (
      metadata.positions[0x1c53bb6b] === undefined ||
      (!metadata.tracks.length && metadata.positions[0x1654ae6b] === undefined)
    ) {
      let offset = metadata.scanOffset;
      for (let count = 0; offset < metadata.segmentEnd && count < 128; count++) {
        const { item } = await elementAt(s, offset, metadata.segmentEnd, operation, signal);
        if (item.id === 0x114d9b74)
          mergeSeek(
            await indexedElement(s, offset, item.id, limits.headerBytes, operation, signal)
          );
        if ([0x1654ae6b, 0x1549a966, 0x1c53bb6b].includes(item.id))
          metadata.positions[item.id] = offset;
        if (
          metadata.positions[0x1c53bb6b] !== undefined &&
          (metadata.tracks.length || metadata.positions[0x1654ae6b] !== undefined)
        )
          break;
        if (item.unknownSize) break;
        offset += item.totalSize;
      }
    }
    if (!metadata.tracks.length && metadata.positions[0x1654ae6b] !== undefined)
      metadata.tracks = demux.tracks(
        await indexedElement(
          s,
          metadata.positions[0x1654ae6b],
          0x1654ae6b,
          limits.headerBytes,
          operation,
          signal
        )
      );
    if (metadata.positions[0x1549a966] !== undefined && !metadata.infoParsed) {
      const info = await indexedElement(
        s,
        metadata.positions[0x1549a966],
        0x1549a966,
        4096,
        operation,
        signal
      );
      const root = demux.readElement(info, 0);
      const scale = demux.children(info, root).find((item) => item.id === 0x2ad7b1);
      metadata.timecodeScaleNs = demux.unsigned(info, scale) || 1000000;
    }
    if (metadata.positions[0x1c53bb6b] === undefined) throw fail("CUES_NOT_FOUND");
    const index =
      tailIndex ||
      (await indexedElement(
        s,
        metadata.positions[0x1c53bb6b],
        0x1c53bb6b,
        limits.indexBytes,
        operation,
        signal
      ));
    metadata.cues = demux.cues(index, metadata.timecodeScaleNs);
    if (
      !metadata.cues.length ||
      metadata.cues.some(
        (cue) =>
          !metadata.tracks.some((track) => track.number === cue.track) ||
          metadata.segmentDataStart + cue.clusterPosition >= metadata.segmentEnd
      )
    )
      throw fail("SUBTITLE_INDEX_UNAVAILABLE");
    metadata.clusterPositions = [...new Set(metadata.cues.map((cue) => cue.clusterPosition))].sort(
      (a, b) => a - b
    );
    return metadata;
  }
  async function discover(s) {
    const controller = new AbortController();
    s.metadataController = controller;
    const signal = controller.signal;
    const operation = budget("discovery");
    try {
      if (typeof TextDecoder !== "function" || typeof TextEncoder !== "function")
        throw fail("TEXT_DECODER_UNAVAILABLE");
      const head = await range(s, 0, limits.headerBytes, operation, signal);
      const metadata = await loadMetadata(s, head, operation, signal);
      metadata.tracks = metadata.tracks.filter(
        (track) =>
          track.type === 17 &&
          (["S_TEXT/UTF8", "S_TEXT/WEBVTT"].includes(track.codecId) ||
            textWindows.isAss(track.codecId)) &&
          !track.unsupportedTiming &&
          track.compression.type !== "unsupported" &&
          (track.compression.type !== "zlib" || typeof DecompressionStream === "function") &&
          Number.isSafeInteger(track.number) &&
          track.number > 0
      );
      if (!metadata.tracks.length) throw fail("SUBTITLE_INDEX_UNAVAILABLE");
      s.metadataBytes =
        metadata.cues.length * 128 +
        metadata.clusterPositions.length * 16 +
        metadata.tracks.reduce(
          (sum, track) =>
            sum +
            track.codecPrivate.length +
            track.compression.settings.length +
            (track.name.length + track.language.length + track.uid.length) * 2 +
            512,
          0
        );
      s.residentBytes = s.metadataBytes;
      own(s, 0);
      const verified = [];
      let lastError = "SUBTITLE_INDEX_UNAVAILABLE";
      for (const track of metadata.tracks) {
        try {
          const previousSize = track.codecPrivate.length;
          track.codecPrivate = (
            await decodePayload(
              s,
              track.codecPrivate,
              track.compression,
              2,
              64 * 1024,
              operation,
              signal
            )
          ).slice();
          s.metadataBytes += track.codecPrivate.length - previousSize;
          s.residentBytes = retainedBytes(s);
          own(s, 0);
          const cue = metadata.cues.find(
            (cue) => cue.track === track.number && cue.relativePosition !== null
          );
          if (cue) await readCue(s, track, cue, operation, signal);
          else {
            let found = false;
            const probeTimes = [Math.max(0, Number(s.probeTimeSeconds) || 0), 30, 90, 180, 300];
            const probePositions = [
              ...new Set(
                probeTimes.map((seconds) => {
                  let position = metadata.clusterPositions[0];
                  for (const cue of metadata.cues) {
                    if (cue.timeMs > seconds * 1000) break;
                    position = cue.clusterPosition;
                  }
                  return position;
                })
              )
            ];
            for (const position of probePositions) {
              const parsed = await scanCluster(s, position, operation, signal);
              if (parsed.errors.has(track.number)) throw fail(parsed.errors.get(track.number));
              if (
                parsed.frames.some((frame) => frame.track === track.number && frame.text.trim())
              ) {
                found = true;
                break;
              }
            }
            if (!found) throw fail("SUBTITLE_INDEX_UNAVAILABLE");
          }
          track.directIndexed =
            metadata.cues.some((cue) => cue.track === track.number) &&
            metadata.cues
              .filter((cue) => cue.track === track.number)
              .every((cue) => cue.relativePosition !== null);
          verified.push(track);
        } catch (error) {
          if (
            /BUDGET|TIMEOUT|SUPERSEDED/.test(error.code || "") ||
            [
              "AUTH_DENIED",
              "SOURCE_CHANGED",
              "RANGE_UNAVAILABLE",
              "TRANSPORT_UNAVAILABLE"
            ].includes(error.code)
          )
            throw error;
          lastError = error.code || "TEXT_DECODER_UNAVAILABLE";
        }
      }
      metadata.tracks = verified;
      if (!verified.length) throw fail(lastError);
      check(s, signal);
      s.accessVerified = true;
      s.errorCode = "";
      return metadata;
    } catch (error) {
      if (s === current) {
        s.errorCode = error.code || "DEMUX_UNAVAILABLE";
        s.retryAt = now() + (s.errorCode === "TRAFFIC_BUDGET" ? 60000 : 5000);
        s.metadata = null;
        s.parsedClusters.clear();
        s.metadataBytes = 0;
        s.residentBytes = 0;
      }
      throw error;
    } finally {
      if (s.metadataController === controller) s.metadataController = null;
    }
  }
  async function getTracks(url, { headers = {}, probeTimeSeconds = 0 } = {}) {
    const s = source(url, headers);
    s.probeTimeSeconds = probeTimeSeconds;
    if (!s.accessVerified) {
      if (s.retryAt > now()) return [];
      s.pending ||= discover(s).finally(() => {
        s.pending = null;
      });
      try {
        await s.pending;
      } catch (_) {
        return [];
      }
    }
    if (s !== current || !s.metadata) return [];
    return s.metadata.tracks.map((track, ordinal) => ({
      type: "text",
      id: track.number,
      codecId: track.codecId,
      codec: track.codecId,
      name: track.name,
      language: track.language,
      forced: track.forced,
      trackOrdinal: ordinal,
      nativeTrackIndex: -1,
      embeddedTextProvider: "vidaa-range",
      sourceIdentity: s.identity,
      containerTrackUid: track.uid,
      textAccessVerified: true
    }));
  }
  async function scanWindow(s, track, start, end, operation, signal) {
    const metadata = s.metadata;
    const preceding = metadata.cues.filter((cue) => cue.timeMs <= Math.max(0, start - 30) * 1000);
    const overlaps = metadata.cues.filter(
      (cue) =>
        cue.track === track.number &&
        cue.durationMs > 0 &&
        cue.timeMs < start * 1000 &&
        cue.timeMs + cue.durationMs > start * 1000
    );
    let position = preceding.length
      ? preceding[preceding.length - 1].clusterPosition
      : metadata.clusterPositions[0];
    if (overlaps.length)
      position = Math.min(position, ...overlaps.map((cue) => cue.clusterPosition));
    let offset = metadata.segmentDataStart + position;
    const frames = [];
    let frameBytes = 0;
    let previousTimestamp = -1;
    for (let count = 0; offset < metadata.segmentEnd; count++) {
      if (count >= 256) throw fail("WINDOW_CLUSTER_LIMIT");
      const { item } = await elementAt(s, offset, metadata.segmentEnd, operation, signal);
      if (item.id !== 0x1f43b675) {
        if (item.unknownSize) throw fail("INVALID_CLUSTER");
        offset += item.totalSize;
        continue;
      }
      const position = offset - metadata.segmentDataStart;
      const known = s.parsedClusters.get(position);
      const info = known || (await clusterHeader(s, position, operation, signal));
      if (info.milliseconds < previousTimestamp) throw fail("CLUSTER_TIMESTAMP_ORDER");
      previousTimestamp = info.milliseconds;
      // Cluster timestamps order is verified before claiming an empty window.
      if (info.milliseconds >= end * 1000 + (32768 * metadata.timecodeScaleNs) / 1000000) break;
      const parsed = await scanCluster(s, position, operation, signal);
      if (parsed.errors.has(track.number)) throw fail(parsed.errors.get(track.number));
      for (const frame of parsed.frames) {
        if (
          frame.track === track.number &&
          frame.end > start &&
          frame.start < end &&
          frame.text.trim()
        ) {
          if (frames.length >= limits.windowCues) throw fail("WINDOW_CUE_BUDGET");
          own(s, retainedFrameBytes(frame));
          frameBytes += retainedFrameBytes(frame);
          frames.push(frame);
          operation.frameBytes = frameBytes;
          s.residentBytes = retainedBytes(s) + frameBytes;
        }
      }
      if (parsed.nextOffset <= offset) throw fail("INVALID_CLUSTER");
      offset = parsed.nextOffset;
      // Include a following Cluster for legal negative Block timestamps. A
      // sparse index may omit intermediate Clusters: follow actual EBML ends.
    }
    return frames;
  }
  async function getWindow({
    url,
    trackNumber,
    sourceIdentity,
    startSeconds,
    endSeconds,
    headers = {}
  }) {
    const s = source(url, headers);
    if (!s.accessVerified || sourceIdentity !== s.identity) throw fail("SOURCE_UNVERIFIED");
    const track = s.metadata.tracks.find((entry) => entry.number === trackNumber);
    if (!track) throw fail("TRACK_NOT_FOUND");
    const start = Math.max(0, Number(startSeconds));
    const requestedEnd = Number(endSeconds);
    const end = track.directIndexed ? requestedEnd : Math.min(requestedEnd, start + 30);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(requestedEnd) ||
      requestedEnd <= start ||
      requestedEnd - start > 180
    )
      throw fail("INVALID_WINDOW");
    const key = `${trackNumber}:${start}:${end}`;
    cancelWindow();
    const cached = s.cache.get(key);
    if (cached) {
      check(s, new AbortController().signal);
      return { ...cached };
    }
    const controller = new AbortController();
    s.windowController = controller;
    const operation = budget("window");
    s.residentBytes = retainedBytes(s);
    try {
      const allCues = s.metadata.cues.filter((cue) => cue.track === trackNumber);
      const selected = allCues.filter((cue) => {
        return (
          cue.timeMs < end * 1000 &&
          (cue.durationMs > 0
            ? cue.timeMs + cue.durationMs > start * 1000
            : cue.timeMs >= (start - 30) * 1000)
        );
      });
      if (selected.length > limits.windowCues) throw fail("WINDOW_CUE_BUDGET");
      const frames = track.directIndexed
        ? []
        : await scanWindow(s, track, start, end, operation, controller.signal);
      let frameBytes = 0;
      for (const cue of track.directIndexed ? selected : []) {
        const decoded = await readCue(s, track, cue, operation, controller.signal);
        check(s, controller.signal);
        for (const frame of decoded)
          if (frame.end > start && frame.start < end && frame.text.trim()) {
            if (frames.length >= limits.windowCues) throw fail("WINDOW_CUE_BUDGET");
            frameBytes += retainedFrameBytes(frame);
            own(s, retainedFrameBytes(frame));
            frames.push(frame);
            s.residentBytes = retainedBytes(s) + frameBytes;
          }
      }
      frames.sort((a, b) => a.start - b.start);
      own(
        s,
        limits.windowBodyBytes * 6 +
          frames.reduce((sum, frame) => sum + retainedFrameBytes(frame), 0)
      );
      const result = textWindows.buildWindow(track, frames, start, end, limits.windowBodyBytes);
      if (
        encoder().encode(result.body).length + encoder().encode(result.assBody).length >
        limits.windowBodyBytes
      )
        throw fail("TEXT_WINDOW_TOO_LARGE");
      check(s, controller.signal);
      while (s.cache.size >= 2) s.cache.delete(s.cache.keys().next().value);
      s.residentBytes = retainedBytes(s);
      own(s, bodyBytes(result) * 2);
      s.cache.set(key, result);
      s.residentBytes = retainedBytes(s);
      s.errorCode = "";
      return { ...result };
    } catch (error) {
      if (s === current && error.code !== "REQUEST_SUPERSEDED")
        s.errorCode = error.code || "DEMUX_UNAVAILABLE";
      throw error;
    } finally {
      if (s.windowController === controller) {
        s.windowController = null;
        s.residentBytes = retainedBytes(s);
      }
    }
  }
  function diagnostics() {
    if (!current) return { active: false, limits };
    const {
      identity,
      requests,
      requestedBytes,
      receivedBytes,
      residentBytes,
      peakResidentBytes,
      errorCode,
      accessVerified
    } = current;
    return {
      active: true,
      identity,
      requests,
      requestedBytes,
      receivedBytes,
      residentBytes,
      peakResidentBytes,
      errorCode,
      accessVerified,
      limits
    };
  }
  return { getTracks, getWindow, cancelWindow, dispose, diagnostics };
}

export const vidaaEmbeddedTextProvider = createVidaaEmbeddedTextProvider();
