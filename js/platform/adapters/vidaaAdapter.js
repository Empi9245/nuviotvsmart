import { isBackEvent, normalizeKeyEvent } from "../sharedKeys.js";
import {
  installVidaaKeyboardFix,
  isVidaaTextInputEditingActive,
  shouldPreserveVidaaTextInputKey,
  handleVidaaTextInputKey,
  getVidaaTextInputKeyCode
} from "../vidaa/vidaaKeyboard.js";

// Preserve the optional HTTP-domain compatibility call without registering
// unrelated services at startup. A completed call does not prove TV permission.
export function registerVidaaHttpMediaDomain(url, root = globalThis) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" || typeof root.Hisense_AddInsecureDomain !== "function") {
      return;
    }
    root.Hisense_AddInsecureDomain(parsed.hostname);
  } catch (_) {
    // Missing permissions or unsupported firmware must not abort playback.
  }
}

// Match the installed TV app canvas; navigation scrolls inside each screen.
function applyVidaaViewport() {
  const documentRef = globalThis.document;
  if (!documentRef?.head) return;

  let viewport = documentRef.querySelector("meta[name='viewport']");
  if (!viewport) {
    viewport = documentRef.createElement("meta");
    viewport.name = "viewport";
    documentRef.head.appendChild(viewport);
  }

  viewport.setAttribute(
    "content",
    "width=1920, height=1080, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  );
  documentRef.documentElement?.classList?.add("vidaa-tv");
  documentRef.body?.classList?.add("vidaa-tv");

  try {
    globalThis.dispatchEvent?.(new Event("resize"));
  } catch (_) {
    // Ignore resize dispatch failure
  }
}

// VIDAA's official WebApp mapping is VK_BACK_SPACE = 8. The remaining
// values are compatibility fallbacks seen in hosted-browser/TV firmware paths
// and are intentionally kept so Back remains usable outside a packaged app.
const VIDAA_BACK_CODES = [8, 461, 10009, 27];

export const vidaaAdapter = {
  name: "vidaa",
  nativeTextInput: true,
  isNativeTextInputEditingActive: isVidaaTextInputEditingActive,
  shouldPreserveTextInputKey: shouldPreserveVidaaTextInputKey,
  handleTextInputKey: handleVidaaTextInputKey,

  init() {
    applyVidaaViewport();
    installVidaaKeyboardFix();
  },

  exitApp() {
    try {
      if (typeof globalThis.Hisense_Exit === "function") {
        globalThis.Hisense_Exit();
        return;
      }
    } catch (_) {}
    try {
      if (typeof globalThis.Hisense_CloseApp === "function") {
        globalThis.Hisense_CloseApp();
        return;
      }
    } catch (_) {}
    try {
      globalThis.close?.();
    } catch (_) {}
  },

  isBackEvent(event) {
    const code = Number(event?.keyCode || event?.which || 0);
    if (code === 8 || event?.key === "Backspace") {
      if (isVidaaTextInputEditingActive(event)) return false;
      // A dismissed keyboard can leave a stale input target on VIDAA.
      return isBackEvent(
        {
          target: null,
          key: event?.key,
          code: event?.code,
          keyName: event?.keyName || event?.detail?.keyName,
          keyCode: code
        },
        VIDAA_BACK_CODES
      );
    }
    return isBackEvent(event, VIDAA_BACK_CODES);
  },

  normalizeKey(event) {
    const normalized = normalizeKeyEvent(event, VIDAA_BACK_CODES);
    if (!normalized.keyCode) {
      normalized.keyCode = getVidaaTextInputKeyCode(event);
      normalized.originalKeyCode = normalized.keyCode;
    }
    normalized.isBack = this.isBackEvent(event);
    // Route channel seek shortcuts through Nuvio's normal media controls.
    // The adapter must not manipulate a video behind an open menu or dialog.
    if (normalized.keyCode === 427 || normalized.keyCode === 428) {
      normalized.keyName = normalized.keyCode === 427 ? "MediaFastForward" : "MediaRewind";
      normalized.keyCode = normalized.keyCode === 427 ? 417 : 412;
    }
    return normalized;
  },

  getDeviceLabel() {
    try {
      const model =
        typeof globalThis.Hisense_GetModelName === "function"
          ? globalThis.Hisense_GetModelName()
          : "";
      if (model) return `VIDAA TV (${model})`;
    } catch (_) {}
    return "VIDAA TV";
  },

  getCapabilities() {
    return {
      hlsJs: Boolean(globalThis.Hls?.isSupported?.()),
      dashJs: Boolean(globalThis.dashjs?.MediaPlayer),
      nativeVideo: true,
      webosAvplay: false,
      tizenAvplay: false
    };
  },

  prepareVideoElement(videoElement) {
    if (!videoElement) return;
    try {
      videoElement.setAttribute("playsinline", "true");
      videoElement.setAttribute("webkit-playsinline", "true");
    } catch (_) {}
  },

  prepareMediaRequest(url) {
    registerVidaaHttpMediaDomain(url);
  }
};
