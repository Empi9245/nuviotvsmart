import { ScreenUtils } from "../../navigation/screen.js";
import { Router } from "../../navigation/routerState.js";
import { Platform } from "../../../platform/index.js";
import { AuthManager } from "../../../core/auth/authManager.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { LibrarySyncService } from "../../../core/profile/librarySyncService.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { catalogRepository } from "../../../data/repository/catalogRepository.js";
import { I18n } from "../../../i18n/index.js";

const t = (key, fallback) => I18n.t(key, {}, { fallback });
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function normalizeInstallUrl(value) {
  const url = new URL(String(value || "").trim().replace(/^stremio:\/\//i, "https://"));
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Invalid addon URL");
  }
  return url.href;
}

// Uses the same repositories and account sync as Home; no separate phone backend.
export const SharedPluginScreen = {
  async mount(container) {
    this.container = container;
    this.mounted = true;
    this.syncing = false;
    this.saving = false;
    this.message = "";
    this.messageKind = "";
    this.url = "";
    this.render();
  },

  render() {
    if (!this.mounted) return;
    const editable = addonRepository.canEdit();
    const mutationDisabled = !editable || this.saving;
    const urls = addonRepository.getInstalledAddonUrls();
    const cached = addonRepository.getCachedInstalledAddons(urls, { includeDisabled: true });
    const authenticated = AuthManager.isAuthenticated;
    const statusText = this.saving
      ? t("addon_shared_saving", "Saving…")
      : this.syncing
        ? t("addon_refresh_action", "Refreshing…")
        : this.message;
    const statusKind = this.saving || this.syncing ? "loading" : this.messageKind;
    const statusIcon =
      statusKind === "error"
        ? "error_outline"
        : statusKind === "success"
          ? "check_circle"
          : "sync";
    const installedCount = `${urls.length} ${urls.length === 1 ? "addon" : "addons"}`;
    const accountHint = authenticated
      ? t("addon_shared_account_synced", "Changes sync with your account.")
      : t("addon_shared_local_only", "Guest mode: changes are saved on this TV.");

    this.container.innerHTML = `
      <div class="addons-shell addons-route-shell">
        <div class="addons-route-content">
          <main class="home-main addons-main addons-shared-main">
            <div class="addons-panel addons-shared-panel">
              <header class="addons-shared-header">
                <p class="addons-kicker">${escapeHtml(t("addon_shared_kicker", "PROFILE ADDONS"))}</p>
                <h1 class="addons-title">${escapeHtml(t("addon_title", "Addons"))}</h1>
                <p class="addons-lede">${escapeHtml(
                  t(
                    "addon_shared_manage_hint",
                    "Install, remove and refresh add-ons for the current profile."
                  )
                )}</p>
                <div class="addons-shared-meta-row">
                  <span class="addons-large-row-badge">${escapeHtml(installedCount)}</span>
                  <span class="addons-shared-meta-copy">${escapeHtml(accountHint)}</span>
                </div>
              </header>

              ${
                !editable
                  ? `<div class="addons-shared-notice">
                      <span class="material-icons" aria-hidden="true">lock</span>
                      <div>
                        <strong>${escapeHtml(t("addon_readonly_title", "Add-ons are inherited"))}</strong>
                        <span>${escapeHtml(
                          t(
                            "addon_readonly_notice",
                            "Switch to the primary profile to change inherited add-ons."
                          )
                        )}</span>
                      </div>
                    </div>`
                  : ""
              }

              <section class="addons-install-card addons-shared-card">
                <div class="addons-shared-section-copy">
                  <label class="addons-install-heading" for="shared-addon-url">${escapeHtml(
                    t("web_add_addon_url", "Add addon by URL")
                  )}</label>
                  <p class="addons-shared-help">${escapeHtml(
                    t(
                      "addon_shared_url_hint",
                      "Paste the add-on manifest URL, then choose Install."
                    )
                  )}</p>
                </div>
                <div class="addons-install-row">
                  <input
                    id="shared-addon-url"
                    class="addons-install-surface focusable"
                    type="url"
                    value="${escapeHtml(this.url)}"
                    placeholder="https://example.com/manifest.json"
                    autocomplete="off"
                    ${mutationDisabled ? "disabled" : ""}
                  >
                  <button
                    type="button"
                    class="addons-install-btn addons-install-primary focusable"
                    data-action="install"
                    ${mutationDisabled ? "disabled" : ""}
                  >
                    <span class="material-icons" aria-hidden="true">add</span>
                    <span>${escapeHtml(t("addon_install_btn", "Install"))}</span>
                  </button>
                </div>
              </section>

              ${
                statusText
                  ? `<div class="addons-feedback is-${escapeHtml(statusKind || "neutral")}" role="status">
                      <span class="material-icons" aria-hidden="true">${statusIcon}</span>
                      <span>${escapeHtml(statusText)}</span>
                    </div>`
                  : ""
              }

              <section class="addons-shared-section">
                <div class="addons-shared-section-heading">
                  <div>
                    <h2 class="addons-subtitle">${escapeHtml(
                      t("addon_installed_section", "Installed")
                    )}</h2>
                    <p class="addons-shared-help">${escapeHtml(
                      t(
                        "addon_shared_installed_hint",
                        "These add-ons are available to the current profile."
                      )
                    )}</p>
                  </div>
                  <span class="addons-large-row-badge">${escapeHtml(installedCount)}</span>
                </div>

                <div class="addons-installed-list addons-shared-installed-list">
                  ${
                    urls
                      .map((url) => {
                        const addon = cached.find(
                          (item) => item.baseUrl === url || item.url === url
                        );
                        const name =
                          addon?.displayName ||
                          addon?.name ||
                          addonRepository.getAddonDisplayNameOverride(url) ||
                          url;
                        const description =
                          addon?.description ||
                          t(
                            "addon_shared_ready_description",
                            "Installed and ready for this profile."
                          );
                        const version = String(addon?.version || "").trim();
                        return `<article class="addons-installed-card">
                          <div class="addons-installed-head">
                            <div class="addons-installed-copy">
                              <div class="addons-installed-title-row">
                                <h3>${escapeHtml(name)}</h3>
                                ${
                                  version
                                    ? `<span class="addons-installed-version">v${escapeHtml(version)}</span>`
                                    : ""
                                }
                              </div>
                              <p class="addons-installed-description">${escapeHtml(description)}</p>
                              <p class="addons-installed-meta">${escapeHtml(url)}</p>
                            </div>
                            <button
                              type="button"
                              class="addons-action-btn addons-remove-btn focusable"
                              data-action="remove"
                              data-url="${escapeHtml(url)}"
                              ${mutationDisabled ? "disabled" : ""}
                            >
                              <span class="material-icons" aria-hidden="true">delete_outline</span>
                              <span>${escapeHtml(t("addon_remove", "Remove"))}</span>
                            </button>
                          </div>
                        </article>`;
                      })
                      .join("") ||
                    `<div class="addons-shared-empty">
                      <span class="material-icons" aria-hidden="true">extension_off</span>
                      <div>
                        <strong>${escapeHtml(t("addon_empty", "No addons installed."))}</strong>
                        <span>${escapeHtml(
                          t(
                            "addon_shared_empty_hint",
                            "Add a manifest URL above to install your first add-on."
                          )
                        )}</span>
                      </div>
                    </div>`
                  }
                </div>
              </section>

              <section class="addons-shared-section">
                <div class="addons-shared-section-heading">
                  <div>
                    <h2 class="addons-subtitle">${escapeHtml(
                      t("addon_shared_tools_title", "Tools")
                    )}</h2>
                    <p class="addons-shared-help">${escapeHtml(
                      t(
                        "addon_shared_tools_hint",
                        "Refresh add-ons, reorder Home catalogs or return to Home."
                      )
                    )}</p>
                  </div>
                </div>
                <div class="addons-shared-utility-row">
                  <button
                    type="button"
                    class="addons-action-btn addons-shared-utility-btn focusable"
                    data-action="refresh"
                    ${this.syncing || this.saving ? "disabled" : ""}
                  >
                    <span class="material-icons" aria-hidden="true">sync</span>
                    <span>${escapeHtml(t("addon_refresh_action", "Refresh Addons"))}</span>
                  </button>
                  <button
                    type="button"
                    class="addons-action-btn addons-shared-utility-btn focusable"
                    data-action="catalogs"
                  >
                    <span class="material-icons" aria-hidden="true">tune</span>
                    <span>${escapeHtml(t("addon_reorder_title", "Reorder home catalogs"))}</span>
                  </button>
                  <button
                    type="button"
                    class="addons-action-btn addons-shared-utility-btn focusable"
                    data-action="home"
                  >
                    <span class="material-icons" aria-hidden="true">home</span>
                    <span>${escapeHtml(t("nav_home", "Home"))}</span>
                  </button>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    `;

    const controls = [...this.container.querySelectorAll(".focusable:not(:disabled)")];
    controls.forEach((node, index) => {
      node.dataset.index = String(index);
      node.addEventListener("focus", () => {
        controls.forEach((control) => control.classList.toggle("focused", control === node));
        this.ensureFocusedControlVisible(node);
      });
    });
    this.container.querySelector("input")?.addEventListener("input", (event) => {
      this.url = event.target.value;
    });
    this.container.querySelectorAll("button[data-action]").forEach((node) => {
      node.addEventListener("click", () => void this.activate(node));
    });
    ScreenUtils.setInitialFocus(this.container, ".focusable:not(:disabled)");
  },

  ensureFocusedControlVisible(node) {
    const scroller = node?.closest?.(".addons-main");
    if (!scroller || !node) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const pad = 48;

    if (nodeRect.bottom > scrollerRect.bottom - pad) {
      scroller.scrollTop = Math.min(
        Math.max(0, scroller.scrollHeight - scroller.clientHeight),
        scroller.scrollTop + nodeRect.bottom - scrollerRect.bottom + pad
      );
    } else if (nodeRect.top < scrollerRect.top + pad) {
      scroller.scrollTop = Math.max(
        0,
        scroller.scrollTop - (scrollerRect.top + pad - nodeRect.top)
      );
    }
  },

  async refresh() {
    if (this.syncing || this.saving) return;
    this.syncing = true;
    this.message = "";
    this.messageKind = "";
    this.render();
    try {
      await LibrarySyncService.pull();
      if (LibrarySyncService.getLastPullStatus().state === "error") {
        this.message = t(
          "addon_shared_sync_error",
          "Unable to save or load add-ons. Check your connection and try again."
        );
        this.messageKind = "error";
      } else {
        this.message = t("addon_shared_refresh_success", "Add-ons refreshed.");
        this.messageKind = "success";
      }
      catalogRepository.clearCache();
    } finally {
      this.syncing = false;
      if (this.mounted) this.render();
    }
  },

  async change(action, value) {
    if (this.saving || this.syncing || !addonRepository.canEdit()) return;
    this.saving = true;
    this.message = "";
    this.messageKind = "";
    const profileId = ProfileManager.getActiveProfileId();
    const generation = AuthManager.sessionGeneration;
    const previousUrls = addonRepository.getInstalledAddonUrls();
    const previousEnabled = addonRepository.getAddonEnabledStates();
    this.render();
    try {
      let url = value;
      if (action === "install") {
        try { url = normalizeInstallUrl(value); } catch {
          this.message = t("addon_shared_invalid_url", "Enter a valid HTTPS add-on URL.");
          this.messageKind = "error";
          return;
        }
        const manifest = await addonRepository.fetchAddon(url, { force: true, timeoutMs: 10000 });
        if (manifest.status !== "success" || !manifest.data?.id || !manifest.data?.name) {
          this.message = t("addon_shared_manifest_error", "Could not load this add-on. Check its manifest URL.");
          this.messageKind = "error";
          return;
        }
      }
      if (!this.mounted || profileId !== ProfileManager.getActiveProfileId() || generation !== AuthManager.sessionGeneration) return;
      const changed = action === "install" ? await addonRepository.addAddon(url) : await addonRepository.removeAddon(url);
      if (!changed) {
        this.message = t("addon_shared_already_installed", "This add-on is already installed.");
        this.messageKind = "error";
        return;
      }
      if (AuthManager.isAuthenticated) {
        if (!(await LibrarySyncService.push())) {
          await addonRepository.setAddonOrder(previousUrls);
          addonRepository.setAddonEnabledStates(Object.entries(previousEnabled).map(([url, enabled]) => ({ url, enabled })), { replace: true });
          this.message = t("addon_shared_sync_error", "Unable to save or load add-ons. Check your connection and try again.");
          this.messageKind = "error";
          return;
        }
        this.message = t("addon_shared_saved", "Add-ons saved to your account.");
        this.messageKind = "success";
      } else {
        this.message = t("addon_shared_saved_local", "Add-ons saved on this TV.");
        this.messageKind = "success";
      }
      catalogRepository.clearCache();
      this.url = "";
    } finally {
      this.saving = false;
      if (this.mounted) this.render();
    }
  },

  async activate(node) {
    if (this.saving) return;
    const action = node.dataset.action;
    if (action === "install") await this.change(action, this.url);
    else if (action === "remove") await this.change(action, node.dataset.url);
    else if (action === "refresh") await this.refresh();
    else if (action === "catalogs") await Router.navigate("catalogOrder");
    else if (action === "home") await Router.navigate("home", { forceReload: true });
  },

  async onKeyDown(event) {
    if (Platform.isBackEvent(event)) {
      event.preventDefault();
      await Router.back();
      return;
    }
    const code = Number(event.keyCode || 0);
    const focusedControl = this.container.querySelector(".focusable.focused");
    const inputFocused =
      focusedControl?.tagName === "INPUT" ||
      (!focusedControl && document.activeElement?.tagName === "INPUT");

    // Let the TV/browser handle OK on a focused text field. VIDAA uses this
    // native activation to open its on-screen keyboard.
    if (inputFocused && code === 13) return;

    // Keep left/right available for caret movement while editing the URL.
    if (inputFocused && (code === 37 || code === 39)) return;

    if (code === 38 || code === 40 || code === 37 || code === 39) {
      event.preventDefault();
      if (inputFocused && (code === 38 || code === 40)) {
        try { document.activeElement?.blur?.(); } catch (_) {}
      }
      ScreenUtils.moveFocus(
        this.container,
        code === 38 || code === 37 ? -1 : 1,
        ".focusable:not(:disabled)"
      );
      this.ensureFocusedControlVisible(this.container.querySelector(".focused"));
    } else if (code === 13) {
      event.preventDefault();
      event.stopPropagation();
      this.container.querySelector(".focused")?.click();
    }
  },

  cleanup() {
    this.mounted = false;
    this.syncing = false;
    this.saving = false;
  }
};
