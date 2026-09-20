/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods05() {
  const { PlayerController, buildInlineYoutubePlayerUrl, POST_PLAY_LONG_PRESS_DELAY_MS } = internals;

  return {
    schedulePostPlayLongPress() {
      this.clearPostPlayLongPressTimer();
      this.postPlayLongPressTriggered = false;
      this.postPlayLongPressTimer = setTimeout(() => {
        this.postPlayLongPressTimer = null;
        this.triggerPostPlayLongPress();
      }, POST_PLAY_LONG_PRESS_DELAY_MS);
    },
    syncPostPlayTrailerMedia() {
      const mediaMount = this.uiRefs?.postPlay?.querySelector(".player-post-play-trailer-media");
      if (!mediaMount || !this.postPlayTrailerMedia) {
        return;
      }
      if (this.postPlayTrailerMedia.node && this.postPlayTrailerMedia.node.parentElement !== mediaMount) {
        mediaMount.replaceChildren(this.postPlayTrailerMedia.node);
      }
    },
    clearPostPlayTrailerExitTimer() {
      if (this.postPlayTrailerExitTimer) {
        clearTimeout(this.postPlayTrailerExitTimer);
        this.postPlayTrailerExitTimer = null;
      }
    },
    startPostPlayTrailer(recommendation = {}, { auto = false } = {}) {
      this.stopPostPlayTrailer();
      this.clearPostPlayTrailerExitTimer();
      try {
        // Android releases the main player before TrailerPlayer takes over the
        // full screen. Stop the active web/native session as well; keeping it
        // merely paused can leave AVPlay or the HTML pipeline alive underneath
        // the trailer during the pre-end autoplay path.
        PlayerController.stop?.({
          forceCloudSync: false,
          allowCloudSync: false,
          flushProgress: false
        });
      } catch (_) {}
      const generation = ++this.postPlayTrailerGeneration;
      const mediaMount = this.uiRefs?.postPlay?.querySelector(".player-post-play-trailer-media");
      if (!mediaMount) {
        this.postPlayRecommendationController?.onTrailerEnded?.();
        return;
      }
      if (recommendation.trailerYtId) {
        const frame = document.createElement("iframe");
        frame.className = "player-post-play-trailer-frame is-loading";
        frame.src = buildInlineYoutubePlayerUrl(recommendation.trailerYtId);
        frame.title = recommendation.title || "Trailer";
        frame.allow = "autoplay; encrypted-media; picture-in-picture";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.allowFullscreen = true;
        frame.addEventListener("load", () => frame.classList.add("is-ready"), { once: true });
        mediaMount.replaceChildren(frame);
        const handler = (event) => {
          if (generation !== this.postPlayTrailerGeneration || event?.source !== frame.contentWindow) {
            return;
          }
          const data = event?.data;
          if (!data || typeof data !== "object" || data.source !== "nuvio-youtube-proxy") {
            return;
          }
          if (data.type === "ended" || (data.type === "state" && data.state?.ended)) {
            this.postPlayRecommendationController?.onTrailerEnded?.();
          }
        };
        this.postPlayTrailerMessageHandler = handler;
        window.addEventListener("message", handler);
        this.postPlayTrailerMedia = { kind: "youtube", node: frame, auto };
        return;
      }
      if (recommendation.trailerVideoUrl) {
        const video = document.createElement("video");
        video.className = "player-post-play-trailer-video is-loading";
        video.src = recommendation.trailerVideoUrl;
        video.autoplay = true;
        video.controls = false;
        video.playsInline = true;
        video.preload = "auto";
        const markReady = () => video.classList.add("is-ready");
        video.addEventListener("loadeddata", markReady, { once: true });
        video.addEventListener("canplay", markReady, { once: true });
        video.addEventListener("ended", () => {
          if (generation === this.postPlayTrailerGeneration) {
            this.postPlayRecommendationController?.onTrailerEnded?.();
          }
        });
        mediaMount.replaceChildren(video);
        this.postPlayTrailerMedia = { kind: "direct", node: video, auto };
        const playPromise = video.play?.();
        if (playPromise?.catch) {
          playPromise.catch(() => {});
        }
        return;
      }
      this.postPlayRecommendationController?.onTrailerEnded?.();
    },
    stopPostPlayTrailer() {
      this.clearPostPlayTrailerExitTimer();
      this.postPlayTrailerGeneration += 1;
      if (this.postPlayTrailerMessageHandler) {
        window.removeEventListener("message", this.postPlayTrailerMessageHandler);
        this.postPlayTrailerMessageHandler = null;
      }
      const node = this.postPlayTrailerMedia?.node;
      const mediaMount = this.uiRefs?.postPlay?.querySelector(".player-post-play-trailer-media");
      if (node && typeof node.pause === "function") {
        try {
          node.pause();
        } catch (_) {}
      }
      if (node?.tagName === "IFRAME") {
        try {
          node.contentWindow?.postMessage(
            {
              source: "nuvio-detail-trailer",
              type: "command",
              command: "pause",
              payload: {}
            },
            "*"
          );
        } catch (_) {}
      }
      const cleanupNode = () => {
        if (node?.parentElement === mediaMount) {
          node.remove();
        }
        if (node && node.tagName === "VIDEO") {
          try {
            node.removeAttribute("src");
            node.load?.();
          } catch (_) {}
        }
      };
      if (node) {
        // Android keeps TrailerPlayer mounted through its 500ms exit fade. Do
        // the same here so the media layer can visibly fade below the scrim.
        this.postPlayTrailerExitTimer = setTimeout(() => {
          this.postPlayTrailerExitTimer = null;
          cleanupNode();
        }, 500);
      }
      // Keep the node mounted until the CSS exit transition completes. A new
      // start clears the timer before replacing this node, preventing stale
      // cleanup from touching a newly selected trailer.
      this.postPlayTrailerMedia = null;
    },
    invokePostPlayAction(action = "") {
      const state = this.getPostPlayState();
      const recommendation = state.recommendation;
      if (!recommendation) {
        return false;
      }
      switch (String(action || "")) {
        case "primary":
          return this.navigateToPostPlayRecommendation(recommendation, {
            openDetails: recommendation.contentType === "series"
          });
        case "trailer":
          if (state.isTrailerPlaying) {
            return Boolean(this.postPlayRecommendationController?.onTrailerEnded?.());
          }
          return Boolean(this.postPlayRecommendationController?.startTrailer?.({ auto: false }));
        case "previous":
          if (!state.canNavigatePrevious) {
            return false;
          }
          return Boolean(this.postPlayRecommendationController?.selectRecommendation?.(state.recommendationIndex - 1));
        case "next":
          if (!state.canNavigateNext) {
            return false;
          }
          return Boolean(this.postPlayRecommendationController?.selectRecommendation?.(state.recommendationIndex + 1));
        case "return":
        case "playerWindow":
          return this.returnToPlayerFromPostPlay();
        case "synopsis":
          this.postPlaySynopsisVisible = true;
          this.postPlayManualDialogVisible = false;
          this.postPlayFocusedAction = "synopsis";
          this.postPlayRenderedSignature = "";
          this.renderPostPlayRecommendation();
          this.focusPostPlaySynopsisContent();
          return true;
        case "synopsisClose":
          this.postPlaySynopsisVisible = false;
          this.clearPostPlaySynopsisScrollAnimation();
          this.postPlayRenderedSignature = "";
          this.renderPostPlayRecommendation();
          this.focusPostPlayAction("primary");
          return true;
        case "manualPlay":
          this.postPlayManualDialogVisible = false;
          this.postPlayRenderedSignature = "";
          this.renderPostPlayRecommendation();
          return this.navigateToPostPlayRecommendation(recommendation, {
            openDetails: false,
            manualSelection: true
          });
        case "manualCancel":
          this.postPlayManualDialogVisible = false;
          this.postPlayRenderedSignature = "";
          this.renderPostPlayRecommendation();
          this.focusPostPlayAction("primary");
          return true;
        default:
          return false;
      }
    },
    openPostPlayManualDialog() {
      const state = this.getPostPlayState();
      if (!state.isVisible || state.recommendation?.contentType !== "movie" || !this.isPostPlayManualPlayOptionEnabled()) {
        return false;
      }
      this.postPlayManualDialogVisible = true;
      this.postPlaySynopsisVisible = false;
      this.postPlayRenderedSignature = "";
      this.renderPostPlayRecommendation();
      this.focusPostPlayAction("manualPlay");
      return true;
    },
    handlePostPlayPointer(target) {
      const actionNode = target?.closest?.("[data-player-post-play-action]");
      const modalNode = target?.closest?.("[data-player-post-play-modal]");
      if (modalNode && !actionNode && target === modalNode) {
        if (this.postPlayManualDialogVisible) {
          return this.invokePostPlayAction("manualCancel");
        }
        if (this.postPlaySynopsisVisible) {
          return this.invokePostPlayAction("synopsisClose");
        }
      }
      if (!actionNode) {
        return false;
      }
      const action = String(actionNode.dataset.playerPostPlayAction || "");
      this.postPlayFocusedAction = action;
      if (action === "manualPlay" || action === "manualCancel" || action === "synopsisClose") {
        return this.invokePostPlayAction(action);
      }
      if (this.postPlayManualDialogVisible || this.postPlaySynopsisVisible) {
        return true;
      }
      const result = this.invokePostPlayAction(action);
      if (action === "previous" || action === "next") {
        this.schedulePostPlayFocus(action, 32);
      }
      return result;
    }
  };
}
