/* eslint-disable no-unused-vars */

import { getSubtitleAssAlignment, getSubtitleAssAlignmentSettings } from "./subtitleCueLayout.js";

import { ASS_MOVE_RE, assYToVttLine, ASS_POSITION_RE, ASS_FONT_SIZE_RE } from "./assSubtitleHelpers-01-ass-content-types.js";

export function assXToVttPosition(x, playResX) {
  const raw = Number(x);
  const scale = Number(playResX);
  if (!Number.isFinite(raw) || !Number.isFinite(scale) || scale <= 0) {
    return null;
  }
  return Math.round(Math.min(95, Math.max(5, (raw / scale) * 100)));
}

export function getAssMoveTrack(rawText, start, end, playRes) {
  const match = String(rawText || "").match(ASS_MOVE_RE);
  if (!match || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = Number(match[3]);
  const y2 = Number(match[4]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) {
    return null;
  }
  const durationMs = Math.max(0, (end - start) * 1000);
  const requestedStartMs = match[5] == null ? 0 : Number(match[5]);
  const requestedEndMs = match[6] == null ? durationMs : Number(match[6]);
  if (!Number.isFinite(requestedStartMs) || !Number.isFinite(requestedEndMs) || requestedEndMs <= requestedStartMs) {
    return null;
  }
  // ASS move offsets are relative to the dialogue. Clamp malformed or
  // producer-rounded offsets to the cue so the fallback never emits cues
  // outside the original timing window.
  const moveStartMs = clampNumber(requestedStartMs, 0, durationMs);
  const moveEndMs = clampNumber(requestedEndMs, 0, durationMs);
  if (moveEndMs <= moveStartMs) {
    return null;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.sqrt(dx * dx + dy * dy) < 24) {
    return null;
  }
  const moveStart = start + moveStartMs / 1000;
  const moveEnd = start + moveEndMs / 1000;
  const slices = [];
  const appendSlice = (sliceStart, sliceEnd, x, y) => {
    if (!(sliceEnd > sliceStart)) {
      return;
    }
    const line = assYToVttLine(y, playRes.y);
    const position = assXToVttPosition(x, playRes.x);
    if (line == null || position == null) {
      return;
    }
    const previous = slices[slices.length - 1];
    if (previous && previous.line === line && previous.position === position && Math.abs(previous.end - sliceStart) < 0.001) {
      previous.end = sliceEnd;
      return;
    }
    slices.push({ start: sliceStart, end: sliceEnd, line, position });
  };
  appendSlice(start, moveStart, x1, y1);
  // A slice every roughly 60ms keeps the timer-driven fallback close to the
  // source motion without producing an unbounded number of VTT cues.
  const steps = Math.max(2, Math.min(96, Math.ceil(((moveEnd - moveStart) * 1000) / 60)));
  for (let index = 0; index < steps; index += 1) {
    const from = index / steps;
    const to = (index + 1) / steps;
    const sliceStart = moveStart + (moveEnd - moveStart) * from;
    const sliceEnd = moveStart + (moveEnd - moveStart) * to;
    const cx = x1 + dx * to;
    const cy = y1 + dy * to;
    appendSlice(sliceStart, sliceEnd, cx, cy);
  }
  appendSlice(moveEnd, end, x2, y2);
  if (slices.length < 2) {
    return null;
  }
  return { slices };
}

export function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

export function getAssCueLayout(rawText, playRes) {
  const raw = String(rawText || "");
  const settings = getSubtitleAssAlignmentSettings(getSubtitleAssAlignment(raw));
  const posMatch = raw.match(ASS_POSITION_RE);
  if (settings) {
    // \an wins for line/align, but a co-present \pos still refines the
    // horizontal position instead of discarding it.
    const position = posMatch ? assXToVttPosition(posMatch[1], playRes.x) : null;
    return { line: settings.line, align: settings.align, position };
  }
  if (posMatch) {
    const line = assYToVttLine(posMatch[2], playRes.y);
    const position = assXToVttPosition(posMatch[1], playRes.x);
    if (line == null || position == null) {
      return null;
    }
    return { line, position, align: "center" };
  }
  const moveMatch = raw.match(ASS_MOVE_RE);
  if (moveMatch) {
    const line = assYToVttLine(moveMatch[4], playRes.y);
    const position = assXToVttPosition(moveMatch[3], playRes.x);
    if (line == null || position == null) {
      return null;
    }
    return { line, position, align: "center" };
  }
  return null;
}

export function getAssCueFontSize(styleName, rawText, styleFontSizes) {
  const inlineMatch = String(rawText || "").match(ASS_FONT_SIZE_RE);
  if (inlineMatch) {
    const inline = Number(inlineMatch[1]);
    if (Number.isFinite(inline) && inline > 0) {
      return inline;
    }
  }
  return (
    styleFontSizes[
      String(styleName || "")
        .trim()
        .toLowerCase()
    ] || null
  );
}

export function assSizeToVttPercent(fontSize, baseFontSize) {
  const size = Number(fontSize);
  const base = Number(baseFontSize);
  if (!Number.isFinite(size) || !Number.isFinite(base) || size <= 0 || base <= 0) {
    return null;
  }
  return Math.round(((size / base) * 100) / 5) * 5;
}
