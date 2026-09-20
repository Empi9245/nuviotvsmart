/* eslint-disable no-unused-vars */

import { getSubtitleAssAlignment, getSubtitleAssAlignmentSettings } from "./subtitleCueLayout.js";

import {
  normalizeBody,
  getAssPlayRes,
  getAssStyleFontSizes,
  getAssBaseFontSize,
  isAssEventFormat,
  inferHeaderlessAssFormat,
  parseAssTimestamp,
  sanitizeAssDialogueText,
  formatVttTimestamp
} from "./assSubtitleHelpers-01-ass-content-types.js";
import { getAssCueLayout, getAssCueFontSize, assSizeToVttPercent, getAssMoveTrack } from "./assSubtitleHelpers-02-ass-xto-vtt-position.js";

export function convertAssDialogueToVttCues(body) {
  const normalized = normalizeBody(body);
  const playRes = getAssPlayRes(normalized);
  const styleFontSizes = getAssStyleFontSizes(normalized);
  const baseFontSize = getAssBaseFontSize(styleFontSizes);
  let formatFields = null;
  const cues = [];
  normalized.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (/^Format\s*:/i.test(trimmed)) {
      const section = trimmed.slice(trimmed.indexOf(":") + 1);
      const candidateFields = section.split(",").map((field) => field.trim().toLowerCase());
      // ASS style sections also contain a `Format:` line. Keep only an event
      // format here so a headerless body can still be inferred safely.
      if (isAssEventFormat(candidateFields)) {
        formatFields = candidateFields;
      }
      return;
    }
    if (!/^Dialogue\s*:/i.test(trimmed)) {
      return;
    }
    let rest = trimmed.slice(trimmed.indexOf(":") + 1);
    const eventFormatFields = formatFields || inferHeaderlessAssFormat(rest);
    if (!eventFormatFields) {
      return;
    }
    const values = [];
    const textIndex = eventFormatFields.indexOf("text");
    const headCount = textIndex >= 0 ? textIndex : eventFormatFields.length;
    for (let index = 0; index < headCount; index += 1) {
      const commaIndex = rest.indexOf(",");
      if (commaIndex < 0) {
        return;
      }
      values.push(rest.slice(0, commaIndex));
      rest = rest.slice(commaIndex + 1);
    }
    values.push(rest);
    const record = {};
    eventFormatFields.forEach((field, index) => {
      record[field] = values[index];
    });
    const start = parseAssTimestamp(record.start);
    const end = parseAssTimestamp(record.end);
    const text = sanitizeAssDialogueText(record.text);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
      return;
    }
    const rawText = String(record.text || "");
    const layout = getAssCueLayout(rawText, playRes);
    let sizePercent = null;
    if (layout) {
      const fontSize = getAssCueFontSize(record.style, record.text, styleFontSizes);
      sizePercent = assSizeToVttPercent(fontSize, baseFontSize);
    }
    // A \move with real travel becomes stepped slices that track the motion;
    // everything else stays a single cue.
    const moveTrack = layout && !getSubtitleAssAlignment(rawText) ? getAssMoveTrack(rawText, start, end, playRes) : null;
    if (!moveTrack) {
      const cue = layout
        ? {
            start,
            end,
            text,
            line: layout.line,
            position: layout.position,
            align: layout.align
          }
        : { start, end, text };
      if (sizePercent != null && sizePercent < 100) {
        cue.size = sizePercent;
      }
      cues.push(cue);
      return;
    }
    for (const slice of moveTrack.slices) {
      if (!slice || slice.line == null || slice.position == null || !(slice.end > slice.start)) {
        continue;
      }
      const cue = {
        start: slice.start,
        end: slice.end,
        text,
        line: slice.line,
        position: slice.position,
        align: "center"
      };
      if (sizePercent != null && sizePercent < 100) {
        cue.size = sizePercent;
      }
      cues.push(cue);
    }
  });
  return cues.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function buildVttFromAssCues(cues) {
  if (!Array.isArray(cues) || !cues.length) {
    return "";
  }
  const blocks = cues.map((cue) => {
    const rawLine = cue.line;
    const line = rawLine == null ? NaN : Number(rawLine);
    const align = String(cue.align || "");
    const rawPos = cue.position;
    const pos = rawPos == null ? NaN : Number(rawPos);
    const parts = [];
    if (Number.isFinite(line)) {
      parts.push(`line:${line}%`);
    }
    if (Number.isFinite(pos)) {
      parts.push(`position:${Math.round(pos)}%`);
    }
    if (["start", "end", "center"].indexOf(align) >= 0) {
      parts.push(`align:${align}`);
    }
    const rawSize = cue.size;
    const size = rawSize == null ? NaN : Number(rawSize);
    if (Number.isFinite(size) && size > 0 && size < 100 && Number.isFinite(line)) {
      parts.push(`size:${Math.round(size)}%`);
    }
    const settings = parts.length ? ` ${parts.join(" ")}` : "";
    return `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}${settings}\n${cue.text}`;
  });
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

export function convertAssBodyToVtt(body) {
  return buildVttFromAssCues(convertAssDialogueToVttCues(body));
}
