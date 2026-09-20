/* eslint-disable no-unused-vars */
import * as internals from "./supportersContributorsScreen.js";

export function createSupportersContributorsScreenMethods02() {
  const {
    ScreenUtils,
    QrCodeGenerator,
    bindSettingsScrollIndicators,
    scrollSettingsContentItem,
    t,
    escapeHtml,
    formatSupporterDate,
    initialsForName,
    supporterTierLabel,
    contributorLogin,
    contributorRoleLabel,
    contributorSupportLink,
    focusNode,
    visibleFocusableNodes,
    findDirectionalTarget,
    sortedTabListItems
  } = internals;

  return {
    renderContributorCard(contributor, index) {
      const login = contributorLogin(contributor);
      const role = contributorRoleLabel(login);
      return `
          <article class="supporters-person-card supporters-focusable focusable"
                   data-focus-key="item:contributors:${index}"
                   data-action="openItem"
                   data-tab="contributors"
                   data-item-index="${index}">
            <span class="supporters-avatar supporters-avatar-image">
              ${
                contributor.avatarUrl
                  ? `<img src="${escapeHtml(contributor.avatarUrl)}" alt="${escapeHtml(contributor.name)}" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" />`
                  : ""
              }
              <span${contributor.avatarUrl ? " hidden" : ""}>${escapeHtml(initialsForName(contributor.name))}</span>
            </span>
            <div class="supporters-card-copy">
              <div class="supporters-card-title-row">
                <h3>${escapeHtml(contributor.name)}</h3>
                ${role ? `<span class="supporters-role-badge">${escapeHtml(role)}</span>` : ""}
              </div>
            </div>
            ${this.renderExternalIcon()}
          </article>
        `;
    },
    renderDialog() {
      if (!this.dialog) return "";
      const item = this.dialog.item;
      if (!item) return "";
      const type = this.dialog.type;
      if (type === "contributors") return this.renderContributorDialog(item);
      if (type === "sponsors") return this.renderSponsorDialog(item);
      return this.renderSupporterDialog(item);
    },
    renderDialogShell({ title, subtitle, body, actions }) {
      return `
          <div class="supporters-dialog-backdrop" data-action="closeDialog">
            <section class="supporters-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
              <h2>${escapeHtml(title)}</h2>
              ${subtitle ? `<p class="supporters-dialog-subtitle">${escapeHtml(subtitle)}</p>` : ""}
              <div class="supporters-dialog-body">${body}</div>
              <div class="supporters-dialog-actions">${actions}</div>
            </section>
          </div>
        `;
    },
    renderSupporterDialog(supporter) {
      const since = formatSupporterDate(supporter.supporterSince);
      return this.renderDialogShell({
        title: supporter.name,
        subtitle: supporterTierLabel(supporter.membershipLevel),
        body: `
            <div class="supporters-dialog-person-row">
              ${this.renderPersonAvatar(supporter.name, supporter.avatarUrl, { large: true })}
              <p>${escapeHtml(
                since
                  ? t("supporters_since", { date: since }, `Supporting Nuvio since ${since}`)
                  : t("supporters_since_unknown", {}, "Proudly supporting Nuvio")
              )}</p>
            </div>
          `,
        actions: `
            <button class="supporters-dialog-button primary focusable" data-focus-key="dialog:primary" data-action="openSupport">${escapeHtml(t("supporters_open_donations", {}, "Open support page"))}</button>
            <button class="supporters-dialog-button focusable" data-focus-key="dialog:close" data-action="closeDialog">${escapeHtml(t("action_close", {}, "Close"))}</button>
          `
      });
    },
    renderSponsorDialog(sponsor) {
      return this.renderDialogShell({
        title: sponsor.name,
        subtitle: sponsor.channelUrl || t("sponsors_channel_unavailable", {}, "Sponsor channel unavailable."),
        body: `
            <div class="supporters-dialog-person-row">
              ${this.renderNameAvatar(sponsor.name)}
              <div>
                <p>${escapeHtml(t("sponsors_detail_copy", {}, "Sponsors help move Nuvio forward through support across the different parts of development."))}</p>
                ${sponsor.channelUrl ? `<small>${escapeHtml(sponsor.channelUrl)}</small>` : ""}
              </div>
            </div>
          `,
        actions: `
            <button class="supporters-dialog-button primary focusable" data-focus-key="dialog:primary" data-action="openSponsor"${sponsor.channelUrl ? "" : ' disabled aria-disabled="true"'}>${escapeHtml(t("sponsors_open_channel", {}, "Open sponsor channel"))}</button>
            <button class="supporters-dialog-button focusable" data-focus-key="dialog:close" data-action="closeDialog">${escapeHtml(t("action_close", {}, "Close"))}</button>
          `
      });
    },
    renderContributorDialog(contributor) {
      const login = contributorLogin(contributor);
      const role = contributorRoleLabel(login);
      const supportLink = contributorSupportLink(login);
      return this.renderDialogShell({
        title: contributor.name,
        subtitle: "",
        body: `
            <div class="supporters-dialog-person-row">
              <span class="supporters-avatar supporters-avatar-image large">
                ${contributor.avatarUrl ? `<img src="${escapeHtml(contributor.avatarUrl)}" alt="${escapeHtml(contributor.name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" />` : ""}
                <span${contributor.avatarUrl ? " hidden" : ""}>${escapeHtml(initialsForName(contributor.name))}</span>
              </span>
              <div>
                ${role ? `<span class="supporters-role-badge">${escapeHtml(role)}</span>` : ""}
                <small>${escapeHtml(contributor.profileUrl || t("contributors_profile_unavailable", {}, "GitHub profile link unavailable."))}</small>
                ${supportLink?.kofiUrl ? `<small>${escapeHtml(supportLink.kofiUrl)}</small>` : ""}
              </div>
            </div>
            ${this.dialog.showSupportQr && supportLink?.kofiUrl ? `<canvas class="supporters-dialog-qr" data-qr-content="${escapeHtml(supportLink.kofiUrl)}" aria-label="${escapeHtml(t("cd_contributor_qr", {}, "Contributor support QR code"))}"></canvas>` : ""}
          `,
        actions: `
            <button class="supporters-dialog-button primary focusable" data-focus-key="dialog:primary" data-action="openGithub"${contributor.profileUrl ? "" : ' disabled aria-disabled="true"'}>${escapeHtml(t("contributors_open_github", {}, "Open GitHub Profile"))}</button>
            ${supportLink?.kofiUrl ? `<button class="supporters-dialog-button focusable" data-focus-key="dialog:kofi" data-action="toggleContributorQr">${escapeHtml(t(this.dialog.showSupportQr ? "contributors_hide_kofi_qr" : "contributors_show_kofi_qr", {}, this.dialog.showSupportQr ? "Hide Ko-fi QR" : "Show Ko-fi QR"))}</button>` : ""}
            <button class="supporters-dialog-button focusable" data-focus-key="dialog:close" data-action="closeDialog">${escapeHtml(t("action_close", {}, "Close"))}</button>
          `
      });
    },
    async render() {
      this.ensureState();
      this.captureListScrollTop();
      const enterClass = this.routeEnterPending ? " supporters-route-enter" : "";
      this.container.innerHTML = `
          <div class="supporters-route-shell${enterClass}">
            <div class="supporters-route-content">
              ${this.renderMembershipPanel()}
              <section class="supporters-content-card">
                ${this.renderTabs()}
                <div class="supporters-tab-panel">
                  ${this.renderTabBody()}
                </div>
              </section>
            </div>
            ${this.renderDialog()}
          </div>
        `;
      this.generateQrCodes();
      ScreenUtils.indexFocusables(this.container);
      bindSettingsScrollIndicators(this.container);
      this.restoreListScrollTop();
      this.applyFocus();
      if (this.preserveListScrollAfterFocus) {
        this.restoreListScrollTop();
        this.preserveListScrollAfterFocus = false;
      }
    },
    captureListScrollTop() {
      const list = this.container?.querySelector?.(".supporters-list");
      if (!list) return;
      this.scrollTops = this.scrollTops || {};
      this.scrollTops[this.selectedTab] = Number(list.scrollTop || 0);
    },
    restoreListScrollTop() {
      const list = this.container?.querySelector?.(".supporters-list");
      if (!list) return;
      const scrollTop = Number(this.scrollTops?.[this.selectedTab] || 0);
      if (scrollTop > 0) {
        list.scrollTop = scrollTop;
      }
    },
    generateQrCodes() {
      this.container?.querySelectorAll?.("canvas[data-qr-content]").forEach((canvas) => {
        const content = String(canvas.getAttribute("data-qr-content") || "").trim();
        if (!content) return;
        const size = canvas.classList.contains("supporters-dialog-qr") ? 376 : 440;
        try {
          QrCodeGenerator.generate(canvas, content, size);
        } catch (error) {
          console.warn("Failed to generate supporters QR", error);
        }
      });
    },
    applyFocus() {
      this.container?.querySelectorAll?.(".focusable.focused").forEach((node) => node.classList.remove("focused"));
      const selector = `.focusable[data-focus-key="${String(this.focusKey || "").replace(/["\\]/g, "\\$&")}"]`;
      const fallbackSelector = this.dialog
        ? ".supporters-dialog .focusable:not([disabled])"
        : `.focusable[data-focus-key="tab:${this.selectedTab}"]`;
      const node =
        this.container?.querySelector?.(selector) ||
        this.container?.querySelector?.(fallbackSelector) ||
        this.container?.querySelector?.(".focusable");
      if (!node) return;
      node.classList.add("focused");
      focusNode(node);
      this.focusKey = String(node.dataset.focusKey || this.focusKey || "");
      scrollSettingsContentItem(node);
    },
    focusTarget(node) {
      if (!node) return;
      this.container?.querySelectorAll?.(".focusable.focused").forEach((entry) => entry.classList.remove("focused"));
      node.classList.add("focused");
      focusNode(node);
      this.focusKey = String(node.dataset.focusKey || "");
      scrollSettingsContentItem(node);
    },
    getMembershipFocusTarget() {
      if (this.showMembershipQr) {
        return this.container?.querySelector?.('.focusable[data-action="hideMembershipQr"]') || null;
      }
      return (
        this.container?.querySelector?.('.focusable[data-action="showMembershipQr"]') ||
        this.container?.querySelector?.('.focusable[data-action="refreshMembership"]:not([disabled])') ||
        null
      );
    },
    getDirectionalTarget(current, direction) {
      if (!current || this.dialog) {
        const nodes = visibleFocusableNodes(this.dialog ? this.container.querySelector(".supporters-dialog") : this.container);
        return findDirectionalTarget(nodes, current, direction);
      }

      if (current.dataset.action === "openItem" && (direction === "up" || direction === "down")) {
        const tab = String(current.dataset.tab || this.selectedTab);
        const items = sortedTabListItems(this.container, tab);
        const currentIndex = items.indexOf(current);
        if (direction === "down") {
          return items[currentIndex + 1] || null;
        }
        if (currentIndex > 0) {
          return items[currentIndex - 1];
        }
        return this.container.querySelector(`.supporters-tab[data-tab="${this.selectedTab}"]`);
      }

      if (current.dataset.action === "openItem" && direction === "left") {
        return this.getMembershipFocusTarget();
      }

      if (current.dataset.action === "openItem" && direction === "right") {
        return null;
      }

      if (current.dataset.action === "selectTab" && direction === "down") {
        return (
          sortedTabListItems(this.container, this.selectedTab)[0] ||
          this.container.querySelector(`.supporters-retry-button[data-focus-key="retry:${this.selectedTab}"]`) ||
          null
        );
      }

      if (current.dataset.action === "selectTab" && (direction === "left" || direction === "right")) {
        const tabs = Array.from(this.container?.querySelectorAll?.(".supporters-tab") || []);
        const currentIndex = tabs.indexOf(current);
        const nextIndex = currentIndex + (direction === "left" ? -1 : 1);
        return tabs[nextIndex] || (direction === "left" ? this.getMembershipFocusTarget() : null);
      }

      if (current.dataset.action === "retry" && direction === "left") {
        return this.getMembershipFocusTarget();
      }

      const nodes = visibleFocusableNodes(this.container);
      return findDirectionalTarget(nodes, current, direction);
    },
    async handleClickEvent(event) {
      const target = event?.target?.closest?.(".focusable, [data-action]");
      if (!target || !this.container?.contains?.(target)) return;
      if (target.classList?.contains("supporters-dialog-backdrop") && event?.target !== target) return;
      const focusable = target.classList.contains("focusable") ? target : target.closest(".focusable");
      if (focusable) this.focusTarget(focusable);
      const handled = await this.activateTarget(target);
      if (handled) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
      }
    }
  };
}
