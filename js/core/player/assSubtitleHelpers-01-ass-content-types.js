/* eslint-disable no-unused-vars */

import { getSubtitleAssAlignment, getSubtitleAssAlignmentSettings } from "./subtitleCueLayout.js";

export const ASS_CONTENT_TYPES = ["text/x-ssa", "application/x-ssa", "text/x-ass", "application/x-ass"];

export const ASS_SECTION_HEADERS = ["[Script Info]", "[V4+ Styles]", "[V4+ Styles+]", "[V4 Styles]", "[V4 Styles+]", "[Events]"];

export function normalizeBody(body) {
  return String(body || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
}

export function looksLikeSrtOrVtt(normalized) {
  return /^\s*WEBVTT/i.test(normalized) || /^\s*\d+\s*\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/m.test(normalized);
}

export function hasAssSectionHeaders(normalized) {
  const head = normalized.slice(0, 4096);
  // Headers must be alone on their line; incidental bracketed prose such
  // as "[Events] tonight" inside subtitle dialogue must not match.
  return ASS_SECTION_HEADERS.some((header) => new RegExp(`^${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(head));
}

export function hasAssDialogueEvents(normalized) {
  return /^\s*Dialogue\s*:/im.test(normalized) && /^\s*Format\s*:/im.test(normalized);
}

export function hasAssTimestampedDialogue(normalized) {
  return /^\s*Dialogue\s*:\s*(?:(?:\d+|Marked\s*=\s*\d+)\s*,)?\s*\d+:\d{1,2}:\d{1,2}[.,]\d{1,3}\s*,\s*\d+:\d{1,2}:\d{1,2}[.,]\d{1,3}/im.test(
    normalized
  );
}

export function isAssSubtitle(body, { sourceUrl = "", contentType = "" } = {}) {
  const normalized = normalizeBody(body);
  if (!normalized.trim()) {
    return false;
  }
  const fromMetadata =
    /\.(ass|ssa)(\?|#|$)/i.test(String(sourceUrl || "")) ||
    ASS_CONTENT_TYPES.some((type) =>
      String(contentType || "")
        .toLowerCase()
        .includes(type)
    );
  // Prefer an unambiguous body signature over a stale or incorrect URL/MIME
  // hint. This matches Android's body-first sniffing and keeps a VTT/SRT
  // response usable even when an addon labels the download as `.ass`.
  if (looksLikeSrtOrVtt(normalized)) {
    return false;
  }
  if (fromMetadata) {
    return true;
  }
  if (hasAssSectionHeaders(normalized) && hasAssDialogueEvents(normalized)) {
    return true;
  }
  // Some proxy/AVPlay paths strip ASS section headers but preserve event rows.
  // Require actual ASS timing on headerless bodies so non-ASS text that merely
  // mentions "Dialogue:" is not routed away from the plain-text path.
  return hasAssTimestampedDialogue(normalized);
}

export const DEFAULT_ASS_DIALOGUE_FORMAT = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];

export function isAssEventFormat(fields) {
  return fields.includes("start") && fields.includes("end") && fields.includes("text");
}

export function inferHeaderlessAssFormat(rest) {
  const fields = String(rest || "").split(",");
  if (Number.isFinite(parseAssTimestamp(fields[0])) && Number.isFinite(parseAssTimestamp(fields[1]))) {
    return ["start", "end", "text"];
  }
  if (
    /^(?:\d+|Marked\s*=\s*\d+)$/i.test(String(fields[0] || "").trim()) &&
    Number.isFinite(parseAssTimestamp(fields[1])) &&
    Number.isFinite(parseAssTimestamp(fields[2]))
  ) {
    return DEFAULT_ASS_DIALOGUE_FORMAT;
  }
  return null;
}

export function parseAssTimestamp(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d+):(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!match) {
    return NaN;
  }
  const milliseconds = Number(String(match[4] || "0").padEnd(3, "0"));
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + milliseconds / 1000;
}

export function formatVttTimestamp(totalSeconds) {
  const total = Math.max(0, totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const milliseconds = Math.round((total - Math.floor(total)) * 1000) % 1000;
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}

export function sanitizeAssDialogueText(text) {
  const source = String(text || "");
  let drawing = false;
  let output = "";
  let offset = 0;
  const blocks = /\{([^}]*)\}/g;
  let match;
  while ((match = blocks.exec(source))) {
    if (!drawing) {
      output += source.slice(offset, match.index);
    }
    const block = match[1];
    let depth = 0;
    for (let index = 0; index < block.length; index += 1) {
      const character = block[index];
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth = Math.max(0, depth - 1);
      } else if (character === "\\" && depth === 0) {
        const tag = block.slice(index + 1);
        const mode = /^p(-?\d+)(?=\\|\s|$)/.exec(tag);
        if (mode) {
          drawing = Number(mode[1]) > 0;
        } else if (tag[0] === "r") {
          drawing = false;
        }
      }
    }
    offset = blocks.lastIndex;
  }
  if (!drawing) {
    output += source.slice(offset);
  }
  return output
    .replace(/\\[Nn]/g, "\n")
    .replace(/\\h/g, " ")
    .trim();
}

export const ASS_POSITION_RE = /\\pos\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i;

export const ASS_MOVE_RE =
  /\\move\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?))?\s*\)/i;

export const ASS_FONT_SIZE_RE = /\\fs(\d+(?:\.\d+)?)/i;

export function getAssPlayRes(normalized) {
  const width = normalized.match(/^\s*PlayResX\s*:\s*(\d+(?:\.\d+)?)\s*$/im);
  const height = normalized.match(/^\s*PlayResY\s*:\s*(\d+(?:\.\d+)?)\s*$/im);
  return {
    x: width ? Number(width[1]) : 0,
    y: height ? Number(height[1]) : 0
  };
}

export function getAssStyleFontSizes(normalized) {
  const sizes = {};
  let fields = null;
  normalized.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (/^\[V4\+?\sStyles/i.test(trimmed) || /^\[V4\sStyles/i.test(trimmed)) {
      return;
    }
    if (/^Format\s*:/i.test(trimmed) && !fields && /^\s*Name\b/i.test(trimmed.slice(trimmed.indexOf(":") + 1))) {
      fields = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .split(",")
        .map((field) => field.trim().toLowerCase());
      return;
    }
    if (!/^Style\s*:/i.test(trimmed) || !fields) {
      return;
    }
    const values = trimmed.slice(trimmed.indexOf(":") + 1).split(",");
    const record = {};
    fields.forEach((field, index) => {
      record[field] = index < fields.length - 1 ? (values[index] || "").trim() : values.slice(index).join(",").trim();
    });
    const name = String(record.name || "").trim();
    const size = Number(record.fontsize);
    if (name && Number.isFinite(size) && size > 0) {
      sizes[name.toLowerCase()] = size;
    }
  });
  return sizes;
}

export function getAssBaseFontSize(styleFontSizes) {
  const preferred = ["main", "default"];
  let best = 0;
  let fallbackBest = 0;
  Object.keys(styleFontSizes).forEach((name) => {
    const size = styleFontSizes[name];
    if (size > fallbackBest) {
      fallbackBest = size;
    }
    if (preferred.indexOf(name) >= 0 && size > best) {
      best = size;
    }
  });
  return best > 0 ? best : fallbackBest;
}

export function assYToVttLine(y, playResY) {
  const raw = Number(y);
  const scale = Number(playResY);
  if (!Number.isFinite(raw) || !Number.isFinite(scale) || scale <= 0) {
    return null;
  }
  // -20..120 instead of 5..95: \move endpoints often sit off-screen, and
  // clamping would flatten the travel of a stepping fallback.
  return Math.round(Math.min(120, Math.max(-20, (raw / scale) * 100)));
}
