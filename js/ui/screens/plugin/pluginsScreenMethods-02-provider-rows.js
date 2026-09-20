/* eslint-disable no-unused-vars */
import * as internals from "./pluginsScreen.js";

export function createPluginsScreenMethods02() {
  const {
    isExternalDexRepository,
    PLUGIN_REPOSITORY_TYPES,
    t,
    escapeHtml,
    dateLabel,
    repositoryTypeLabel,
    button,
    toggleButton,
    providerTypeBadge
  } = internals;

  return {
    providerRows(repository, model, { flat = false, providers: providerOverride = null } = {}) {
      const externalDex = isExternalDexRepository(repository);
      const providers = Array.isArray(providerOverride) ? providerOverride : this.visibleProviders(repository.id, model);
      if (!providers.length) {
        const metadataCount = Array.isArray(repository.metadata?.pluginLists) ? repository.metadata.pluginLists.length : 0;
        return `<p class="plugins-empty-copy">${escapeHtml(
          externalDex && metadataCount
            ? t(
                "plugin_external_lists_count",
                { count: metadataCount },
                `${metadataCount} external plugin lists synced; binaries are not executed.`
              )
            : t("plugin_no_provider_code", {}, "No executable providers are available from this repository.")
        )}</p>`;
      }
      const rows = providers
        .map((provider) => {
          const executable =
            !externalDex && repository.type === PLUGIN_REPOSITORY_TYPES.NUVIO_JS && provider.type === PLUGIN_REPOSITORY_TYPES.NUVIO_JS;
          const runtimeUnavailable = executable && model.runtime?.executable !== true;
          const toggleDisabled = !this.editable(model) || !executable || runtimeUnavailable;
          const enabled = executable && provider.enabled !== false;
          const unavailable = executable && provider.codeAvailable === false;
          const testable = executable && provider.enabled !== false && !runtimeUnavailable && !unavailable && !this.busy;
          const testResult = this.testResult?.scraperId === provider.id ? this.testResult : null;
          const testStreams = Array.isArray(testResult?.results) ? testResult.results : [];
          const typeBadges = (provider.supportedTypes || []).map(providerTypeBadge).join("");
          const diagnostics = Array.isArray(testResult?.diagnostics?.steps) ? testResult.diagnostics.steps : [];
          const diagnosticsExpanded = this.diagnosticsProviderId === provider.id;
          return `
              <article class="plugins-provider-card">
                <div class="plugins-provider-row">
                <div class="plugins-provider-copy">
                  <div class="plugins-provider-title-row">
                    <strong>${escapeHtml(provider.name)}</strong>
                    ${typeBadges}
                  </div>
                  <span class="plugins-provider-version">${escapeHtml(
                    t("plugin_version", { version: provider.version }, `Version ${provider.version}`)
                  )}</span>
                  ${
                    unavailable
                      ? `<span>${escapeHtml(
                          t("plugin_code_unavailable", {}, "Code unavailable; the previous cached version is retained if present.")
                        )}</span>`
                      : executable
                        ? ""
                        : `<span>${escapeHtml(t("plugin_external_metadata_only", {}, "Metadata only; never executed on Web TV"))}</span>`
                  }
                </div>
                ${
                  executable
                    ? `<div class="plugins-provider-actions">
                  ${button({
                    focusKey: `test:${provider.id}`,
                    action: `test-scraper:${provider.id}`,
                    label: t("plugin_test_btn", {}, "Test"),
                    icon: "play_arrow",
                    disabled: !testable,
                    focusableWhileBusy: this.busy,
                    loading: this.busyAction === `test-scraper:${provider.id}`
                  })}
                  ${
                    model.readOnly
                      ? ""
                      : toggleButton({
                          focusKey: `scraper:${provider.id}`,
                          action: `toggle-scraper:${provider.id}`,
                          checked: enabled,
                          disabled: toggleDisabled,
                          focusableWhileBusy: this.busy
                        })
                  }
                </div>`
                    : `<span class="plugins-provider-badge">${escapeHtml(t("plugin_metadata_only", {}, "Metadata only"))}</span>`
                }
                </div>
              ${
                testResult
                  ? `<div class="plugins-test-result">
                <strong>${escapeHtml(t("plugin_test_results", { count: testStreams.length }, `Test results (${testStreams.length} streams)`))}</strong>
                ${
                  testStreams.length
                    ? testStreams
                        .slice(0, 3)
                        .map(
                          (stream) =>
                            `<span>${escapeHtml([stream.title || stream.name || "", stream.quality || ""].filter(Boolean).join(" · "))}</span>`
                        )
                        .join("")
                    : `<span>${escapeHtml(t("plugin_test_no_results", {}, "No results found"))}</span>`
                }
                ${
                  testStreams.length > 3
                    ? `<span>${escapeHtml(
                        t("plugin_and_more", { count: testStreams.length - 3 }, `… and ${testStreams.length - 3} more`)
                      )}</span>`
                    : ""
                }
                ${
                  diagnostics.length
                    ? `<button class="plugins-test-diagnostics-toggle plugins-focusable focusable"
                        data-focus-key="diagnostics:${provider.id}"
                        data-action="toggle-diagnostics:${provider.id}"
                        aria-expanded="${diagnosticsExpanded ? "true" : "false"}">
                        ${escapeHtml(
                          t(
                            diagnosticsExpanded ? "plugin_diagnostics_collapse" : "plugin_diagnostics_expand",
                            {},
                            diagnosticsExpanded ? "Diagnostics (tap to collapse)" : "Diagnostics (tap to expand)"
                          )
                        )}
                      </button>
                      ${diagnosticsExpanded ? `<pre class="plugins-test-diagnostics">${escapeHtml(diagnostics.join("\n"))}</pre>` : ""}`
                    : ""
                }
              </div>`
                  : ""
              }
              </article>
            `;
        })
        .join("");
      return flat
        ? rows
        : `
          <div class="plugins-provider-list">
            ${rows}
          </div>
        `;
    },
    providerSection(model) {
      const repositoriesById = new Map((model.repositories || []).map((repository) => [repository.id, repository]));
      const providers = (model.scrapers || []).filter(
        (provider) => repositoriesById.has(provider.repositoryId) && (!model.readOnly || provider.enabled !== false)
      );
      if (!providers.length) return "";
      const rows = providers
        .map((provider) =>
          this.providerRows(repositoriesById.get(provider.repositoryId), model, {
            flat: true,
            providers: [provider]
          })
        )
        .join("");
      return `
          <section class="plugins-provider-section">
            <div class="plugins-section-heading">
              <div>
                <h2>${escapeHtml(t("plugin_providers_section", { count: providers.length }, `Providers (${providers.length})`))}</h2>
              </div>
            </div>
            <div class="plugins-provider-list plugins-provider-section-list">${rows}</div>
          </section>
        `;
    },
    repositoryCard(repository, model) {
      const providers = this.visibleProviders(repository.id, model);
      const externalDex = isExternalDexRepository(repository);
      const executable = !externalDex && repository.type === PLUGIN_REPOSITORY_TYPES.NUVIO_JS;
      const runtimeUnavailable = executable && model.runtime?.executable !== true;
      const metadataRefreshable = externalDex && !/\.cs3(?:$|[?#])/i.test(repository.url || "");
      const editable = this.editable(model);
      const allEnabled = providers.some((entry) => entry.type === PLUGIN_REPOSITORY_TYPES.NUVIO_JS && entry.enabled !== false);
      const unavailableCount = providers.filter(
        (entry) => entry.type === PLUGIN_REPOSITORY_TYPES.NUVIO_JS && entry.codeAvailable === false
      ).length;
      const providerCount = Math.max(Number(repository.scraperCount) || 0, providers.length);
      const updated = dateLabel(repository.lastUpdated);
      // Opaque/read-only rows have no actionable descendant. Keep the row in the
      // D-pad focus graph so the scroll container can reveal it without enabling
      // an unsafe repository mutation.
      const focusProxy = model.readOnly || repository.type === PLUGIN_REPOSITORY_TYPES.UNKNOWN;
      return `
          <article class="plugins-repository-card${executable ? (runtimeUnavailable ? " is-runtime-unavailable" : "") : " is-metadata-only"}${focusProxy ? " plugins-repository-focus-proxy plugins-focusable focusable" : ""}"
                   ${focusProxy ? `data-focus-key="${escapeHtml(`repository:${repository.id}`)}" tabindex="0"` : ""}>
            <div class="plugins-repository-header">
              <div class="plugins-repository-copy">
                <h2>${escapeHtml(repository.name)}</h2>
                ${
                  externalDex
                    ? `<p class="plugins-repository-type">${escapeHtml(repositoryTypeLabel(PLUGIN_REPOSITORY_TYPES.EXTERNAL_DEX))}</p>`
                    : ""
                }
                ${
                  runtimeUnavailable
                    ? model.runtime?.supportLevel !== "unsupported"
                      ? `<p class="plugins-warning">${escapeHtml(t("plugin_tv_model_unsupported", {}, "Plugins are not available on this TV model. Add-ons, playback, library, and sync remain available."))}</p>`
                      : ""
                    : ""
                }
                ${
                  externalDex
                    ? `<p class="plugins-warning">${escapeHtml(t("plugin_dex_unsupported", {}, "CloudStream/DEX plugins are not supported on Web TV."))}</p>`
                    : repository.type === PLUGIN_REPOSITORY_TYPES.UNKNOWN
                      ? `<p class="plugins-warning">${escapeHtml(t("plugin_unknown_preserved", {}, "Repository type is unknown; it is preserved and disabled until it can be identified safely."))}</p>`
                      : ""
                }
                <p class="plugins-repository-meta">${escapeHtml(
                  executable
                    ? t("plugin_providers_count", { count: providerCount }, `${providerCount} providers`)
                    : t("plugin_external_preserved", {}, "Synced and preserved without downloading or converting DEX code")
                )}${updated ? ` · ${escapeHtml(t("plugin_updated_format", { date: updated }, `Updated: ${updated}`))}` : ""}</p>
                ${unavailableCount ? `<p class="plugins-warning">${escapeHtml(t("plugin_unavailable_count", { count: unavailableCount }, `${unavailableCount} provider code item(s) could not be refreshed`))}</p>` : ""}
              </div>
              ${
                model.readOnly
                  ? ""
                  : `<div class="plugins-repository-actions">
                ${
                  executable
                    ? button({
                        focusKey: `all:${repository.id}`,
                        action: `toggle-all:${repository.id}:${allEnabled ? "0" : "1"}`,
                        label: allEnabled ? t("plugin_disable_all", {}, "Disable all") : t("plugin_enable_all", {}, "Enable all"),
                        icon: allEnabled ? "visibility_off" : "visibility",
                        disabled: !editable || runtimeUnavailable,
                        focusableWhileBusy: this.busy
                      })
                    : ""
                }
                ${
                  executable || metadataRefreshable
                    ? button({
                        focusKey: `refresh:${repository.id}`,
                        action: `refresh:${repository.id}`,
                        label: t("settings.plugins.refreshRepository", {}, "Refresh repository"),
                        icon: "refresh",
                        disabled: !editable,
                        focusableWhileBusy: this.busy
                      })
                    : ""
                }
                ${button({
                  focusKey: `remove:${repository.id}`,
                  action: `remove:${repository.id}`,
                  label: t("settings.plugins.removeRepository", {}, "Remove repository"),
                  icon: "delete",
                  disabled: !editable || repository.type === PLUGIN_REPOSITORY_TYPES.UNKNOWN,
                  focusableWhileBusy: this.busy,
                  destructive: true
                })}
              </div>`
              }
            </div>
          </article>
        `;
    }
  };
}
