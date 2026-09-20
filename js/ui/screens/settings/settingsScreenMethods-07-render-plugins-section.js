/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

export function createSettingsScreenMethods07() {
  const { Router, ExperienceModeStore, PluginManager, SECTION_META, t, arePluginsSupported, escapeHtml } = internals;

  return {
    renderPluginsSection(model = {}) {
      if (!arePluginsSupported()) {
        return "";
      }
      const summary = model.pluginSummary || PluginManager.getSummary();
      const runtime = summary.runtime || {};
      this.actionMap.set("plugins:open", async () => {
        await Router.navigate("plugins");
      });
      return `
          ${this.renderSectionHeader(SECTION_META.find((item) => item.id === "plugins"))}
          <div class="settings-group-card">
            <div class="settings-stack">
              ${this.renderActionRow({
                focusKey: "plugins:open",
                title: t("plugin_title", {}, "Plugins"),
                subtitle: t("settings.plugins.openSubtitle", {}, "Manage executable Nuvio JS providers and preserved external metadata"),
                value: `${Number(summary.repositories?.length || 0)} · ${Number(summary.scrapers?.length || 0)}`,
                icon: "chevron"
              })}
              <div class="settings-subsection-card">
                <div class="settings-group-heading">
                  <div>
                    <div class="settings-group-title">${escapeHtml(t("plugin_runtime_heading", {}, "TV plugin runtime"))}</div>
                    <div class="settings-group-subtitle">${escapeHtml(runtime.executable ? t("plugin_runtime_ready", {}, "Runtime ready") : runtime.reason || t("plugin_runtime_unsupported", {}, "Execution unavailable on this TV runtime"))}</div>
                  </div>
                  <span class="settings-row-value">${escapeHtml(t("plugin_providers_count", { count: Number(summary.scrapers?.length || 0) }, `${Number(summary.scrapers?.length || 0)} providers`))}</span>
                </div>
              </div>
              <p class="settings-row-subtitle">${escapeHtml(t("plugin_runtime_tv_only", {}, "Only Nuvio JS repositories execute. CloudStream DEX and legacy URL-template sources are retained for display but never executed or converted."))}</p>
            </div>
          </div>
        `;
    },
    renderContentDiscoverySection() {
      this.actionMap.set("contentDiscovery:addons", async () => {
        await Router.navigate("plugin");
      });
      if (arePluginsSupported()) {
        this.actionMap.set("contentDiscovery:plugins", async () => {
          await Router.navigate("plugins");
        });
      }

      return `
          ${this.renderSectionHeader(SECTION_META.find((item) => item.id === "contentDiscovery"))}
          <div class="settings-group-card">
            <div class="settings-stack">
              ${this.renderActionRow({
                focusKey: "contentDiscovery:addons",
                title: t("addon_title", {}, "Addons"),
                subtitle: t("settings.contentDiscovery.addonsSubtitle", {}, "Manage add-ons, catalog order, and collections"),
                leadingIcon: "grid_view"
              })}
              ${
                ExperienceModeStore.isEssential() || !arePluginsSupported()
                  ? ""
                  : this.renderActionRow({
                      focusKey: "contentDiscovery:plugins",
                      title: t("plugin_title", {}, "Plugins"),
                      subtitle: t("settings.contentDiscovery.pluginsSubtitle", {}, "Manage repositories and stream providers"),
                      leadingIcon: "build"
                    })
              }
            </div>
          </div>
        `;
    },
    renderIntegrationHub() {
      this.actionMap.set("integration:hub:debrid", () => {
        this.integrationView = "debrid";
        this.contentFocusKey = "integration:back";
      });
      this.actionMap.set("integration:hub:tmdb", () => {
        this.integrationView = "tmdb";
        this.contentFocusKey = "integration:back";
      });
      this.actionMap.set("integration:hub:mdblist", () => {
        this.integrationView = "mdblist";
        this.contentFocusKey = "integration:back";
      });
      this.actionMap.set("integration:hub:animeskip", () => {
        this.integrationView = "animeskip";
        this.contentFocusKey = "integration:back";
      });

      return `
            ${this.renderSectionHeader(SECTION_META.find((item) => item.id === "integration"))}
            <div class="settings-group-card settings-group-card-fill">
              <div class="settings-stack">
                ${this.renderActionRow({
                  focusKey: "integration:hub:debrid",
                  title: t("settings.integration.debrid.label", {}, "Debrid"),
                  subtitle: t("settings.integration.debrid.subtitle", {}, "Connect accounts for links and library access")
                })}
                ${this.renderActionRow({
                  focusKey: "integration:hub:tmdb",
                  title: t("settings.integration.tmdb.label"),
                  subtitle: t("settings.integration.tmdb.subtitle")
                })}
                ${this.renderActionRow({
                  focusKey: "integration:hub:mdblist",
                  title: t("settings.integration.mdblist.label"),
                  subtitle: t("settings.integration.mdblist.subtitle")
                })}
                ${this.renderActionRow({
                  focusKey: "integration:hub:animeskip",
                  title: t("settings.integration.animeskip.label"),
                  subtitle: t("settings.integration.animeskip.subtitle")
                })}
              </div>
            </div>
        `;
    }
  };
}
