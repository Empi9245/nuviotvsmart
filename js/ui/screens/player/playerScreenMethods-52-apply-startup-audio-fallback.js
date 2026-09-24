/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods52() {
  const {
    PlayerController,
    selectStartupAudioFallbackOption,
    resolveSubtitleStyleControlAvailability,
    Environment,
    TizenCapabilities,
    formatSubtitleVerticalOffset,
    normalizeSubtitleTextOpacity,
    SUBTITLE_LANGUAGE_OFF_KEY,
    isAssSubtitleCodec,
    t,
    normalizeComparableText,
    formatSubtitleDelay,
    normalizeSubtitleFontSize,
    normalizeSubtitleLanguageKey,
    subtitleLanguageLabel,
    styleChipLabel
  } = internals;

  return {
    applyStartupAudioFallback() {
      this.clearStartupAudioPreferenceRetry();
      this.startupAudioFallbackApplied = true;
      const fallbackOption = selectStartupAudioFallbackOption(this.collectAudioOptionItems());
      if (!fallbackOption?.entry || !Number.isFinite(fallbackOption.entryIndex)) {
        this.startupAudioPreferenceApplied = true;
        return true;
      }

      if (!fallbackOption.selected) {
        this.startupAudioPreferenceApplying = true;
        try {
          this.applyAudioTrack(fallbackOption.entryIndex, { automaticFallback: true });
        } finally {
          this.startupAudioPreferenceApplying = false;
        }
      }

      if (Environment.isWebOS() && this.pendingWebOsAudioSelection) {
        this.startupAudioPreferenceApplied = false;
        return false;
      }

      // The preferred language is unavailable or discovery hit its bounded limit.
      // If the runtime cannot expose/select tracks, its default first track remains
      // the fallback instead of keeping startup muted indefinitely.
      this.startupAudioPreferenceApplied = true;
      return true;
    },
    findStartupPreferredSubtitleOption(targets = this.getStartupAutoSelectSubtitleLanguageTargets(), mode = "language") {
      const normalizedTargets = Array.isArray(targets) ? targets.filter(Boolean) : [];
      if (!normalizedTargets.length) {
        return null;
      }

      const options = this.collectSubtitleOptionItems().filter((entry) => entry.languageKey !== SUBTITLE_LANGUAGE_OFF_KEY);
      const matchTarget = (entry, target) => this.matchesStartupSubtitleTarget(entry, target);
      const findMatch = (target, { sourceType = null, forced = null } = {}) =>
        options.find((entry) => {
          if (sourceType && entry.sourceType !== sourceType) {
            return false;
          }
          if (forced === true && !entry.isForced) {
            return false;
          }
          if (forced === false && entry.isForced) {
            return false;
          }
          return forced === true ? this.matchesStartupSubtitleTargetForForced(entry, target) : matchTarget(entry, target);
        });

      for (const target of normalizedTargets) {
        if (mode === "audio-forced") {
          const forcedInternal = findMatch(target, { sourceType: "internal", forced: true });
          if (forcedInternal) return forcedInternal;
          if (Environment.isWebOS()) {
            // Android can rely on ExoPlayer's forced flag, while webOS can omit
            // it for embedded tracks. Keep embedded tracks ahead of addons and
            // relax only the regional match for an explicitly forced track.
            const compatibleForcedInternal = options.find(
              (entry) => entry.sourceType === "internal" && entry.isForced && matchTarget(entry, target)
            );
            if (compatibleForcedInternal) return compatibleForcedInternal;
          }
          const forcedAddon = findMatch(target, { sourceType: "addon", forced: true });
          if (forcedAddon) return forcedAddon;
          continue;
        }

        const internalMatch = findMatch(target, { sourceType: "internal", forced: false });
        if (internalMatch) return internalMatch;
        const addonMatch = findMatch(target, { sourceType: "addon", forced: false });
        if (addonMatch) return addonMatch;
      }

      return null;
    },
    matchesStartupSubtitleTarget(entry, target) {
      if (!entry || !target) {
        return false;
      }
      if (target === "forced") {
        return Boolean(entry.isForced);
      }
      if (entry.languageKey === target) {
        return true;
      }
      const targetBase = String(target).split("-")[0];
      const entryBase = String(entry.languageKey || "").split("-")[0];
      if (targetBase && entryBase && targetBase === entryBase) {
        return true;
      }
      const normalizedTitle = normalizeComparableText(entry.title || "");
      const normalizedLabel = normalizeComparableText(entry.languageLabel || "");
      const targetLabel = normalizeComparableText(subtitleLanguageLabel(target));
      return Boolean(targetLabel && (normalizedTitle === targetLabel || normalizedLabel === targetLabel));
    },
    matchesStartupSubtitleTargetForForced(entry, target) {
      if (!entry || !target) {
        return false;
      }
      const normalizedTarget = normalizeSubtitleLanguageKey(target);
      const entryLanguage = normalizeSubtitleLanguageKey(entry.languageKey);
      if (entryLanguage === normalizedTarget) {
        return true;
      }
      if (normalizedTarget.includes("-")) {
        return false;
      }
      return this.matchesStartupSubtitleTarget(entry, normalizedTarget);
    },
    applyStartupSubtitlePreference() {
      if (this.startupSubtitlePreferenceApplied || this.startupSubtitlePreferenceApplying) {
        return false;
      }

      const configuredPreferenceMode = this.getStartupSubtitlePreferenceMode();
      const preferredSubtitleTargets = this.getStartupAutoSelectSubtitleLanguageTargets();
      if (configuredPreferenceMode !== "off" && !this.startupAudioPreferenceApplied && this.isAudioPreferenceDiscoveryPending()) {
        return false;
      }
      const forcedTarget = configuredPreferenceMode === "audio-forced" ? this.getStartupForcedSubtitleLanguageTarget() : null;
      // Match Android TV: forced-only applies when the selected audio already
      // matches the subtitle language; foreign audio uses normal subtitles.
      const preferenceMode = configuredPreferenceMode === "audio-forced" && !forcedTarget ? "language" : configuredPreferenceMode;
      const preferredTargets =
        preferenceMode === "audio-forced" ? (forcedTarget ? [forcedTarget] : preferredSubtitleTargets) : preferredSubtitleTargets;
      const isStillLoading = this.isSubtitlePreferenceDiscoveryPending();

      if (
        this.shouldUseStartupForcedSubtitles() &&
        !this.collectAudioOptionItems().some((entry) => entry.selected && entry.languageKey) &&
        this.isAudioPreferenceDiscoveryPending()
      ) {
        return false;
      }

      if (preferenceMode === "off") {
        if (
          this.selectedSubtitleTrackIndex >= 0 ||
          this.selectedEmbeddedSubtitleTrackIndex >= 0 ||
          this.selectedAddonSubtitleId ||
          this.selectedManifestSubtitleTrackId
        ) {
          const offEntry = this.getSubtitleEntries("builtIn").find((entry) => entry.id === "subtitle-off") || { trackIndex: -1 };
          this.startupSubtitlePreferenceApplying = true;
          try {
            this.applySubtitleEntry(offEntry);
          } finally {
            this.startupSubtitlePreferenceApplying = false;
          }
          this.startupSubtitlePreferenceApplied = true;
          return true;
        }
        if (!isStillLoading) {
          this.startupSubtitlePreferenceApplied = true;
          return true;
        }
        return false;
      }

      const selectedOption = this.collectSubtitleOptionItems().find(
        (entry) => entry.selected && entry.languageKey !== SUBTITLE_LANGUAGE_OFF_KEY
      );
      const preferredOption = this.findStartupPreferredSubtitleOption(preferredTargets, preferenceMode);
      const builtInSubtitleDiscoveryPending = Boolean(
        this.embeddedSubtitleLoading ||
        this.manifestLoading ||
        (this.trackDiscoveryInProgress && (this.canDiscoverEmbeddedSubtitleTracks() || this.isCurrentSourceAdaptiveManifest())) ||
        this.isWebOsEngineFsEmbeddedTrackDiscoveryPending()
      );
      // Android only reaches the addon fallback after its first internal text-track
      // scan. Smart-TV discovery is asynchronous, so do not latch an addon match
      // while a preferred embedded/manifest track can still be discovered.
      if (preferredOption?.sourceType === "addon" && builtInSubtitleDiscoveryPending) {
        return false;
      }
      if (selectedOption && preferredOption?.id === selectedOption.id) {
        this.startupSubtitlePreferenceApplied = true;
        return true;
      }

      if (!preferredOption?.entry) {
        if (!isStillLoading) {
          if (preferenceMode === "audio-forced" || selectedOption) {
            const offEntry = this.getSubtitleEntries("builtIn").find((entry) => entry.id === "subtitle-off") || { trackIndex: -1 };
            this.startupSubtitlePreferenceApplying = true;
            try {
              this.applySubtitleEntry(offEntry);
            } finally {
              this.startupSubtitlePreferenceApplying = false;
            }
          }
          this.startupSubtitlePreferenceApplied = true;
          return true;
        }
        return false;
      }

      this.startupSubtitlePreferenceApplying = true;
      try {
        this.selectSubtitleOption(preferredOption, { focusOptions: false });
      } finally {
        this.startupSubtitlePreferenceApplying = false;
      }

      const appliedOption = this.collectSubtitleOptionItems().find(
        (entry) => entry.selected && entry.languageKey !== SUBTITLE_LANGUAGE_OFF_KEY
      );
      const applied = Boolean(appliedOption && preferredTargets.some((target) => this.matchesStartupSubtitleTarget(appliedOption, target)));
      this.startupSubtitlePreferenceApplied = applied;
      return applied;
    },
    getSubtitleStyleControls() {
      const style = this.subtitleStyleSettings || {};
      const selectedEmbeddedTrack = this.webOsEmbeddedTextSubtitleTrack;
      const embeddedAssStyleManaged = Boolean(
        Environment.isWebOS() &&
        Number(this.selectedEmbeddedSubtitleTrackIndex) >= 0 &&
        selectedEmbeddedTrack &&
        (isAssSubtitleCodec(selectedEmbeddedTrack.codec) ||
          isAssSubtitleCodec(selectedEmbeddedTrack.codec_name) ||
          isAssSubtitleCodec(selectedEmbeddedTrack.codecId) ||
          /\bASS\b|\bSSA\b/i.test(String(selectedEmbeddedTrack.name || "")))
      );
      const assStylesManaged = Boolean(
        this.webOsEmbeddedTextSubtitleUsingAss || this.isAssAddonSubtitleActive() || embeddedAssStyleManaged
      );
      const htmlRendererActive = Boolean(
        this.webOsEmbeddedTextSubtitleUsingAss ||
        this.isAssAddonSubtitleActive() ||
        (this.htmlSubtitleSelectedId &&
          ((Array.isArray(this.htmlSubtitleCues) && this.htmlSubtitleCues.length > 0) ||
            PlayerController.shouldRenderAvPlaySubtitleCallbacksInHtml?.()))
      );
      const usingTizenAvPlay = Boolean(Environment.isTizen() && PlayerController.isUsingAvPlay?.());
      const rendererMode = htmlRendererActive ? "html" : PlayerController.getAvPlaySubtitleOutputMode?.() || "none";
      const usingWebOsNative = Boolean(Environment.isWebOS() && PlayerController.isUsingNativePlayback?.() && !htmlRendererActive);
      const availability = resolveSubtitleStyleControlAvailability({
        isTizenAvPlay: usingTizenAvPlay,
        isWebOsNative: usingWebOsNative,
        rendererMode,
        supportsExternalDelay: PlayerController.supportsAvPlayExternalSubtitleDelay?.() === true,
        preserveAssStyles: assStylesManaged
      });
      const unavailableValue = assStylesManaged
        ? t("subtitle_style_preserves_ass", {}, "ASS/SSA styles are preserved")
        : TizenCapabilities.isAdvancedSubtitleStylingLimited()
          ? t("player_subtitle_tizen_advanced_unavailable_short", {}, "Not fully supported on this TV")
          : t("subtitle_style_unavailable_native", {}, "Unavailable with native subtitles");
      return [
        {
          id: "delay",
          label: t("subtitle_tab_delay", {}, "Delay"),
          value: formatSubtitleDelay(this.subtitleDelayMs)
        },
        {
          id: "fontSize",
          label: t("subtitle_style_font_size", {}, "Font Size"),
          value: `${normalizeSubtitleFontSize(style.fontSize)}%`
        },
        {
          id: "bold",
          label: t("subtitle_style_bold", {}, "Bold"),
          value: style.bold ? t("subtitle_style_on", {}, "On") : t("subtitle_style_off", {}, "Off")
        },
        {
          id: "textColor",
          label: t("subtitle_style_text_color", {}, "Text Color"),
          value: styleChipLabel(style.textColor || "#FFFFFF")
        },
        {
          id: "textOpacity",
          label: t("subtitle_style_text_opacity", {}, "Text Opacity"),
          value: `${normalizeSubtitleTextOpacity(style.textOpacity)}%`
        },
        {
          id: "outlineEnabled",
          label: t("subtitle_style_outline", {}, "Outline"),
          value: style.outlineEnabled ? t("subtitle_style_on", {}, "On") : t("subtitle_style_off", {}, "Off")
        },
        {
          id: "outlineColor",
          label: t("subtitle_style_outline_color", {}, "Outline Color"),
          value: styleChipLabel(style.outlineColor || "#000000")
        },
        {
          id: "verticalOffset",
          label: t("subtitle_style_bottom_offset", {}, "Bottom Offset"),
          value: formatSubtitleVerticalOffset(style.verticalOffset)
        },
        { id: "reset", label: t("subtitle_style_defaults", {}, "Reset Defaults"), value: "" }
      ].map((item) => {
        const disabled = availability[item.id] === false;
        return {
          ...item,
          disabled,
          value: disabled ? unavailableValue : item.value
        };
      });
    },
    schedulePersistPlayerPresentationSettings(delayMs = 400) {
      clearTimeout(this.persistSettingsTimer);
      this.persistSettingsTimer = setTimeout(() => {
        this.persistSettingsTimer = null;
        this.persistPlayerPresentationSettings();
      }, delayMs);
    },
    flushPersistPlayerPresentationSettings() {
      if (this.persistSettingsTimer) {
        clearTimeout(this.persistSettingsTimer);
        this.persistSettingsTimer = null;
        this.persistPlayerPresentationSettings();
      }
    }
  };
}
