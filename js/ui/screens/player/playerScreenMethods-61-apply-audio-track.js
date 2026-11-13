/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";
import {
  nativeAudioTrackSelectionMatches,
  applyNativeAudioTrackFlags,
  createNativeAudioSelectionRollback,
  confirmNativeTrackSelection
} from "../../../core/player/playerControllerMethods-02-is-likely-direct-file-url.js";
import { beginVidaaTrackSwitch } from "./vidaaTrackSwitchGuard.js";

export function createPlayerScreenMethods61() {
  const {
    PlayerController,
    Environment,
    renderLoadingIndicator,
    AUDIO_AMPLIFICATION_MIN_DB,
    AUDIO_AMPLIFICATION_MAX_DB,
    t,
    isUnsupportedWebOsAudioTrack,
    cleanDisplayText,
    getUsableAudioTrackLanguageValue,
    normalizeTrackLanguageCode,
    getAuthoritativeAudioCodecValue,
    formatAudioCodecName,
    clamp,
    escapeHtml
  } = internals;

  return {
    async applyAudioTrack(index, { automaticFallback = false, rememberSelection = false } = {}) {
      const entries = this.getAudioEntries();
      const selectedEntry = entries[index] || null;
      if (!selectedEntry) {
        return;
      }
      const entryContext = Environment.isVidaa() ? selectedEntry.audioEntryContext : null;
      if (
        entryContext &&
        (entryContext.video !== PlayerController.video ||
          entryContext.videoSource !== PlayerController.video?.src ||
          entryContext.engine !== PlayerController.playbackEngine ||
          entryContext.hlsInstance !== PlayerController.hlsInstance ||
          entryContext.dashInstance !== PlayerController.dashInstance ||
          entryContext.playRequestToken !== PlayerController.playRequestToken ||
          entryContext.sourceAttemptToken !== this.sourcePlaybackAttemptToken ||
          entryContext.mountToken !== this.playerMountToken ||
          entryContext.playbackUrl !== this.activePlaybackUrl)
      ) {
        this.invalidateTrackDialogCaches();
        this.renderAudioDialog();
        return false;
      }
      if (this.isAudioEntryPending(selectedEntry)) {
        return;
      }
      const selectionToken = Number(this.audioSelectionToken || 0) + 1;
      this.audioSelectionToken = selectionToken;
      const video = PlayerController.video;
      const videoSource = video?.src;
      const playRequestToken = PlayerController.playRequestToken;
      const mountToken = this.playerMountToken;
      const playbackUrl = this.activePlaybackUrl;
      const engine = PlayerController.playbackEngine;
      const hlsInstance = PlayerController.hlsInstance;
      const dashInstance = PlayerController.dashInstance;
      const sourceAttemptToken = this.sourcePlaybackAttemptToken;
      const isCurrentSelection = () =>
        this.audioSelectionToken === selectionToken &&
        this.playerMountToken === mountToken &&
        this.activePlaybackUrl === playbackUrl &&
        PlayerController.video === video &&
        video?.src === videoSource &&
        PlayerController.playRequestToken === playRequestToken &&
        PlayerController.playbackEngine === engine &&
        PlayerController.hlsInstance === hlsInstance &&
        PlayerController.dashInstance === dashInstance &&
        this.sourcePlaybackAttemptToken === sourceAttemptToken;
      if (!automaticFallback) {
        this.failedAutomaticAudioFallbackEntryId = "";
      }
      if (rememberSelection) {
        this.startupAudioFallbackApplied = false;
      }
      if (
        !selectedEntry.canTryAudioConversion &&
        (selectedEntry.supported === false || isUnsupportedWebOsAudioTrack(selectedEntry.track))
      ) {
        this.invalidateTrackDialogCaches();
        this.renderAudioDialog();
        return;
      }

      if (Number.isFinite(selectedEntry.avplayAudioTrackIndex)) {
        const applied =
          typeof PlayerController.setAvPlayAudioTrack === "function"
            ? PlayerController.setAvPlayAudioTrack(selectedEntry.avplayAudioTrackIndex)
            : false;
        if (applied) {
          this.selectedAudioTrackIndex = selectedEntry.avplayAudioTrackIndex;
          if (rememberSelection) {
            this.rememberAudioTrackSelection(this.getAudioTrackPreference(selectedEntry));
          }
          this.invalidateTrackDialogCaches();
          this.refreshTrackDialogs();
        }
        return;
      }

      if (Number.isFinite(selectedEntry.dashAudioTrackIndex)) {
        const applied =
          typeof PlayerController.setDashAudioTrack === "function"
            ? PlayerController.setDashAudioTrack(selectedEntry.dashAudioTrackIndex)
            : false;
        if (applied) {
          this.selectedAudioTrackIndex = selectedEntry.dashAudioTrackIndex;
          if (rememberSelection) {
            this.rememberAudioTrackSelection(this.getAudioTrackPreference(selectedEntry));
          }
          this.invalidateTrackDialogCaches();
          this.refreshTrackDialogs();
        }
        return;
      }

      if (Number.isFinite(selectedEntry.hlsAudioTrackIndex)) {
        const applied =
          typeof PlayerController.setHlsAudioTrack === "function"
            ? PlayerController.setHlsAudioTrack(selectedEntry.hlsAudioTrackIndex)
            : false;
        if (applied) {
          this.selectedAudioTrackIndex = selectedEntry.hlsAudioTrackIndex;
          if (rememberSelection) {
            this.rememberAudioTrackSelection(this.getAudioTrackPreference(selectedEntry));
          }
          this.invalidateTrackDialogCaches();
          this.refreshTrackDialogs();
        }
        return;
      }

      if (selectedEntry.manifestAudioTrackId) {
        this.applyManifestTrackSelection({ audioTrackId: selectedEntry.manifestAudioTrackId });
        if (rememberSelection) {
          this.rememberAudioTrackSelection(this.getAudioTrackPreference(selectedEntry));
        }
        this.invalidateTrackDialogCaches();
        this.renderControlButtons();
        this.renderAudioDialog();
        return;
      }

      if (selectedEntry.implicitAudioTrack) {
        this.selectedAudioTrackIndex = 0;
        this.selectedEmbeddedAudioTrackIndex = -1;
        this.invalidateTrackDialogCaches();
        this.renderControlButtons();
        this.renderAudioDialog();
        return;
      }

      if (Number.isFinite(selectedEntry.embeddedAudioTrackIndex)) {
        if (Environment.isVidaa()) return false;
        const embeddedTrack = this.getEmbeddedAudioTrackByEmbeddedIndex(selectedEntry.embeddedAudioTrackIndex);
        let applied = false;
        if (Environment.isTizen() && typeof PlayerController.isUsingAvPlay === "function" && PlayerController.isUsingAvPlay()) {
          const nativeTrackIndex = Number(embeddedTrack?.nativeTrackIndex);
          applied =
            typeof PlayerController.setAvPlayAudioTrack === "function" && Number.isFinite(nativeTrackIndex)
              ? PlayerController.setAvPlayAudioTrack(nativeTrackIndex)
              : false;
        } else {
          const nativeTrackIndex = Number(embeddedTrack?.nativeTrackIndex);
          const targetTrackIndex =
            Number.isFinite(nativeTrackIndex) && nativeTrackIndex >= 0 ? nativeTrackIndex : selectedEntry.embeddedAudioTrackIndex;
          this.pendingWebOsAudioSelection = {
            selectionKind: "embedded",
            targetTrackIndex,
            selectedTrackIndex: selectedEntry.embeddedAudioTrackIndex,
            entryId: selectedEntry.id || "",
            automaticFallback: Boolean(automaticFallback),
            rememberSelection: Boolean(rememberSelection),
            trackPreference: this.getAudioTrackPreference(selectedEntry)
          };
          applied =
            Environment.isWebOS() && (selectedEntry.canTryAudioConversion || PlayerController.webOsDtsAudioState)
              ? PlayerController.setWebOsAudioTrackWithDtsConversion(
                  embeddedTrack || selectedEntry.track,
                  targetTrackIndex,
                  selectedEntry.embeddedAudioTrackIndex,
                  "embedded",
                  Boolean(selectedEntry.canTryAudioConversion),
                  Boolean(rememberSelection)
                )
              : typeof PlayerController.setWebOsEmbeddedAudioTrack === "function"
                ? PlayerController.setWebOsEmbeddedAudioTrack(targetTrackIndex, selectedEntry.embeddedAudioTrackIndex)
                : false;
        }
        if (applied) {
          if (Environment.isWebOS()) {
            this.invalidateTrackDialogCaches();
            this.renderAudioDialog();
            return;
          }
          this.selectedEmbeddedAudioTrackIndex = selectedEntry.embeddedAudioTrackIndex;
          this.selectedAudioTrackIndex = selectedEntry.embeddedAudioTrackIndex;
          if (rememberSelection) {
            this.rememberAudioTrackSelection(this.getAudioTrackPreference(selectedEntry));
          }
          this.invalidateTrackDialogCaches();
          this.renderControlButtons();
          this.renderAudioDialog();
        } else if (Environment.isWebOS()) {
          this.pendingWebOsAudioSelection = null;
          this.invalidateTrackDialogCaches();
          this.renderAudioDialog();
        }
        return;
      }

      const audioTracks = this.getAudioTracks();
      const entryTrackIndex = Number(selectedEntry.audioTrackIndex);
      if (!audioTracks.length || !Number.isInteger(entryTrackIndex) || entryTrackIndex < 0) {
        return false;
      }
      const resolveVidaaIdentity = Environment.isVidaa();
      // The dialog can still show a snapshot when firmware reorders/replaces
      // AudioTrackList before dispatching change. Its old ordinal is not identity.
      const nativeTrack = selectedEntry.nativeAudioTrack || audioTracks[entryTrackIndex];
      const describeNativeTrack = (track) => ({
        id: cleanDisplayText(track?.id ?? track?.trackId),
        language: normalizeTrackLanguageCode(getUsableAudioTrackLanguageValue(track)),
        label: cleanDisplayText(track?.label || track?.name),
        codec: formatAudioCodecName(getAuthoritativeAudioCodecValue(track))
      });
      const nativeIdentity = resolveVidaaIdentity ? describeNativeTrack(nativeTrack) : null;
      const resolveNativeTrackIndex = () => {
        if (!resolveVidaaIdentity) return entryTrackIndex < audioTracks.length ? entryTrackIndex : -1;
        const currentTracks = this.getAudioTracks();
        const objectIndex = currentTracks.indexOf(nativeTrack);
        if (objectIndex >= 0) return objectIndex;
        if (!nativeIdentity || !Object.values(nativeIdentity).some(Boolean)) return -1;
        const matches = currentTracks.filter((track) => {
          const identity = describeNativeTrack(track);
          return Object.entries(nativeIdentity).every(([key, value]) => !value || identity[key] === value);
        });
        return matches.length === 1 ? currentTracks.indexOf(matches[0]) : -1;
      };
      const nativeTrackIndex = resolveNativeTrackIndex();
      if (nativeTrackIndex < 0) {
        this.syncTrackState();
        this.renderControlButtons();
        this.renderAudioDialog();
        return false;
      }
      this.requestedAudioTrackIndex = nativeTrackIndex;
      const selectionMatches = () => nativeAudioTrackSelectionMatches(this.getAudioTracks(), resolveNativeTrackIndex());
      const usingWebOsNativeAudio = Environment.isWebOS() && PlayerController.isUsingNativePlayback?.();
      // Remember the user's desired language independently of backend success.
      if (rememberSelection && !usingWebOsNativeAudio) {
        this.rememberAudioTrackSelection(this.getAudioTrackPreference(selectedEntry));
      }

      if (usingWebOsNativeAudio) {
        this.pendingWebOsAudioSelection = {
          selectionKind: "native",
          targetTrackIndex: nativeTrackIndex,
          selectedTrackIndex: nativeTrackIndex,
          entryId: selectedEntry.id || "",
          automaticFallback: Boolean(automaticFallback),
          rememberSelection: Boolean(rememberSelection),
          trackPreference: this.getAudioTrackPreference(selectedEntry)
        };
      }
      beginVidaaTrackSwitch(this);
      const controllerResult =
        Environment.isWebOS() && (selectedEntry.canTryAudioConversion || PlayerController.webOsDtsAudioState)
          ? PlayerController.setWebOsAudioTrackWithDtsConversion(
              selectedEntry.track,
              nativeTrackIndex,
              nativeTrackIndex,
              "native",
              Boolean(selectedEntry.canTryAudioConversion),
              Boolean(rememberSelection)
            )
          : typeof PlayerController.setNativeAudioTrack === "function"
            ? PlayerController.setNativeAudioTrack(nativeTrackIndex)
            : false;
      const appliedByController = await Promise.resolve(controllerResult).catch(() => false);
      if (!isCurrentSelection()) return false;
      if (appliedByController || (resolveVidaaIdentity && selectionMatches())) {
        if (usingWebOsNativeAudio) {
          this.invalidateTrackDialogCaches();
          this.renderAudioDialog();
          return;
        }
        if (await confirmNativeTrackSelection(selectionMatches, isCurrentSelection)) {
          this.selectedAudioTrackIndex = resolveNativeTrackIndex();
          this.selectedEmbeddedAudioTrackIndex = -1;
          this.invalidateTrackDialogCaches();
          this.renderControlButtons();
          this.renderAudioDialog();
          return true;
        }
        if (!isCurrentSelection()) return false;
      }
      if (usingWebOsNativeAudio) {
        this.pendingWebOsAudioSelection = null;
        this.invalidateTrackDialogCaches();
        this.renderAudioDialog();
        return;
      }

      if (
        resolveVidaaIdentity &&
        controllerResult &&
        typeof controllerResult.then === "function" &&
        this.getAudioTracks().includes(nativeTrack)
      ) {
        this.syncTrackState();
        this.renderControlButtons();
        this.renderAudioDialog();
        return false;
      }

      const fallbackTracks = resolveVidaaIdentity ? this.getAudioTracks() : audioTracks;
      const fallbackTrackIndex = resolveNativeTrackIndex();
      if (fallbackTrackIndex < 0) {
        this.syncTrackState();
        this.renderControlButtons();
        this.renderAudioDialog();
        return false;
      }
      const rollback = resolveVidaaIdentity
        ? createNativeAudioSelectionRollback(fallbackTracks, {
            preferEnabled: true,
            isCurrent: isCurrentSelection,
            getTracks: () => this.getAudioTracks()
          })
        : null;
      applyNativeAudioTrackFlags(fallbackTracks, fallbackTrackIndex, {
        preferEnabled: resolveVidaaIdentity,
        isCurrent: isCurrentSelection
      });
      const applied = await confirmNativeTrackSelection(selectionMatches, isCurrentSelection);
      if (!isCurrentSelection()) return false;
      if (!applied) {
        rollback?.(this.getAudioTracks());
        this.syncTrackState();
        this.renderControlButtons();
        this.renderAudioDialog();
        return false;
      }
      this.selectedAudioTrackIndex = resolveNativeTrackIndex();
      this.selectedEmbeddedAudioTrackIndex = -1;
      this.invalidateTrackDialogCaches();
      this.renderControlButtons();
      this.renderAudioDialog();
      this.syncStreamAudioDelayEngine();
      return true;
    },
    renderAudioDialog() {
      const dialog = this.uiRefs?.audioDialog;
      if (!dialog) {
        return;
      }

      dialog.classList.toggle("hidden", !this.audioDialogVisible);
      if (!this.audioDialogVisible) {
        dialog.innerHTML = "";
        return;
      }

      const entries = this.getAudioEntries();
      const hasSupportedEntries = entries.some((entry) => entry?.supported !== false || entry?.canTryAudioConversion);
      const supportNotice = this.getAudioDialogSupportNotice();
      const audioControls = [
        {
          id: "amplification",
          title: t("audio_mix_label", {}, "Audio boost"),
          value: `${Math.round(Number(this.audioAmplificationDb || 0))} dB`,
          helper: this.audioAmplificationAvailable
            ? t(
                "audio_mix_range",
                { min: AUDIO_AMPLIFICATION_MIN_DB, max: AUDIO_AMPLIFICATION_MAX_DB },
                `Range ${AUDIO_AMPLIFICATION_MIN_DB}-${AUDIO_AMPLIFICATION_MAX_DB} dB`
              )
            : t("audio_mix_unavailable", {}, "Unavailable on this device"),
          enabled: Boolean(this.audioAmplificationAvailable),
          canDecrease: this.audioAmplificationAvailable && Number(this.audioAmplificationDb || 0) > AUDIO_AMPLIFICATION_MIN_DB,
          canIncrease: this.audioAmplificationAvailable && Number(this.audioAmplificationDb || 0) < AUDIO_AMPLIFICATION_MAX_DB
        },
        {
          id: "persist",
          title: this.persistAudioAmplification
            ? t("audio_mix_persist_on", {}, "Save audio boost: On")
            : t("audio_mix_persist_off", {}, "Save audio boost: Off"),
          value: "",
          helper: t("audio_mix_persist_help", {}, "Remember boost for future playback"),
          enabled: true,
          toggle: true
        }
      ];
      this.audioMixFocusIndex = clamp(this.audioMixFocusIndex, 0, audioControls.length - 1);
      if (!entries.length) {
        this.audioFocusedColumn = "controls";
        const loading =
          this.embeddedAudioLoading || (this.isCurrentSourceAdaptiveManifest() && (this.manifestLoading || this.trackDiscoveryInProgress));
        const emptyMessage = loading ? "Loading audio tracks..." : this.getUnavailableTrackMessage("audio");
        dialog.innerHTML = `
            <div class="player-dialog-title">${escapeHtml(t("audio_dialog_title", {}, "Audio"))}</div>
            ${supportNotice ? `<div class="player-dialog-support-message" role="status">${escapeHtml(supportNotice)}</div>` : ""}
            <div class="player-dialog-empty${loading ? " player-dialog-loading" : ""}">
              ${loading ? renderLoadingIndicator() : ""}
              <span>${escapeHtml(emptyMessage)}</span>
            </div>
            <div class="player-audio-controls-list">
              ${audioControls.map((control, index) => this.renderAudioControlItem(control, index)).join("")}
            </div>
          `;
        return;
      }

      this.audioDialogIndex = clamp(this.audioDialogIndex, 0, entries.length - 1);
      dialog.innerHTML = `
          <div class="player-dialog-title">${escapeHtml(t("audio_dialog_title", {}, "Audio"))}</div>
          ${supportNotice ? `<div class="player-dialog-support-message" role="status">${escapeHtml(supportNotice)}</div>` : ""}
          ${hasSupportedEntries ? "" : `<div class="player-audio-support-message" role="status">${escapeHtml(t("player.audio.noSupportedTracks", {}, "No supported audio tracks available"))}</div>`}
          <div class="player-audio-overlay-grid">
            <div class="player-dialog-list player-audio-track-list">
              ${entries
                .map((entry, index) => {
                  const selected = entry.selected;
                  const focused = this.audioFocusedColumn === "tracks" && index === this.audioDialogIndex;
                  const disabled = entry.supported === false && !entry.canTryAudioConversion;
                  const pending = this.isAudioEntryPending(entry);
                  const conversionFailed =
                    entry.canTryAudioConversion &&
                    PlayerController.hasWebOsDtsAudioConversionFailed?.(
                      entry.track,
                      Number.isFinite(Number(entry.track?.nativeTrackIndex))
                        ? Number(entry.track.nativeTrackIndex)
                        : (entry.embeddedAudioTrackIndex ?? entry.audioTrackIndex)
                    );
                  const unsupportedText = entry.canTryAudioConversion
                    ? t(
                        "player_audio_conversion_warning",
                        {},
                        "Audio may not work on this TV because automatic conversion is unavailable for this track."
                      )
                    : entry.unsupportedReason === "native-track-unavailable"
                      ? t("player_audio_native_selection_unavailable", {}, "This TV does not expose this track for selection.")
                      : entry.unsupportedReason === "tizen-dash-audio"
                        ? t("player_audio_tizen_dash_unsupported", {}, "Changing DASH audio tracks is not supported on this TV.")
                        : t("player.audio.unsupportedCodec", {}, "Codec not supported by this device");
                  const label =
                    disabled && entry.unsupportedReason !== "native-track-unavailable"
                      ? `${entry.label || ""} · ${t("player.audio.unsupported", {}, "Unsupported")}`
                      : entry.label || "";
                  const secondary =
                    disabled || conversionFailed ? [entry.secondary, unsupportedText].filter(Boolean).join(" · ") : entry.secondary || "";
                  return `
                  <div class="player-dialog-item focusable${selected ? " selected" : ""}${focused ? " focused" : ""}${disabled ? " disabled" : ""}${pending ? " pending" : ""}" data-audio-column="tracks" data-audio-index="${index}" aria-disabled="${disabled ? "true" : "false"}" aria-busy="${pending ? "true" : "false"}">
                    <div class="player-dialog-item-main">${escapeHtml(label)}</div>
                    <div class="player-dialog-item-sub">${escapeHtml(secondary)}</div>
                    <div class="player-dialog-item-check">${pending ? "&#8230;" : selected ? "&#10003;" : ""}</div>
                  </div>
                `;
                })
                .join("")}
            </div>
            <div class="player-audio-controls-list">
              ${audioControls.map((control, index) => this.renderAudioControlItem(control, index)).join("")}
            </div>
          </div>
        `;
      this.scrollAudioDialogIntoView();
    }
  };
}
