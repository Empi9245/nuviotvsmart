/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";
import { getAddonSubtitleId, getAddonSubtitleIdentity } from "../../../core/player/subtitleSelectionIdentity.js";

export function createPlayerScreenMethods48() {
  const { PlayerController, t, getEmbeddedSubtitleSupportState, isForcedSubtitleTrack, isForcedAddonSubtitle, formatSubtitleTrackDisplay } =
    internals;

  return {
    getAddonSubtitleIdentity(subtitle, index = 0) {
      return getAddonSubtitleIdentity(subtitle, index);
    },
    setSelectedAddonSubtitle(subtitle, index = 0) {
      this.selectedAddonSubtitleId = subtitle ? getAddonSubtitleId(subtitle, index) : null;
      this.selectedAddonSubtitleIdentity = getAddonSubtitleIdentity(subtitle, index) || null;
    },
    getSelectedAddonSubtitleIndex(subtitles = this.getSubtitleDialogSubtitles()) {
      if (!this.selectedAddonSubtitleId) return -1;
      if (this.selectedAddonSubtitleIdentity) {
        return subtitles.findIndex((subtitle, index) => getAddonSubtitleIdentity(subtitle, index) === this.selectedAddonSubtitleIdentity);
      }
      // Older restored state contains only the addon id. It is safe to resolve
      // that state only when the id names exactly one subtitle.
      const matchingIndexes = [];
      subtitles.forEach((subtitle, index) => {
        if (getAddonSubtitleId(subtitle, index) === String(this.selectedAddonSubtitleId).trim()) matchingIndexes.push(index);
      });
      return matchingIndexes.length === 1 ? matchingIndexes[0] : -1;
    },
    getSubtitleEntries(tab = this.subtitleDialogTab) {
      const textTracks = this.getTextTracks();
      const builtInBoundary = this.resolveBuiltInSubtitleBoundary(textTracks);
      const dashSubtitleTracks = typeof PlayerController.getDashTextTracks === "function" ? PlayerController.getDashTextTracks() : [];
      const selectedDashSubtitleTrack =
        typeof PlayerController.getSelectedDashTextTrackIndex === "function" ? PlayerController.getSelectedDashTextTrackIndex() : -1;
      const avplaySubtitleTracks =
        typeof PlayerController.getAvPlaySubtitleTracks === "function" ? PlayerController.getAvPlaySubtitleTracks() : [];
      const selectedAvPlaySubtitleTrack =
        typeof PlayerController.getSelectedAvPlaySubtitleTrackIndex === "function"
          ? PlayerController.getSelectedAvPlaySubtitleTrackIndex()
          : -1;
      const hlsSubtitleTracks = typeof PlayerController.getHlsSubtitleTracks === "function" ? PlayerController.getHlsSubtitleTracks() : [];
      const selectedHlsSubtitleTrack =
        typeof PlayerController.getSelectedHlsSubtitleTrackIndex === "function" ? PlayerController.getSelectedHlsSubtitleTrackIndex() : -1;
      const embeddedSubtitleTracks = this.shouldUseEmbeddedSubtitleTracks() ? this.embeddedSubtitleTracks : [];
      const hasSelectedAddonSubtitle = Boolean(this.selectedAddonSubtitleId);
      const hasSelectedManifestSubtitle = Boolean(this.selectedManifestSubtitleTrackId);
      const nativeSubtitleSelected = !hasSelectedAddonSubtitle && !hasSelectedManifestSubtitle;

      const builtInTracks = this.dedupeBuiltInSubtitleTracks(
        textTracks.filter((_, index) => index < builtInBoundary),
        embeddedSubtitleTracks
      );
      const addonTracks = textTracks.filter((_, index) => index >= builtInBoundary);
      const trackDiscoveryPending =
        this.embeddedSubtitleLoading ||
        (this.isCurrentSourceAdaptiveManifest() && (this.trackDiscoveryInProgress || this.subtitleLoading || this.manifestLoading));

      if (tab === "builtIn") {
        if (avplaySubtitleTracks.length) {
          const dashTextSwitchingUnsupported = this.isTizenDashSubtitleSwitchingUnsupported();
          return [
            {
              id: "subtitle-off",
              label: t("subtitle_none", {}, "None"),
              secondary: "",
              selected: this.isSubtitleOffEntrySelected(selectedAvPlaySubtitleTrack),
              trackIndex: -1,
              avplaySubtitleTrackIndex: -1
            },
            ...avplaySubtitleTracks.map((track, index) => {
              const mergedTrack = this.mergeAvPlaySubtitleTrackMetadata(track, index);
              const avplayTrackIndex = Number(track?.avplayTrackIndex);
              const normalizedTrackIndex = Number.isFinite(avplayTrackIndex) ? avplayTrackIndex : index;
              const display = formatSubtitleTrackDisplay(mergedTrack, index);
              const unsupportedReason = mergedTrack.unsupportedReason || (mergedTrack.supported === false ? "tizen-tx3g" : null);
              return {
                id: `subtitle-avplay-${normalizedTrackIndex}`,
                label: display.label,
                language: display.language,
                secondary: display.secondary,
                languageKey: display.languageKey,
                languageLabel: display.languageLabel,
                track: mergedTrack,
                isForced: isForcedSubtitleTrack(mergedTrack),
                selected: nativeSubtitleSelected && normalizedTrackIndex === selectedAvPlaySubtitleTrack,
                disabled: dashTextSwitchingUnsupported || mergedTrack.supported === false,
                unsupportedReason: dashTextSwitchingUnsupported ? "tizen-dash-text" : unsupportedReason,
                trackIndex: null,
                avplaySubtitleTrackIndex: normalizedTrackIndex
              };
            })
          ];
        }

        if (dashSubtitleTracks.length) {
          return [
            {
              id: "subtitle-off",
              label: t("subtitle_none", {}, "None"),
              secondary: "",
              selected: this.isSubtitleOffEntrySelected(selectedDashSubtitleTrack),
              trackIndex: -1,
              dashSubtitleTrackIndex: -1
            },
            ...dashSubtitleTracks.map((track, index) => {
              const display = formatSubtitleTrackDisplay(track, index);
              return {
                id: `subtitle-dash-${index}-${track?.id ?? ""}`,
                label: display.label,
                language: display.language,
                secondary: display.secondary,
                languageKey: display.languageKey,
                languageLabel: display.languageLabel,
                track,
                isForced: isForcedSubtitleTrack(track),
                selected: nativeSubtitleSelected && index === selectedDashSubtitleTrack,
                trackIndex: null,
                dashSubtitleTrackIndex: index
              };
            })
          ];
        }

        if (hlsSubtitleTracks.length) {
          return [
            {
              id: "subtitle-off",
              label: t("subtitle_none", {}, "None"),
              secondary: "",
              selected: this.isSubtitleOffEntrySelected(selectedHlsSubtitleTrack),
              trackIndex: -1,
              hlsSubtitleTrackIndex: -1
            },
            ...hlsSubtitleTracks.map((track, index) => {
              const display = formatSubtitleTrackDisplay(track, index);
              return {
                id: `subtitle-hls-${index}-${track?.id ?? track?.name ?? track?.lang ?? ""}`,
                label: display.label,
                language: display.language,
                secondary: display.secondary,
                languageKey: display.languageKey,
                languageLabel: display.languageLabel,
                track,
                isForced: isForcedSubtitleTrack(track),
                selected: nativeSubtitleSelected && index === selectedHlsSubtitleTrack,
                trackIndex: null,
                hlsSubtitleTrackIndex: index
              };
            })
          ];
        }

        const entries = [
          {
            id: "subtitle-off",
            label: t("subtitle_none", {}, "None"),
            secondary: "",
            selected: this.isSubtitleOffEntrySelected(this.selectedSubtitleTrackIndex),
            trackIndex: -1
          },
          ...embeddedSubtitleTracks.map((track, index) => {
            const display = formatSubtitleTrackDisplay(track, index);
            const support = getEmbeddedSubtitleSupportState(track);
            return {
              id: `subtitle-embedded-${track.embeddedTrackIndex}`,
              label: display.label,
              language: display.language,
              secondary: display.secondary,
              languageKey: display.languageKey,
              languageLabel: display.languageLabel,
              track,
              isForced: isForcedSubtitleTrack(track),
              selected: nativeSubtitleSelected && track.embeddedTrackIndex === this.selectedEmbeddedSubtitleTrackIndex,
              disabled: support.supported === false,
              unsupportedReason: support.unsupportedReason,
              trackIndex: null,
              embeddedSubtitleTrackIndex: track.embeddedTrackIndex
            };
          }),
          ...builtInTracks.map((track, index) => {
            const display = formatSubtitleTrackDisplay(track, index);
            const support = getEmbeddedSubtitleSupportState(track);
            return {
              id: `subtitle-built-${index}`,
              label: display.label,
              language: display.language,
              secondary: display.secondary,
              languageKey: display.languageKey,
              languageLabel: display.languageLabel,
              track,
              isForced: isForcedSubtitleTrack(track),
              selected: nativeSubtitleSelected && this.selectedEmbeddedSubtitleTrackIndex < 0 && index === this.selectedSubtitleTrackIndex,
              disabled: support.supported === false,
              unsupportedReason: support.unsupportedReason,
              trackIndex: index
            };
          }),
          ...this.manifestSubtitleTracks.map((track, index) => {
            const display = formatSubtitleTrackDisplay(track, index);
            return {
              id: `subtitle-manifest-${track.id}`,
              label: display.label,
              language: display.language,
              secondary: display.secondary,
              languageKey: display.languageKey,
              languageLabel: display.languageLabel,
              track,
              isForced: isForcedSubtitleTrack(track),
              selected: !hasSelectedAddonSubtitle && this.selectedManifestSubtitleTrackId === track.id,
              trackIndex: null,
              manifestSubtitleTrackId: track.id
            };
          })
        ];

        if (embeddedSubtitleTracks.length || builtInTracks.length || !trackDiscoveryPending) {
          return entries;
        }

        return [
          ...entries,
          {
            id: "subtitle-builtin-loading",
            label: "Loading subtitle tracks...",
            secondary: "",
            selected: false,
            disabled: true,
            trackIndex: null
          }
        ];
      }

      if (tab === "addons") {
        const subtitleSource = this.getSubtitleDialogSubtitles();
        if (subtitleSource.length) {
          const selectedSubtitleIndex = this.getSelectedAddonSubtitleIndex(subtitleSource);
          const seenIdentities = new Set();
          return subtitleSource
            .map((subtitle, index) => {
              const subtitleId = getAddonSubtitleId(subtitle, index);
              const subtitleIdentity = getAddonSubtitleIdentity(subtitle, index);
              if (seenIdentities.has(subtitleIdentity)) return null;
              seenIdentities.add(subtitleIdentity);
              const display = formatSubtitleTrackDisplay(subtitle, index);
              return {
                id: `subtitle-addon-fallback-${subtitleIdentity}`,
                label: display.label,
                language: display.language,
                secondary: subtitle.addonName || t("nav_addons", {}, "Addon"),
                languageKey: display.languageKey,
                languageLabel: display.languageLabel,
                track: subtitle,
                isForced: isForcedAddonSubtitle(subtitle),
                selected: index === selectedSubtitleIndex,
                trackIndex: null,
                subtitleIndex: index,
                subtitleId,
                fallbackAddonSubtitle: true
              };
            })
            .filter(Boolean);
        }
        if (addonTracks.length) {
          return addonTracks.map((track, relativeIndex) => {
            const absoluteIndex = builtInBoundary + relativeIndex;
            const display = formatSubtitleTrackDisplay(track, relativeIndex);
            return {
              id: `subtitle-addon-${absoluteIndex}`,
              label: display.label,
              language: display.language,
              secondary: display.secondary,
              languageKey: display.languageKey,
              languageLabel: display.languageLabel,
              track,
              isForced: isForcedAddonSubtitle(track),
              selected: !hasSelectedAddonSubtitle && absoluteIndex === this.selectedSubtitleTrackIndex,
              trackIndex: absoluteIndex
            };
          });
        }
        if (this.subtitleLoading || this.trackDiscoveryInProgress) {
          return [
            {
              id: "subtitle-addon-loading",
              label: "Loading addon subtitles...",
              secondary: "",
              selected: false,
              disabled: true,
              trackIndex: null
            }
          ];
        }
        return [
          {
            id: "subtitle-addon-empty",
            label: this.getUnavailableTrackMessage("subtitle"),
            secondary: "",
            selected: false,
            disabled: true,
            trackIndex: null
          }
        ];
      }

      if (tab === "style") {
        return [
          {
            id: "subtitle-style-default",
            label: t("subtitle_style_defaults", {}, "Default"),
            secondary: "System style",
            selected: true,
            disabled: true,
            trackIndex: null
          }
        ];
      }

      return [
        {
          id: "subtitle-delay-default",
          label: "0.0s",
          secondary: "Delay control not available in web player",
          selected: true,
          disabled: true,
          trackIndex: null
        }
      ];
    }
  };
}
