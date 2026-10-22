// Per-stream audio delay contract, ported from the Android app
// (NuvioMedia/NuvioTV PR #3781: behaviorHints.audioDelayMs, PR #4027:
// behaviorHints.audioDelayLanguage).
//
// Addons/plugins such as PriSynx DualSync build an HLS master that combines a
// video source with a separate dubbed audio source. Their measurement service
// computes the fixed offset between the two timelines and ships it as
// behaviorHints.audioDelayMs (integer milliseconds, signed). audioDelayLanguage
// scopes the offset to the tracks that come from the audio source, so the
// video's original audio keeps playing in sync.
//
// Semantics (matching Android):
// - positive audioDelayMs = the scoped audio plays LATER (mpv/ExoPlayer "audio
//   delay" convention);
// - the hint is never persisted and never overwrites the user's device delay;
// - clamp to the same +-60 s range the Android player uses;
// - without audioDelayLanguage the delay applies to the selected audio track.

export const STREAM_AUDIO_DELAY_LIMIT_MS = 60000;
export const STREAM_AUDIO_DELAY_STEP_MS = 50;

// Android's language normalization: it/ita/italian, es/spa/espanol... match;
// es-419 stays distinct from es (PR #4027).
const LANGUAGE_ALIASES = {
  it: "it",
  ita: "it",
  ital: "it",
  italian: "it",
  italiano: "it",
  en: "en",
  eng: "en",
  english: "en",
  es: "es",
  spa: "es",
  esp: "es",
  espanol: "es",
  spanish: "es",
  fr: "fr",
  fre: "fr",
  fra: "fr",
  french: "fr",
  de: "de",
  ger: "de",
  deu: "de",
  deutsch: "de",
  german: "de",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  ja: "ja",
  jpn: "ja",
  japanese: "ja",
  ko: "ko",
  kor: "ko",
  korean: "ko",
  zh: "zh",
  chi: "zh",
  zho: "zh",
  chinese: "zh"
};

export function normalizeAudioDelayLanguage(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!raw) return "";
  const [base, region = ""] = raw.split("-");
  const normalizedBase = LANGUAGE_ALIASES[base] || base;
  const normalizedRegion = region.toUpperCase();
  return normalizedRegion ? `${normalizedBase}-${normalizedRegion}` : normalizedBase;
}

export function clampStreamAudioDelayMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round(numeric);
  return Math.max(-STREAM_AUDIO_DELAY_LIMIT_MS, Math.min(STREAM_AUDIO_DELAY_LIMIT_MS, rounded));
}

// Extract the two optional hint fields from a stream's behaviorHints. Returns
// null when the stream declares no usable delay, so callers can skip work.
export function readStreamAudioDelayHints(behaviorHints) {
  const hints = behaviorHints && typeof behaviorHints === "object" ? behaviorHints : null;
  if (!hints || hints.audioDelayMs == null) return null;
  const audioDelayMs = Number(hints.audioDelayMs);
  if (!Number.isFinite(audioDelayMs)) return null;
  return {
    audioDelayMs: clampStreamAudioDelayMs(audioDelayMs),
    audioDelayLanguage: normalizeAudioDelayLanguage(hints.audioDelayLanguage)
  };
}

// Delay to apply for the currently selected audio track (Android
// StreamDelayScope.appliesToAudio). Without audioDelayLanguage the stream delay
// applies to every track (#3781); with it the delay only applies while the
// selected track matches that language (#4027), so the original audio stays
// untouched. While the tracks are still loading the delay is kept, so the
// default dubbed track starts in sync.
export function resolveStreamAudioDelayMs(
  hints,
  selectedAudioLanguage = "",
  { hasSelectedAudio = true } = {}
) {
  const streamDelay = readStreamAudioDelayHints(hints);
  if (!streamDelay || streamDelay.audioDelayMs === 0) return 0;
  if (!streamDelay.audioDelayLanguage) return streamDelay.audioDelayMs;
  if (!hasSelectedAudio) return streamDelay.audioDelayMs;
  const selected = normalizeAudioDelayLanguage(selectedAudioLanguage);
  return selected === streamDelay.audioDelayLanguage ? streamDelay.audioDelayMs : 0;
}

// Embedded subtitle tracks coming from the audio source share its timeline, so
// they receive the same content offset (Android
// StreamDelayScope.appliesToSubtitle). Addon/external subtitles are never
// shifted: pass their origin to reject them. Without audioDelayLanguage
// nothing identifies which subtitles come from the audio source, so nothing is
// shifted.
export function resolveStreamSubtitleOffsetMs(
  hints,
  subtitleLanguage = "",
  { embedded = true } = {}
) {
  const streamDelay = readStreamAudioDelayHints(hints);
  if (!streamDelay || streamDelay.audioDelayMs === 0) return 0;
  if (!streamDelay.audioDelayLanguage) return 0;
  if (!embedded) return 0;
  const language = normalizeAudioDelayLanguage(subtitleLanguage);
  return language === streamDelay.audioDelayLanguage ? streamDelay.audioDelayMs : 0;
}

// Delay the player must apply to one subtitle output: the user's own subtitle
// delay plus the stream source offset for embedded tracks in the scoped
// language. The stream part is never persisted (Android keeps it in
// streamSubtitleDelayUs, apart from the user's subtitleDelayUs).
export function resolveEffectiveSubtitleDelayMs(
  userDelayMs,
  hints,
  subtitleLanguage = "",
  { embedded = true } = {}
) {
  return (
    Math.round(Number(userDelayMs) || 0) +
    resolveStreamSubtitleOffsetMs(hints, subtitleLanguage, { embedded })
  );
}
