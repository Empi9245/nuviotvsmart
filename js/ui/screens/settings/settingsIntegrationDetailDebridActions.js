/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

export function registerDebridIntegrationActions(model, state) {
  const {
    DEBRID_SETTINGS_DEFAULTS,
    DEBRID_SORT_PROFILES,
    DebridSettingsStore,
    DEBRID_AUTH_METHODS,
    DebridProviders,
    DEBRID_PREPARE_COUNT_OPTIONS,
    DEBRID_MAX_RESULTS_OPTIONS,
    DEBRID_SORT_PROFILE_OPTIONS,
    DEBRID_SIZE_RANGE_OPTIONS,
    DEBRID_MIN_QUALITY_OPTIONS,
    DEBRID_FEATURE_FILTER_OPTIONS,
    DEBRID_CODEC_OPTIONS,
    t,
    debridSortProfileFor,
    debridSizeRangeId,
    debridSizeRangeLabel,
    debridRuleRows,
    validateDebridApiKey
  } = internals;
  const {
    providers,
    configuredProviders,
    resolverProviders,
    activeResolverProvider,
    hasResolverProvider,
    canResolvePlayableLinks,
    hasCloudLibraryProvider,
    canUseCloudLibrary,
    streamPreferences,
    resolverOptions,
    preferredProviderId
  } = state;
  this.actionMap.set("integration:debrid:enabled", () => {
    if (!hasResolverProvider) return;
    DebridSettingsStore.set({ enabled: !DebridSettingsStore.get().enabled });
  });
  this.actionMap.set("integration:debrid:cloud", () => {
    if (!hasCloudLibraryProvider) return;
    DebridSettingsStore.set({
      cloudLibraryEnabled: !DebridSettingsStore.get().cloudLibraryEnabled
    });
  });
  this.actionMap.set("integration:debrid:provider", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.resolveWith.title", {}, "Resolve with"),
      options: resolverOptions,
      selectedId: preferredProviderId,
      returnFocusKey: "integration:debrid:provider",
      onSelect: (option) => {
        DebridSettingsStore.set({ preferredResolverProviderId: String(option.id || "") });
      }
    });
  });
  providers.forEach((provider) => {
    this.actionMap.set(`integration:debrid:key:${provider.id}`, () => {
      if (provider.authMethod === DEBRID_AUTH_METHODS.DEVICE_CODE) {
        this.openDebridDeviceAuthDialog(provider);
        return;
      }
      const current = DebridProviders.apiKeyFor(DebridSettingsStore.get(), provider.id);
      this.openTextDialog({
        title: t("settings.integration.debrid.apiKey.prompt", { provider: provider.displayName }, `${provider.displayName} API key`),
        value: current,
        returnFocusKey: `integration:debrid:key:${provider.id}`,
        onSubmit: async (value) => {
          const trimmed = String(value || "").trim();
          if (trimmed && !(await validateDebridApiKey(provider.id, trimmed))) {
            window.alert?.(t("settings.integration.debrid.apiKey.invalid", {}, "Invalid Debrid API key."));
            return false;
          }
          DebridSettingsStore.setProviderApiKey(provider.id, trimmed);
          return true;
        }
      });
    });
  });
  this.actionMap.set("integration:debrid:prepareToggle", () => {
    const enabled = Number(DebridSettingsStore.get().instantPlaybackPreparationLimit || 0) > 0;
    DebridSettingsStore.set({ instantPlaybackPreparationLimit: enabled ? 0 : 2 });
  });
  this.actionMap.set("integration:debrid:prepareCount", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.prepare.count.title", {}, "Links to prepare"),
      options: DEBRID_PREPARE_COUNT_OPTIONS,
      selectedId: model.debrid.instantPlaybackPreparationLimit,
      returnFocusKey: "integration:debrid:prepareCount",
      onSelect: (option) => DebridSettingsStore.set({ instantPlaybackPreparationLimit: Number(option.id || 0) })
    });
  });
  this.actionMap.set("integration:debrid:maxResults", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.maxResults.title", {}, "Max results"),
      options: DEBRID_MAX_RESULTS_OPTIONS,
      selectedId: streamPreferences.maxResults,
      returnFocusKey: "integration:debrid:maxResults",
      onSelect: (option) => DebridSettingsStore.setStreamMaxResults(Number(option.id || 0))
    });
  });
  this.actionMap.set("integration:debrid:sort", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.sort.title", {}, "Sort streams"),
      options: DEBRID_SORT_PROFILE_OPTIONS,
      selectedId: debridSortProfileFor(streamPreferences.sortCriteria),
      returnFocusKey: "integration:debrid:sort",
      onSelect: (option) =>
        DebridSettingsStore.setStreamPreferences({
          ...DebridSettingsStore.get().streamPreferences,
          sortCriteria: DEBRID_SORT_PROFILES[option.id] || []
        })
    });
  });
  this.actionMap.set("integration:debrid:minQuality", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.minQuality.title", {}, "Minimum quality"),
      options: DEBRID_MIN_QUALITY_OPTIONS,
      selectedId: model.debrid.streamMinimumQuality,
      returnFocusKey: "integration:debrid:minQuality",
      onSelect: (option) => DebridSettingsStore.setStreamMinimumQuality(option.id)
    });
  });
  this.actionMap.set("integration:debrid:dv", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.dolbyVision.title", {}, "Dolby Vision"),
      options: DEBRID_FEATURE_FILTER_OPTIONS,
      selectedId: model.debrid.streamDolbyVisionFilter,
      returnFocusKey: "integration:debrid:dv",
      onSelect: (option) => DebridSettingsStore.setStreamDolbyVisionFilter(option.id)
    });
  });
  this.actionMap.set("integration:debrid:hdr", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.hdr.title", {}, "HDR"),
      options: DEBRID_FEATURE_FILTER_OPTIONS,
      selectedId: model.debrid.streamHdrFilter,
      returnFocusKey: "integration:debrid:hdr",
      onSelect: (option) => DebridSettingsStore.setStreamHdrFilter(option.id)
    });
  });
  this.actionMap.set("integration:debrid:codec", () => {
    this.openOptionDialog({
      title: t("settings.integration.debrid.codec.title", {}, "Codec"),
      options: DEBRID_CODEC_OPTIONS,
      selectedId: model.debrid.streamCodecFilter,
      returnFocusKey: "integration:debrid:codec",
      onSelect: (option) => DebridSettingsStore.setStreamCodecFilter(option.id)
    });
  });
  this.actionMap.set("integration:debrid:maxPerResolution", () => {
    this.openOptionDialog({
      title: t("debrid_stream_per_resolution_limit_title", {}, "Per resolution limit"),
      options: DEBRID_MAX_RESULTS_OPTIONS,
      selectedId: streamPreferences.maxPerResolution,
      returnFocusKey: "integration:debrid:maxPerResolution",
      onSelect: (option) =>
        DebridSettingsStore.setStreamPreferences({
          ...DebridSettingsStore.get().streamPreferences,
          maxPerResolution: Number(option.id || 0)
        })
    });
  });
  this.actionMap.set("integration:debrid:maxPerQuality", () => {
    this.openOptionDialog({
      title: t("debrid_stream_per_quality_limit_title", {}, "Per quality limit"),
      options: DEBRID_MAX_RESULTS_OPTIONS,
      selectedId: streamPreferences.maxPerQuality,
      returnFocusKey: "integration:debrid:maxPerQuality",
      onSelect: (option) =>
        DebridSettingsStore.setStreamPreferences({
          ...DebridSettingsStore.get().streamPreferences,
          maxPerQuality: Number(option.id || 0)
        })
    });
  });
  this.actionMap.set("integration:debrid:sizeRange", () => {
    this.openOptionDialog({
      title: t("debrid_stream_size_range_title", {}, "Size range"),
      options: DEBRID_SIZE_RANGE_OPTIONS.map((option) => ({
        ...option,
        label: debridSizeRangeLabel(option.min, option.max)
      })),
      selectedId: debridSizeRangeId(streamPreferences),
      returnFocusKey: "integration:debrid:sizeRange",
      onSelect: (option) =>
        DebridSettingsStore.setStreamPreferences({
          ...DebridSettingsStore.get().streamPreferences,
          sizeMinGb: option.min,
          sizeMaxGb: option.max
        })
    });
  });
  debridRuleRows(streamPreferences).forEach((row) => {
    this.actionMap.set(`integration:debrid:pref:${row.field}`, () => {
      if (row.textList) {
        this.openTextDialog({
          title: t(row.dialogTitleKey, {}, row.field),
          value: row.selectedValues.join("\n"),
          multiline: true,
          returnFocusKey: `integration:debrid:pref:${row.field}`,
          onSubmit: (value) => {
            const values = String(value || "")
              .split(/[\n,]/)
              .map((entry) => entry.trim())
              .filter(Boolean)
              .filter((entry, index, array) => array.indexOf(entry) === index);
            DebridSettingsStore.setStreamPreferences({
              ...DebridSettingsStore.get().streamPreferences,
              [row.field]: values
            });
            return true;
          }
        });
        return;
      }
      this.openMultiChoiceDialog({
        title: t(row.dialogTitleKey, {}, row.field),
        options: row.options,
        selectedIds: row.selectedValues,
        returnFocusKey: `integration:debrid:pref:${row.field}`,
        onToggle: (selectedIds) => {
          DebridSettingsStore.setStreamPreferences({
            ...DebridSettingsStore.get().streamPreferences,
            [row.field]: selectedIds.length ? selectedIds : row.defaultWhenEmpty || []
          });
        }
      });
    });
  });
  this.actionMap.set("integration:debrid:nameTemplate", () => {
    this.openTextDialog({
      title: t("settings.integration.debrid.template.name.prompt", {}, "Stream name pattern"),
      value: DebridSettingsStore.get().streamNameTemplate || DEBRID_SETTINGS_DEFAULTS.streamNameTemplate,
      returnFocusKey: "integration:debrid:nameTemplate",
      onSubmit: (value) => {
        DebridSettingsStore.set({ streamNameTemplate: String(value) });
        return true;
      }
    });
  });
  this.actionMap.set("integration:debrid:descriptionTemplate", () => {
    this.openTextDialog({
      title: t("settings.integration.debrid.template.description.prompt", {}, "Stream description pattern"),
      value: DebridSettingsStore.get().streamDescriptionTemplate ?? DEBRID_SETTINGS_DEFAULTS.streamDescriptionTemplate,
      multiline: true,
      returnFocusKey: "integration:debrid:descriptionTemplate",
      onSubmit: (value) => {
        DebridSettingsStore.set({ streamDescriptionTemplate: String(value) });
        return true;
      }
    });
  });
  this.actionMap.set("integration:debrid:resetTemplates", () => {
    DebridSettingsStore.set({
      streamNameTemplate: DEBRID_SETTINGS_DEFAULTS.streamNameTemplate,
      streamDescriptionTemplate: DEBRID_SETTINGS_DEFAULTS.streamDescriptionTemplate
    });
  });
}
