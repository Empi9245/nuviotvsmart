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
    this.busy = false;
    this.message = "";
    this.url = "";
    this.render();
    await this.refresh();
  },

  render() {
    if (!this.mounted) return;
    const editable = addonRepository.canEdit() && AuthManager.isAuthenticated;
    const urls = addonRepository.getInstalledAddonUrls();
    const cached = addonRepository.getCachedInstalledAddons(urls, { includeDisabled: true });
    let index = 0;
    const button = (action, label, disabled = false, extra = "") =>
      `<button class="addons-install-btn focusable" data-index="${index++}" data-action="${action}" ${disabled ? "disabled" : ""} ${extra}>${escapeHtml(label)}</button>`;
    this.container.innerHTML = `<main class="home-main addons-main">
      <div class="addons-panel">
        <h1 class="addons-title">${escapeHtml(t("addon_title", "Addons"))}</h1>
        <p class="addons-lede">${escapeHtml(t("addon_shared_manage_hint", "Install or remove add-ons here. Changes are saved to your account."))}</p>
        ${!editable ? `<p>${escapeHtml(t("addon_readonly_notice", "Switch to the primary profile to change inherited add-ons."))}</p>` : ""}
        <section class="addons-install-card">
          <label class="addons-install-heading" for="shared-addon-url">${escapeHtml(t("web_add_addon_url", "Add addon by URL"))}</label>
          <div class="addons-install-row">
            <input id="shared-addon-url" class="addons-install-surface focusable" data-index="${index++}" type="url" value="${escapeHtml(this.url)}" placeholder="https://example.com/manifest.json" autocomplete="off" ${!editable || this.busy ? "disabled" : ""}>
            ${button("install", t("addon_install_btn", "Install"), !editable || this.busy)}
          </div>
        </section>
        <p class="addons-sync-status" role="status">${escapeHtml(this.busy ? t("addon_shared_saving", "Saving…") : this.message)}</p>
        <h2>${escapeHtml(t("addon_installed_section", "Installed"))}</h2>
        <div class="addons-installed-list">
          ${urls.map((url) => {
            const addon = cached.find((item) => item.baseUrl === url || item.url === url);
            return `<article class="addons-installed-card"><h3>${escapeHtml(addon?.name || addonRepository.getAddonDisplayNameOverride(url) || url)}</h3>
              <p class="addons-installed-description">${escapeHtml(url)}</p>
              ${button("remove", t("addon_remove", "Remove"), !editable || this.busy, `data-url="${escapeHtml(url)}"`)}</article>`;
          }).join("") || `<p>${escapeHtml(t("addon_empty", "No addons installed."))}</p>`}
        </div>
        <div class="addons-installed-actions">
          ${button("refresh", t("addon_refresh_action", "Refresh Addons"), this.busy)}
          ${button("catalogs", t("addon_reorder_title", "Reorder home catalogs"), this.busy)}
          ${button("home", t("nav_home", "Home"), this.busy)}
        </div>
      </div></main>`;
    const controls = [...this.container.querySelectorAll(".focusable:not(:disabled)")];
    controls.forEach((node, i) => {
      node.dataset.index = i;
      node.addEventListener("focus", () => {
        controls.forEach((control) => control.classList.toggle("focused", control === node));
        this.ensureFocusedControlVisible(node);
      });
    });
    this.container.querySelector("input")?.addEventListener("input", (event) => { this.url = event.target.value; });
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
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await LibrarySyncService.pull();
      this.message = LibrarySyncService.getLastPullStatus().state === "error"
        ? t("addon_shared_sync_error", "Unable to save or load add-ons. Check your connection and try again.") : "";
      catalogRepository.clearCache();
    } finally {
      this.busy = false;
      this.render();
    }
  },

  async change(action, value) {
    if (this.busy || !addonRepository.canEdit() || !AuthManager.isAuthenticated) return;
    this.busy = true;
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
          return;
        }
        const manifest = await addonRepository.fetchAddon(url, { force: true, timeoutMs: 10000 });
        if (manifest.status !== "success" || !manifest.data?.id || !manifest.data?.name) {
          this.message = t("addon_shared_manifest_error", "Could not load this add-on. Check its manifest URL.");
          return;
        }
      }
      if (!this.mounted || profileId !== ProfileManager.getActiveProfileId() || generation !== AuthManager.sessionGeneration) return;
      const changed = action === "install" ? await addonRepository.addAddon(url) : await addonRepository.removeAddon(url);
      if (!changed) {
        this.message = t("addon_shared_already_installed", "This add-on is already installed.");
        return;
      }
      if (!(await LibrarySyncService.push())) {
        await addonRepository.setAddonOrder(previousUrls);
        addonRepository.setAddonEnabledStates(Object.entries(previousEnabled).map(([url, enabled]) => ({ url, enabled })), { replace: true });
        this.message = t("addon_shared_sync_error", "Unable to save or load add-ons. Check your connection and try again.");
        return;
      }
      catalogRepository.clearCache();
      this.url = "";
      this.message = t("addon_shared_saved", "Add-ons saved to your account.");
    } finally {
      this.busy = false;
      this.render();
    }
  },

  async activate(node) {
    if (this.busy) return;
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
      if (!this.busy) await Router.back();
      return;
    }
    const code = Number(event.keyCode || 0);
    const inputFocused = document.activeElement?.tagName === "INPUT";

    // Let the TV/browser handle OK on a focused text field. VIDAA uses this
    // native activation to open its on-screen keyboard; consuming Enter here
    // previously moved focus away before text entry could start.
    if (inputFocused && code === 13) return;

    // Keep left/right available for caret movement while editing the URL.
    if (inputFocused && (code === 37 || code === 39)) return;

    if (code === 38 || code === 40 || code === 37 || code === 39) {
      event.preventDefault();
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

  cleanup() { this.mounted = false; }
};
