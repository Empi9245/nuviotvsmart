import { isBackEvent, normalizeKeyEvent } from "../sharedKeys.js";

// VIDAA WebApps should follow the device viewport so both 1280x720 and 1920x1080
// panels render the complete UI without browser-level zoom/cropping.
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
    "width=device-width, height=device-height, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  );
  documentRef.documentElement?.classList?.add("vidaa-tv");
  documentRef.body?.classList?.add("vidaa-tv");

  try {
    globalThis.dispatchEvent?.(new Event("resize"));
  } catch (_) {
    // Ignore resize dispatch failure
  }
}

function installVidaaKeyboardFix() {
  const globalRef = globalThis;
  if (globalRef.__NUVIO_VIDAA_KEYBOARD_FIX_INSTALLED__) return;
  globalRef.__NUVIO_VIDAA_KEYBOARD_FIX_INSTALLED__ = true;

  // Layer 1: Override HTMLInputElement.prototype.value setter
  // The VIDAA on-screen keyboard writes directly to input.value without firing DOM events.
  try {
    const inputProto = globalRef.HTMLInputElement?.prototype;
    const desc = inputProto ? Object.getOwnPropertyDescriptor(inputProto, "value") : null;
    if (desc && desc.set) {
      const origSet = desc.set;
      const origGet = desc.get;
      let guard = false;
      Object.defineProperty(inputProto, "value", {
        get: origGet,
        set: function (v) {
          const old = origGet.call(this);
          origSet.call(this, v);
          if (v !== old && !guard) {
            guard = true;
            try {
              this.dispatchEvent(new Event("input", { bubbles: true }));
              this.dispatchEvent(new Event("change", { bubbles: true }));
            } catch (_) {}
            guard = false;
          }
        },
        configurable: true
      });
    }
  } catch (_) {}

  // Layer 2: Polling fallback on focused text input
  let prevValue = "";
  const pollTimer = setInterval(() => {
    try {
      const active = globalRef.document?.activeElement;
      if (!active || (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA")) {
        prevValue = "";
        return;
      }
      const cur = active.value || "";
      if (cur !== prevValue) {
        prevValue = cur;
        try {
          active.dispatchEvent(new Event("input", { bubbles: true }));
          active.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (_) {}
      }
    } catch (_) {}
  }, 250);
  pollTimer?.unref?.();
}

function installFKeyCrashSuppressor() {
  const globalRef = globalThis;
  if (globalRef.__NUVIO_FKEY_SUPPRESSOR_INSTALLED__) return;
  globalRef.__NUVIO_FKEY_SUPPRESSOR_INSTALLED__ = true;

  // On VIDAA OS, pressing F triggers requestFullscreen which crashes the browser.
  globalRef.document?.addEventListener(
    "keydown",
    (e) => {
      if (e.keyCode === 70 || e.key === "f" || e.key === "F") {
        const tag = String(e.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}

function registerTrustedDomains() {
  const addInsecure = globalThis.Hisense_AddInsecureDomain;
  if (typeof addInsecure !== "function") return;

  const defaultDomains = [
    "api.themoviedb.org",
    "image.tmdb.org",
    "strem.io",
    "v3-cinemeta.strem.io",
    "torrentio.strem.fun",
    "real-debrid.com",
    "alldebrid.com",
    "premiumize.me",
    "debrid-link.com",
    "torbox.app",
    "easydebrid.com"
  ];

  defaultDomains.forEach((domain) => {
    try {
      addInsecure(domain);
    } catch (_) {}
  });
}

export function launchVidaaNativePlayer(url, title = "Nuvio TV") {
  if (!url) return false;

  const platformMsg = {
    type: "launchNativePlayer",
    url: String(url),
    title: String(title || "Nuvio TV"),
    mimeType: url.includes(".mkv") ? "video/x-matroska" : "video/mp4"
  };

  const rawJson = JSON.stringify(platformMsg);
  try {
    if (typeof globalThis.omi_platform?.sendPlatformMessage === "function") {
      globalThis.omi_platform.sendPlatformMessage(rawJson);
      return true;
    }
    if (typeof globalThis.opera_omi?.sendPlatformMessage === "function") {
      globalThis.opera_omi.sendPlatformMessage(rawJson);
      return true;
    }
  } catch (e) {
    console.warn("[VIDAA] Failed to dispatch native player message", e);
  }
  return false;
}

const VIDAA_BACK_CODES = [8, 461, 10009, 27];

export const vidaaAdapter = {
  name: "vidaa",

  init() {
    applyVidaaViewport();
    installVidaaKeyboardFix();
    installFKeyCrashSuppressor();
    registerTrustedDomains();

    // VIDAA Remote color keys & quick seek listener
    globalThis.document?.addEventListener(
      "keydown",
      (e) => {
        const code = Number(e.keyCode || e.which || 0);

        // Yellow button (405): launch native player handoff if currently playing
        if (code === 405) {
          const video = globalThis.document?.querySelector("video");
          const streamUrl = video?.currentSrc || video?.src;
          if (streamUrl) {
            launchVidaaNativePlayer(streamUrl, globalThis.document?.title || "Nuvio TV");
          }
        }

        // Channel Up (427): +60s quick seek in player
        if (code === 427) {
          const video = globalThis.document?.querySelector("video");
          if (video && !video.paused) {
            video.currentTime = Math.min(video.currentTime + 60, video.duration || Infinity);
          }
        }

        // Channel Down (428): -60s quick seek in player
        if (code === 428) {
          const video = globalThis.document?.querySelector("video");
          if (video && !video.paused) {
            video.currentTime = Math.max(video.currentTime - 60, 0);
          }
        }
      },
      false
    );
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
    return isBackEvent(event, VIDAA_BACK_CODES);
  },

  normalizeKey(event) {
    return normalizeKeyEvent(event, VIDAA_BACK_CODES);
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
      tizenAvplay: false,
      vidaaPlayer: true
    };
  },

  prepareVideoElement(videoElement) {
    if (!videoElement) return;
    try {
      videoElement.setAttribute("playsinline", "true");
      videoElement.setAttribute("webkit-playsinline", "true");
    } catch (_) {}
  },

  launchNativePlayer(url, title) {
    return launchVidaaNativePlayer(url, title);
  }
};
