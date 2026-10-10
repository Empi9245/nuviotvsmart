import * as internals from "./playerScreenContext.js";
import { createPlayerVideoLifecycleHandlers } from "./playerVideoLifecycleHandlers.js";
import { createPlayerVideoEventHandlers } from "./playerVideoEventHandlers.js";

export function createPlayerScreenMethods27() {
  return {
    bindVideoEvents() {
      const { PlayerController, Environment } = internals;
      const video = PlayerController.video;
      if (!video) {
        return;
      }
      // Idempotent bind: re-mounts/episode switches used to stack duplicate
      // timeupdate/subtitle/track handlers, multiplying per-frame work on
      // single-core Tizen. Unbind first; unbindVideoEvents is a no-op when empty.
      try {
        if (typeof this.unbindVideoEvents === "function") {
          this.unbindVideoEvents();
        }
      } catch (_) {}
      const isTizenAvPlayPlayback = () =>
        Boolean(Environment.isTizen() && typeof PlayerController.isUsingAvPlay === "function" && PlayerController.isUsingAvPlay());
      const lifecycleHandlers = createPlayerVideoLifecycleHandlers.call(this, video, isTizenAvPlayPlayback);
      const eventHandlers = createPlayerVideoEventHandlers.call(this, video, isTizenAvPlayPlayback);
      const { onWaiting, onPlaying, onPause, onProgress, onTimeUpdate, onLoadedMetadata, onPlayable, onSeeked, onTrackListChanged } =
        lifecycleHandlers;
      const { onWebOsAudioTrackSelectionChanged, onAvPlaySubtitleChange, onError } = eventHandlers;
      const bindings = [
        ["waiting", onWaiting],
        ["playing", onPlaying],
        ["error", onError],
        ["pause", onPause],
        ["progress", onProgress],
        ["timeupdate", onTimeUpdate],
        ["loadedmetadata", onLoadedMetadata],
        ["loadeddata", onPlayable],
        ["canplay", onPlayable],
        ["seeked", onSeeked],
        ["avplaytrackschanged", onTrackListChanged],
        ["avplaysubtitlechange", onAvPlaySubtitleChange],
        ["webosaudiotrackselectionchanged", onWebOsAudioTrackSelectionChanged],
        ["hlstrackschanged", onTrackListChanged],
        ["dashtrackschanged", onTrackListChanged]
      ];

      bindings.forEach(([eventName, handler]) => {
        const guardedHandler = (event) => {
          if (!this.isActiveMountToken() || this.sourcePlaybackStarting || this.sourceFallbackPending) return;
          handler(event);
        };
        video.addEventListener(eventName, guardedHandler);
        this.videoListeners.push({ target: video, eventName, handler: guardedHandler });
      });

      if (typeof window?.addEventListener === "function") {
        const onViewportResize = () => {
          this.applyAspectMode({ showToast: false });
          // applyAspectMode() restores the playback surface. Invalidate the
          // post-play mode before re-applying the Android mini-window geometry.
          this.cancelPostPlayPlayerSurfaceAnimation();
          const viewport = PlayerController.getCssPlayerViewportSize?.() || {
            width: 1920,
            height: 1080
          };
          if (this.isPostPlayVisible()) {
            this.postPlayPlayerSurfaceStateKey = "";
            this.postPlayPlayerSurfaceRect = {
              x: 0,
              y: 0,
              width: Math.max(1, Math.round(Number(viewport.width || 1920))),
              height: Math.max(1, Math.round(Number(viewport.height || 1080)))
            };
          }
          this.syncPostPlayPlayerSurface(this.getPostPlayState());
        };
        window.addEventListener("resize", onViewportResize);
        this.videoListeners.push({
          target: window,
          eventName: "resize",
          handler: onViewportResize
        });
      }

      const trackTargets = [this.getVideoTextTrackList(), this.getVideoAudioTrackList()].filter(Boolean);
      trackTargets.forEach((target) => {
        if (typeof target.addEventListener !== "function") {
          return;
        }
        ["addtrack", "removetrack", "change"].forEach((eventName) => {
          target.addEventListener(eventName, onTrackListChanged);
          this.videoListeners.push({ target, eventName, handler: onTrackListChanged });
        });
      });
      this.installVidaaTrackExperiment(video);
    },
    installVidaaTrackExperiment(video) {
      const { PlayerController, Environment } = internals;
      if (!Environment.isVidaa()) return;
      // Temporary, one-shot diagnostic. No selection, gate or renderer policy.
      let sample;
      try {
        sample = globalThis.sessionStorage?.getItem("nuvio.vidaaTrackExperiment");
        if (!sample) return;
        globalThis.sessionStorage.removeItem("nuvio.vidaaTrackExperiment");
      } catch (_) {
        return;
      }
      if (!["multi-audio", "external-vtt", "external-srt", "ass-to-vtt", "direct-url", "missing-language"].includes(sample)) return;
      globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__?.stop?.();
      const screen = this;
      const mountToken = screen.playerMountToken;
      const records = [];
      const timers = new Set();
      const disposers = [];
      const listTargets = new Set();
      const objectIds = new WeakMap();
      const valueIds = new Map();
      let nextId = 0;
      let requestId = 0;
      let startedAt = null;
      let stopped = false;
      let stopReason = null;
      let activeRequest = null;
      const read = (getter, fallback = null) => {
        try {
          return getter() ?? fallback;
        } catch (_) {
          return fallback;
        }
      };
      const number = (value) => (value != null && Number.isFinite(Number(value)) ? Number(value) : null);
      const language = (value) => (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(String(value || "")) ? String(value).toLowerCase() : null);
      const choice = (value, allowed) => (allowed.includes(value) ? value : null);
      // Opaque aliases preserve equality/order without exporting IDs, labels,
      // media URLs, cue text, headers, exception messages or arbitrary arguments.
      const alias = (value) => {
        if (value == null || value === "") return null;
        if (typeof value === "object" || typeof value === "function") {
          if (!objectIds.has(value)) objectIds.set(value, `o${++nextId}`);
          return objectIds.get(value);
        }
        const key = String(value);
        if (!valueIds.has(key)) valueIds.set(key, `v${++nextId}`);
        return valueIds.get(key);
      };
      const array = (list) => {
        const length = Math.min(
          64,
          Math.max(
            0,
            read(() => Number(list?.length), 0)
          )
        );
        return Array.from({ length }, (_, index) => read(() => list[index]) || read(() => list.item?.(index)));
      };
      const identity = (track = {}) => ({
        object: alias(track),
        sourceId: alias(read(() => track.trackId ?? track.sourceTrackId ?? track.id)),
        name: alias(read(() => track.label || track.name || track.title)),
        language: language(read(() => track.language || track.lang || track.languageCode)),
        kind: choice(
          read(() => track.kind),
          ["main", "alternative", "descriptions", "commentary", "subtitles", "captions", "forced"]
        )
      });
      const trackState = (track, index) => ({
        index,
        ...identity(track),
        enabled: read(() => (typeof track.enabled === "boolean" ? track.enabled : null)),
        selected: read(() => (typeof track.selected === "boolean" ? track.selected : null)),
        default: read(() => (typeof track.default === "boolean" ? track.default : null)),
        mode: choice(
          read(() => track.mode),
          ["disabled", "hidden", "showing"]
        ),
        cueCount: number(read(() => track.cues?.length)),
        activeCueCount: number(read(() => track.activeCues?.length)),
        activeCue: read(() => {
          const cue = track.activeCues?.[0] || track.activeCues?.item?.(0);
          return cue
            ? { start: number(cue.startTime), end: number(cue.endTime), line: number(cue.line), position: number(cue.position) }
            : null;
        })
      });
      const tracks = (list) =>
        array(list)
          .map((track, index) => (track ? trackState(track, index) : null))
          .filter(Boolean);
      const entryState = (entry = {}) => ({
        id: alias(entry.id),
        track: identity(entry.track || entry),
        selected: Boolean(entry.selected),
        implicit: Boolean(entry.implicitAudioTrack),
        nativeIndex: number(entry.audioTrackIndex ?? entry.textTrackIndex ?? entry.trackIndex),
        hlsIndex: number(entry.hlsAudioTrackIndex ?? entry.hlsSubtitleTrackIndex),
        dashIndex: number(entry.dashAudioTrackIndex ?? entry.dashTextTrackIndex),
        embeddedIndex: number(entry.embeddedAudioTrackIndex ?? entry.embeddedSubtitleTrackIndex),
        addonIndex: number(entry.subtitleIndex),
        manifestId: alias(entry.manifestAudioTrackId ?? entry.manifestSubtitleTrackId)
      });
      const isCurrent = () => PlayerController.video === video && screen.playerMountToken === mountToken;
      const listen = (target, eventName, handler) => {
        if (typeof target?.addEventListener !== "function") return;
        try {
          target.addEventListener(eventName, handler);
        } catch (_) {
          return;
        }
        disposers.push(() => target.removeEventListener(eventName, handler));
      };
      const later = (callback, delay) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          callback();
        }, delay);
        timers.add(timer);
      };
      const attachList = (target, kind) => {
        if (!target || listTargets.has(target)) return;
        listTargets.add(target);
        ["addtrack", "removetrack", "change"].forEach((eventName) => listen(target, eventName, () => safeCapture(`${kind}:${eventName}`)));
      };
      const capture = (reason, details = {}) => {
        if (stopped) return false;
        if (!isCurrent()) {
          stop("obsolete-mount");
          return false;
        }
        if (startedAt != null && Date.now() - startedAt >= 180000) {
          stop("deadline");
          return false;
        }
        if (records.length >= 399) {
          stop("record-limit");
          return false;
        }
        // A diagnostic read must never escape into a playback event handler.
        const audioList = read(() => screen.getVideoAudioTrackList());
        const textList = read(() => screen.getVideoTextTrackList());
        attachList(audioList, "audio-list");
        attachList(textList, "text-list");
        const audio = tracks(audioList);
        const text = tracks(textList);
        const hls = PlayerController.playbackEngine === "hls.js";
        const dash = PlayerController.playbackEngine === "dash.js";
        const engineAudio = tracks(
          read(() => (hls ? PlayerController.getHlsAudioTracks() : dash ? PlayerController.getDashAudioTracks() : []))
        );
        const engineText = tracks(
          read(() => (hls ? PlayerController.getHlsSubtitleTracks() : dash ? PlayerController.getDashTextTracks() : []))
        );
        const style = screen.subtitleStyleSettings || {};
        const htmlNode = screen.uiRefs?.htmlSubtitles;
        const htmlVisible = read(
          () => htmlNode && !htmlNode.classList.contains("hidden") && htmlNode.getAttribute("aria-hidden") === "false",
          false
        );
        const htmlOwned = Boolean(screen.htmlSubtitleSelectedId && screen.htmlSubtitleCues?.length);
        const assActive = Boolean(read(() => screen.assSubtitleRenderer?.active, false));
        const nativeShowing = text.filter((track) => track.mode === "showing").map((track) => track.object);
        records.push({
          reason,
          elapsedMs: startedAt == null ? null : Math.max(0, Date.now() - startedAt),
          activeRequest,
          ...details,
          backend: choice(PlayerController.playbackEngine, [
            "none",
            "native",
            "native-file",
            "native-hls",
            "native-dash",
            "hls.js",
            "dash.js",
            "tizen-avplay"
          ]),
          video: alias(video),
          source: alias(screen.activePlaybackUrl),
          playToken: number(PlayerController.playRequestToken),
          mountToken: number(mountToken),
          audioToken: number(screen.audioSelectionToken),
          subtitleToken: number(screen.subtitleSelectionToken),
          nativeAudioToken: number(PlayerController.nativeAudioTrackSelectionToken),
          nativeTextToken: number(PlayerController.nativeTextTrackSelectionToken),
          readyState: number(video.readyState),
          currentTime: number(video.currentTime),
          paused: Boolean(video.paused),
          hidden: Boolean(read(() => document.visibilityState === "hidden", false)),
          gate: {
            active: Boolean(screen.startupAudioGateActive),
            nativeAllowed: Boolean(screen.startupAudioGateAllowsNativePlayback),
            remainingMs: screen.startupAudioGateDeadline > 0 ? Math.max(0, screen.startupAudioGateDeadline - Date.now()) : null,
            applied: Boolean(screen.startupAudioPreferenceApplied),
            applying: Boolean(screen.startupAudioPreferenceApplying),
            fallback: Boolean(screen.startupAudioFallbackApplied),
            discovery: Boolean(screen.trackDiscoveryInProgress),
            discoveryRemainingMs: screen.trackDiscoveryDeadline > 0 ? Math.max(0, screen.trackDiscoveryDeadline - Date.now()) : null,
            retryRemainingMs:
              screen.startupAudioPreferenceRetryDeadline > 0 ? Math.max(0, screen.startupAudioPreferenceRetryDeadline - Date.now()) : null,
            manifestLoading: Boolean(screen.manifestLoading),
            audioLoading: Boolean(screen.embeddedAudioLoading),
            restore: Boolean(screen.pendingPlaybackRestore)
          },
          preferredLanguages: read(() => screen.getStartupPreferredAudioLanguageTargets(), []).map(language),
          rememberedAudio: screen.rememberedAudioTrackPreference
            ? {
                language: language(screen.rememberedAudioTrackPreference.language),
                sourceId: alias(screen.rememberedAudioTrackPreference.trackId),
                name: alias(screen.rememberedAudioTrackPreference.name)
              }
            : null,
          audioList: alias(audioList),
          textList: alias(textList),
          audio,
          text,
          engineAudio,
          engineText,
          engineAudioIndex: number(
            read(() =>
              hls ? PlayerController.getSelectedHlsAudioTrackIndex() : dash ? PlayerController.getSelectedDashAudioTrackIndex() : null
            )
          ),
          engineTextIndex: number(
            read(() =>
              hls ? PlayerController.getSelectedHlsSubtitleTrackIndex() : dash ? PlayerController.getSelectedDashTextTrackIndex() : null
            )
          ),
          audioEntries: read(() => screen.getAudioEntries(), [])
            .slice(0, 64)
            .map(entryState),
          selectedAudioIndex: number(screen.selectedAudioTrackIndex),
          selectedTextIndex: number(screen.selectedSubtitleTrackIndex),
          selectedAddon: alias(screen.selectedAddonSubtitleId),
          requestedSubtitle: screen.requestedSubtitleEntry ? entryState(screen.requestedSubtitleEntry) : null,
          externalNodes: (screen.externalTrackNodes || [])
            .slice(0, 64)
            .map((node) => ({ node: alias(node), track: alias(node.track), readyState: number(node.readyState) })),
          renderer: {
            requested: choice(screen.subtitleRenderMode, ["native", "html", "auto"]),
            htmlOwned,
            htmlVisible,
            assActive,
            htmlCueCount: number(screen.htmlSubtitleCues?.length),
            nativeShowing,
            concurrentOutputSignals: nativeShowing.length + Number(htmlOwned) + Number(assActive) > 1
          },
          presentation: {
            fontSize: number(style.fontSize),
            color: /^#[a-f0-9]{6,8}$/i.test(style.textColor || "") ? style.textColor : null,
            outline: Boolean(style.outlineEnabled),
            outlineColor: /^#[a-f0-9]{6,8}$/i.test(style.outlineColor || "") ? style.outlineColor : null,
            offset: number(style.verticalOffset),
            delayMs: number(screen.subtitleDelayMs),
            htmlBox: htmlVisible
              ? read(() => {
                  const rect = htmlNode.getBoundingClientRect();
                  return { top: number(rect.top), bottom: number(rect.bottom), height: number(rect.height) };
                })
              : null,
            visualEffect: "requires-observer"
          }
        });
        return true;
      };
      const safeCapture = (reason, details) => read(() => capture(reason, details), false);
      const stop = (reason = "manual") => {
        if (stopped) return;
        stopped = true;
        stopReason = reason;
        timers.forEach(clearTimeout);
        timers.clear();
        disposers.reverse().forEach((dispose) => read(dispose));
        records.push({ reason: "stop", stopReason, elapsedMs: startedAt == null ? null : Math.max(0, Date.now() - startedAt) });
      };
      const begin = () => {
        if (stopped || startedAt != null) return;
        timers.forEach(clearTimeout);
        timers.clear();
        startedAt = Date.now();
        safeCapture("snapshot", { scheduledMs: 0 });
        [250, 1000, 3000, 6000, 12000].forEach((scheduledMs) => later(() => safeCapture("snapshot", { scheduledMs }), scheduledMs));
        later(() => stop("deadline"), 180000);
      };
      const wrap = (owner, name, describe = () => ({})) => {
        const original = owner[name];
        if (typeof original !== "function") return;
        const own = Object.prototype.hasOwnProperty.call(owner, name);
        const wrapped = function (...args) {
          if (stopped) return original.apply(this, args);
          if (name === "unbindVideoEvents") {
            stop("unbind");
            return original.apply(this, args);
          }
          if (name === "startPlayerControllerPlayback") begin();
          const id = ++requestId;
          const previousRequest = activeRequest;
          activeRequest = id;
          safeCapture(`call:${name}`, { request: id, arguments: read(() => describe(args), {}) });
          let result;
          try {
            result = original.apply(this, args);
          } catch (error) {
            safeCapture(`throw:${name}`, { request: id });
            throw error;
          } finally {
            activeRequest = previousRequest;
          }
          const playToken = PlayerController.playRequestToken;
          const audioToken = screen.audioSelectionToken;
          const subtitleToken = screen.subtitleSelectionToken;
          const nativeAudioToken = PlayerController.nativeAudioTrackSelectionToken;
          const nativeTextToken = PlayerController.nativeTextTrackSelectionToken;
          const audioRequest = /AudioTrack$/.test(name);
          const subtitleRequest = /Subtitle|TextTrack/.test(name);
          const complete = (outcome) =>
            safeCapture(`return:${name}`, {
              request: id,
              outcome,
              current:
                PlayerController.playRequestToken === playToken &&
                (!audioRequest || screen.audioSelectionToken === audioToken) &&
                (!subtitleRequest || screen.subtitleSelectionToken === subtitleToken) &&
                (name !== "setNativeAudioTrack" || PlayerController.nativeAudioTrackSelectionToken === nativeAudioToken) &&
                (name !== "setNativeTextTrack" || PlayerController.nativeTextTrackSelectionToken === nativeTextToken)
            });
          if (result && read(() => typeof result.then === "function", false)) {
            read(() =>
              result.then(
                (value) => complete(typeof value === "boolean" ? value : "resolved"),
                () => complete("rejected")
              )
            );
          } else complete(typeof result === "boolean" ? result : "returned");
          return result;
        };
        owner[name] = wrapped;
        disposers.push(() => {
          if (owner[name] !== wrapped) return;
          if (own) owner[name] = original;
          else delete owner[name];
        });
      };
      wrap(screen, "startPlayerControllerPlayback");
      wrap(screen, "unbindVideoEvents");
      wrap(screen, "applyAudioTrack", ([index, options]) => ({
        index: number(index),
        entry: read(() => entryState(screen.getAudioEntries()[index])),
        manual: options?.rememberSelection === true,
        automaticFallback: options?.automaticFallback === true,
        startup: Boolean(screen.startupAudioPreferenceApplying)
      }));
      wrap(screen, "applySubtitleEntry", ([entry]) => ({
        entry: entryState(entry),
        startup: Boolean(screen.startupSubtitlePreferenceApplying)
      }));
      [
        "applyFallbackAddonSubtitle",
        "applyTvHtmlAddonSubtitle",
        "enableStartupAudioGate",
        "releaseStartupAudioGate",
        "refreshTrackDialogs"
      ].forEach((name) => wrap(screen, name));
      wrap(screen, "adjustSubtitleStyleControl", ([control, delta]) => ({
        control: choice(control, [
          "fontSize",
          "textColor",
          "outlineEnabled",
          "outlineColor",
          "verticalOffset",
          "delay",
          "reset",
          "resetDelay"
        ]),
        delta: number(delta)
      }));
      [
        "setNativeAudioTrack",
        "setNativeTextTrack",
        "setHlsAudioTrack",
        "setHlsSubtitleTrack",
        "setDashAudioTrack",
        "setDashTextTrack"
      ].forEach((name) => wrap(PlayerController, name, ([index]) => ({ index: number(index) })));
      ["loadedmetadata", "loadeddata", "canplay", "playing", "seeked", "pause", "emptied", "hlstrackschanged", "dashtrackschanged"].forEach(
        (name) => listen(video, name, () => safeCapture(`event:${name}`))
      );
      listen(globalThis.document, "visibilitychange", () => safeCapture("event:visibilitychange"));
      ["pagehide", "pageshow"].forEach((name) => listen(globalThis.window, name, () => safeCapture(`event:${name}`)));
      globalThis.__NUVIO_VIDAA_TRACK_EXPERIMENT__ = {
        stop: () => stop(),
        snapshot: () => safeCapture("manual-snapshot"),
        mark: (action) =>
          ["manual-audio", "manual-subtitle", "seek", "pause", "suspend", "resume"].includes(action) && safeCapture("action", { action }),
        observe: (control, effect) =>
          ["fontSize", "textColor", "outline", "verticalOffset", "delay", "audio"].includes(control) &&
          ["visible-change", "no-visible-change", "preferred-audible", "manual-audible", "wrong-audio", "uncertain"].includes(effect) &&
          safeCapture("observation", { control, effect }),
        export: () =>
          JSON.stringify({
            schema: 1,
            sample,
            target: "Hisense VIDAA 9 U09.60 / V0000.09.60A.Q0707 / MTK9603",
            stopped,
            stopReason,
            records
          })
      };
      safeCapture("armed");
      later(() => stop("no-playback-request"), 30000);
    }
  };
}
