// Matroska subtitle packets use container timestamps, never textual time guesses.
const { error } = require("./matroskaTextDemux.cjs");
const isAss = (codec) => ["S_TEXT/ASS", "S_TEXT/SSA", "S_ASS", "S_SSA"].includes(codec);
const stamp = (seconds, ass = false) => {
  const units = Math.round(Math.max(0, seconds) * (ass ? 100 : 1000));
  const base = ass ? 100 : 1000;
  return `${ass ? Math.floor(units / (3600 * base)) : String(Math.floor(units / (3600 * base))).padStart(2, "0")}:${String(Math.floor(units / (60 * base)) % 60).padStart(2, "0")}:${String(Math.floor(units / base) % 60).padStart(2, "0")}.${String(units % base).padStart(ass ? 2 : 3, "0")}`;
};
function packet(frame) {
  // ReadOrder, Layer, Style, Name, MarginL/R/V, Effect, Text; commas in Text stay.
  const fields = frame.text.split(",");
  if (
    fields.length < 9 ||
    !/^\d+$/.test(fields[0]) ||
    !/^[+-]?\d*$/.test(fields[1]) ||
    fields.slice(4, 7).some((field) => !/^\d*$/.test(field))
  )
    throw error("INVALID_ASS_PACKET");
  return {
    order: Number(fields[0]),
    fields: [
      fields[1] || "0",
      fields[2] || "Default",
      fields[3],
      ...fields.slice(4, 7).map((value) => value || "0"),
      fields[7]
    ],
    text: fields.slice(8).join(",")
  };
}
function assHeader(bytes) {
  let body = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .replace(/^\uFEFF/, "")
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n");
  if (!/\[Script Info\]/i.test(body))
    body = "[Script Info]\nScriptType: v4.00+\nPlayResX: 384\nPlayResY: 288\n";
  if (!/\[V4\+? Styles\]/i.test(body))
    body +=
      "\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n";
  // CodecPrivate supplies styles/resolution. Drop source event rows; rebuild only
  // the current window so a malformed header cannot add unrelated timed cues.
  let inEvents = false;
  body = body
    .split("\n")
    .filter((line) => {
      if (/^\s*\[.*\]\s*$/.test(line)) inEvents = /^\s*\[Events\]\s*$/i.test(line);
      return !(inEvents && /^\s*(?:Dialogue|Comment|Format)\s*:/i.test(line));
    })
    .join("\n");
  // Keep Events last, including if an unusual CodecPrivate has sections after it.
  body = body.replace(/^\s*\[Events\]\s*$/gim, "");
  return (
    body.trimEnd() +
    "\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
  );
}
function plainAss(text) {
  // Drawing commands are graphics, not dialogue; never leak their coordinates.
  let drawing = false;
  return text
    .split(/(\{[^}]*\})/)
    .map((part) => {
      if (part[0] === "{") {
        const mode = /\\p(\d+)/.exec(part);
        if (mode) drawing = Number(mode[1]) > 0;
        return "";
      }
      return drawing ? "" : part;
    })
    .join("")
    .replace(/\\[Nn]/g, "\n")
    .replace(/\\h/g, "\u00a0");
}
function buildWindow(track, frames, start, end, maxChars = 128 * 1024) {
  let body = "WEBVTT\n\n";
  const ass = isAss(track.codecId);
  const events = [];
  let eventChars = 0;
  for (const frame of frames) {
    const event = ass ? packet(frame) : null;
    const plain = (event ? plainAss(event.text) : frame.text)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(?:b|i|u|s|font)(?:\s[^<>]*)?>/gi, "");
    const entities = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      "#39": "'",
      nbsp: "\u00a0"
    };
    const text = plain
      .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name) => entities[name])
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\r\n?/g, "\n")
      .replace(/\n{2,}/g, "\n");
    const settings = String(frame.settings || "")
      .split(/\s+/)
      .filter((value) =>
        /^(?:(?:line|position|size):\d+(?:\.\d+)?%|align:(?:start|end|left|right|center))$/.test(
          value
        )
      )
      .join(" ");
    const row = text.trim()
      ? `${stamp(frame.start)} --> ${stamp(frame.end)}${settings ? " " + settings : ""}\n${text}\n\n`
      : "";
    const line = event
      ? `Dialogue: ${event.fields[0]},${stamp(frame.start, true)},${stamp(frame.end, true)},${event.fields.slice(1).join(",")},${event.text.replace(/\r?\n/g, "\\N")}`
      : "";
    if (body.length + row.length + eventChars + line.length > maxChars)
      throw error("TEXT_WINDOW_TOO_LARGE");
    body += row;
    if (event) {
      events.push({ order: event.order, line });
      eventChars += line.length;
    }
  }
  const assBody =
    ass && events.length
      ? assHeader(track.codecPrivate) +
        events
          .sort((a, b) => a.order - b.order)
          .map((event) => event.line)
          .join("\n") +
        "\n"
      : "";
  if (body.length + assBody.length > maxChars) throw error("TEXT_WINDOW_TOO_LARGE");
  return {
    format: "vtt",
    body,
    assBody,
    cueCount: frames.length,
    trackNumber: track.number,
    codecId: track.codecId,
    language: track.language,
    name: track.name,
    windowStartSeconds: start,
    windowEndSeconds: end,
    contextStartSeconds: start
  };
}
module.exports = { isAss, packet, buildWindow };
