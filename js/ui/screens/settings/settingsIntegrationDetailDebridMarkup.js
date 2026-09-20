/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

export function renderDebridIntegrationMarkup(model, state) {
  const {
    DEBRID_AUTH_METHODS,
    DebridProviders,
    DEBRID_PREPARE_COUNT_OPTIONS,
    DEBRID_MAX_RESULTS_OPTIONS,
    t,
    escapeHtml,
    maskValue,
    labelForDebridProvider,
    labelForOption,
    debridSortProfileLabel,
    debridSelectionCountLabel,
    debridSizeRangeLabel,
    debridRuleRows
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
  return `
        ${this.renderSectionHeader({ labelKey: "settings.integration.debrid.label", subtitleKey: "settings.integration.debrid.subtitle" })}
        <div class="settings-group-card settings-group-card-fill">
          <div class="settings-stack">
            ${this.renderActionRow({
              focusKey: "integration:back",
              title: t("settings.integration.backToIntegrations.title"),
              subtitle: t("settings.integration.backToIntegrations.subtitle"),
              icon: "back"
            })}
            <div class="settings-group-heading">
              <div class="settings-group-title">${escapeHtml(t("debrid_experimental_notice", {}, "Experimental Direct Debrid integration"))}</div>
            </div>
            ${this.renderToggleRow({
              focusKey: "integration:debrid:cloud",
              title: t("settings.integration.debrid.cloud.title", {}, "Cloud library"),
              subtitle: t("settings.integration.debrid.cloud.subtitle", {}, "Browse and play files already in your connected accounts."),
              checked: canUseCloudLibrary,
              disabled: !hasCloudLibraryProvider
            })}
            ${this.renderToggleRow({
              focusKey: "integration:debrid:enabled",
              title: t("settings.integration.debrid.enable.title", {}, "Resolve playable links"),
              subtitle: t(
                "settings.integration.debrid.enable.subtitle",
                {},
                "Ask a connected service for playable links when a result needs it. This may add the item to that service."
              ),
              checked: canResolvePlayableLinks,
              disabled: !hasResolverProvider
            })}
            ${
              canResolvePlayableLinks && resolverProviders.length > 1 && activeResolverProvider
                ? this.renderActionRow({
                    focusKey: "integration:debrid:provider",
                    title: t("settings.integration.debrid.resolveWith.title", {}, "Resolve with"),
                    subtitle: t(
                      "settings.integration.debrid.resolveWith.subtitle",
                      {},
                      "Choose which connected account handles playable links."
                    ),
                    value: preferredProviderId ? labelForDebridProvider(preferredProviderId) : activeResolverProvider.displayName
                  })
                : ""
            }
            ${
              !hasResolverProvider
                ? `<div class="settings-group-heading"><div class="settings-group-subtitle">${escapeHtml(t("settings.integration.debrid.addKeyFirst", {}, "Connect an account first."))}</div></div>`
                : ""
            }
            <div class="settings-group-heading">
              <div class="settings-group-title">${escapeHtml(t("debrid_section_account", {}, "Account"))}</div>
            </div>
            ${providers
              .map((provider) =>
                this.renderActionRow({
                  focusKey: `integration:debrid:key:${provider.id}`,
                  title: provider.displayName,
                  subtitle:
                    provider.authMethod === DEBRID_AUTH_METHODS.DEVICE_CODE
                      ? t(
                          "debrid_provider_device_description",
                          { provider: provider.displayName },
                          `Link your ${provider.displayName} account in the browser.`
                        )
                      : t(
                          "settings.integration.debrid.providerDescription",
                          { provider: provider.displayName },
                          `Connect your ${provider.displayName} account.`
                        ),
                  value: maskValue(
                    provider.authMethod === DEBRID_AUTH_METHODS.DEVICE_CODE ? "" : DebridProviders.apiKeyFor(model.debrid, provider.id),
                    DebridProviders.apiKeyFor(model.debrid, provider.id)
                      ? t("debrid_connected", {}, "Connected")
                      : t("settings.integration.debrid.notSet", {}, "Not set")
                  ),
                  icon: "chevron"
                })
              )
              .join("")}
            ${
              canResolvePlayableLinks
                ? `
                  <div class="settings-group-heading">
                    <div class="settings-group-title">${escapeHtml(t("debrid_section_instant_playback", {}, "Instant Playback"))}</div>
                  </div>
                  ${this.renderToggleRow({
                    focusKey: "integration:debrid:prepareToggle",
                    title: t("settings.integration.debrid.prepare.title", {}, "Prepare links"),
                    subtitle: t("settings.integration.debrid.prepare.subtitle", {}, "Resolve playable links before playback starts."),
                    checked: Number(model.debrid.instantPlaybackPreparationLimit || 0) > 0
                  })}
                  ${
                    Number(model.debrid.instantPlaybackPreparationLimit || 0) > 0
                      ? this.renderActionRow({
                          focusKey: "integration:debrid:prepareCount",
                          title: t("settings.integration.debrid.prepare.count.title", {}, "Links to prepare"),
                          value: labelForOption(DEBRID_PREPARE_COUNT_OPTIONS, model.debrid.instantPlaybackPreparationLimit, "2 links")
                        })
                      : ""
                  }
                `
                : ""
            }
            <div class="settings-group-heading">
              <div class="settings-group-title">${escapeHtml(t("debrid_section_formatting", {}, "Formatting"))}</div>
            </div>
            ${this.renderActionRow({
              focusKey: "integration:debrid:nameTemplate",
              title: t("settings.integration.debrid.template.name.title", {}, "Stream name pattern"),
              subtitle: t("settings.integration.debrid.template.name.subtitle", {}, "Pattern used to generate Direct Debrid source names."),
              value: t("common.edit", {}, "Edit"),
              disabled: !model.debrid.enabled
            })}
            ${this.renderActionRow({
              focusKey: "integration:debrid:descriptionTemplate",
              title: t("settings.integration.debrid.template.description.title", {}, "Stream description pattern"),
              subtitle: t(
                "settings.integration.debrid.template.description.subtitle",
                {},
                "Pattern used to generate Direct Debrid source details."
              ),
              value: t("common.edit", {}, "Edit"),
              disabled: !model.debrid.enabled
            })}
            ${this.renderActionRow({
              focusKey: "integration:debrid:resetTemplates",
              title: t("settings.integration.debrid.template.reset.title", {}, "Reset formatting"),
              subtitle: t("settings.integration.debrid.template.reset.subtitle", {}, "Restore default source formatting."),
              value: t("settings.integration.debrid.template.reset.value", {}, "Reset"),
              disabled: !model.debrid.enabled
            })}
            ${
              canResolvePlayableLinks
                ? `
                  <div class="settings-group-heading">
                    <div class="settings-group-title">${escapeHtml(t("debrid_section_filters", {}, "Filters"))}</div>
                  </div>
                  ${this.renderActionRow({
                    focusKey: "integration:debrid:maxResults",
                    title: t("settings.integration.debrid.maxResults.title", {}, "Max results"),
                    subtitle: t("settings.integration.debrid.maxResults.subtitle", {}, "Limit how many Direct Debrid sources appear."),
                    value: labelForOption(DEBRID_MAX_RESULTS_OPTIONS, streamPreferences.maxResults, "All streams")
                  })}
                  ${this.renderActionRow({
                    focusKey: "integration:debrid:sort",
                    title: t("settings.integration.debrid.sort.title", {}, "Sort streams"),
                    subtitle: t("settings.integration.debrid.sort.subtitle", {}, "Choose how Direct Debrid sources are ordered."),
                    value: debridSortProfileLabel(streamPreferences.sortCriteria)
                  })}
                  ${this.renderActionRow({
                    focusKey: "integration:debrid:maxPerResolution",
                    title: t("debrid_stream_per_resolution_limit_title", {}, "Per resolution limit"),
                    subtitle: t(
                      "debrid_stream_per_resolution_limit_subtitle",
                      {},
                      "Cap repeated 2160p, 1080p, 720p results after sorting."
                    ),
                    value: labelForOption(DEBRID_MAX_RESULTS_OPTIONS, streamPreferences.maxPerResolution, "All streams")
                  })}
                  ${this.renderActionRow({
                    focusKey: "integration:debrid:maxPerQuality",
                    title: t("debrid_stream_per_quality_limit_title", {}, "Per quality limit"),
                    subtitle: t(
                      "debrid_stream_per_quality_limit_subtitle",
                      {},
                      "Cap repeated BluRay, WEB-DL, REMUX results after sorting."
                    ),
                    value: labelForOption(DEBRID_MAX_RESULTS_OPTIONS, streamPreferences.maxPerQuality, "All streams")
                  })}
                  ${this.renderActionRow({
                    focusKey: "integration:debrid:sizeRange",
                    title: t("debrid_stream_size_range_title", {}, "Size range"),
                    subtitle: t("debrid_stream_size_range_subtitle", {}, "Filter streams by file size."),
                    value: debridSizeRangeLabel(streamPreferences.sizeMinGb, streamPreferences.sizeMaxGb)
                  })}
                  ${debridRuleRows(streamPreferences)
                    .map((row) =>
                      this.renderActionRow({
                        focusKey: `integration:debrid:pref:${row.field}`,
                        title: t(row.titleKey, {}, row.field),
                        subtitle: t(row.subtitleKey, {}, ""),
                        value: debridSelectionCountLabel(row.selectedValues)
                      })
                    )
                    .join("")}
                `
                : ""
            }
          </div>
        </div>
      `;
}
