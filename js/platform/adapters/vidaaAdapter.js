import { isBackEvent, normalizeKeyEvent } from "../sharedKeys.js";

const VIDAA_LOGICAL_WIDTH = 1920;
const VIDAA_LOGICAL_HEIGHT = 1080;

function syncVidaaBrowserViewportFit() {
  const documentRef = globalThis.document;
  const screens = documentRef?.querySelectorAll?.("#app > .screen:not(#player)");
  if (!documentRef || !screens?.length) return;

  const visualViewport = globalThis.visualViewport;
  const viewportWidth = Math.max(
    1,
    Number(visualViewport?.width || globalThis.innerWidth || documentRef.documentElement?.clientWidth || VIDAA_LOGICAL_WIDTH)
  );
  const viewportHeight = Math.max(
    1,
    Number(visualViewport?.height || globalThis.innerHeight || documentRef.documentElement?.clientHeight || VIDAA_LOGICAL_HEIGHT)
  );

  // A packaged VIDAA WebApp normally exposes the full 1920x1080 canvas.
  // The hosted Browser can expose a smaller viewport because browser chrome
  // remains visible. Keep 1920x1080 as the logical layout and fit only the
  // non-player UI into the actually visible browser area.
  const zoom = Math.min(
    1,
    viewportWidth / VIDAA_LOGICAL_WIDTH,
    viewportHeight / VIDAA_LOGICAL_HEIGHT
  );
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const renderedWidth = VIDAA_LOGICAL_WIDTH * safeZoom;
  const renderedHeight = VIDAA_LOGICAL_HEIGHT * safeZoom;
  const physicalOffsetX = Math.max(0, (viewportWidth - renderedWidth) / 2);
  const physicalOffsetY = Math.max(0, (viewportHeight - renderedHeight) / 2);
  const logicalOffsetX = physicalOffsetX / safeZoom;
  const logicalOffsetY = physicalOffsetY / safeZoom;

  documentRef.documentElement?.style?.setProperty("--vidaa-ui-zoom", String(safeZoom));
  documentRef.documentElement?.style?.setProperty("--vidaa-ui-offset-x", `${logicalOffsetX}px`);
  documentRef.documentElement?.style?.setProperty("--vidaa-ui-offset-y", `${logicalOffsetY}px`);

  screens.forEach((screen) => {
    // CSS zoom is deliberate here: unlike transform:scale(), it keeps pointer
    // hit testing and layout coordinates coherent on older TV Chromium/WebKit.
    screen.style.zoom = String(safeZoom);
    screen.style.left = `${logicalOffsetX}px`;
    screen.style.top = `${logicalOffsetY}px`;
  });
}

function installVidaaBrowserViewportFit() {
  const globalRef = globalThis;
  if (globalRef.__NUVIO_VIDAA_VIEWPORT_FIT_INSTALLED__) {
    syncVidaaBrowserViewportFit();
    return;
  }
  globalRef.__NUVIO_VIDAA_VIEWPORT_FIT_INSTALLED__ = true;

  let frame = null;
  const schedule = () => {
    if (frame) {
      try {
        globalRef.cancelAnimationFrame?.(frame);
      } catch (_) {}
    }
    const run = () => {
      frame = null;
      syncVidaaBrowserViewportFit();
    };
    frame = globalRef.requestAnimationFrame?.(run) || globalRef.setTimeout?.(run, 0) || null;
  };

  globalRef.addEventListener?.("resize", schedule);
  globalRef.visualViewport?.addEventListener?.("resize", schedule);
  globalRef.visualViewport?.addEventListener?.("scroll", schedule);
  schedule();
  globalRef.setTimeout?.(schedule, 120);
  globalRef.setTimeout?.(schedule, 500);
}

// VIDAA keeps a 1920x1080 logical UI. Packaged apps receive that canvas
// directly; the hosted Browser may expose less visible space, handled above.
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

// VIDAA's official WebApp mapping is VK_BACK_SPACE = 8. The remaining
// values are compatibility fallbacks seen in hosted-browser/TV firmware paths
// and are intentionally kept so Back remains usable outside a packaged app.
const VIDAA_BACK_CODES = [8, 461, 10009, 27];

export const vidaaAdapter = {
  name: "vidaa",

  init() {
    applyVidaaViewport();
    installVidaaBrowserViewportFit();
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
