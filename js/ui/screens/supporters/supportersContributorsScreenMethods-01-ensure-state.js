/* eslint-disable no-unused-vars */
import * as internals from "./supportersContributorsScreen.js";

export function createSupportersContributorsScreenMethods01() {
  const {
    ScreenUtils,
    Router,
    SUPPORT_URL,
    MembershipOverviewRepository,
    settingsScrollIndicatorMarkup,
    TABS,
    DEFAULT_TAB,
    PATREON_MEMBERSHIP_URL,
    t,
    escapeHtml,
    normalizeBaseUrl,
    formatSupporterDate,
    initialsForName,
    supporterTierLabel,
    loadSupporters,
    loadSponsors,
    loadContributors
  } = internals;

  return {
    ensureState() {
      if (this.state) return;
      this.state = {
        supporters: { loading: false, loaded: false, items: [], error: null },
        sponsors: { loading: false, loaded: false, items: [], error: null },
        contributors: { loading: false, loaded: false, items: [], error: null }
      };
      this.membershipState = MembershipOverviewRepository.getState();
    },
    async mount() {
      this.container = document.getElementById("supportersContributors");
      ScreenUtils.show(this.container);
      this.ensureState();
      this.scrollTops = this.scrollTops || {};
      this.selectedTab = this.selectedTab || DEFAULT_TAB;
      this.focusKey = this.focusKey || `tab:${this.selectedTab}`;
      this.routeEnterPending = true;
      if (this.routeEnterTimer) {
        clearTimeout(this.routeEnterTimer);
      }
      this.routeEnterTimer = setTimeout(() => {
        this.routeEnterPending = false;
        this.routeEnterTimer = null;
      }, 420);
      if (!this.handleClickBound) {
        this.handleClickBound = this.handleClickEvent.bind(this);
        this.container.addEventListener("click", this.handleClickBound);
      }
      await this.render();
      if (!this.membershipUnsubscribe) {
        this.membershipUnsubscribe = MembershipOverviewRepository.subscribe((membershipState) => {
          this.membershipState = membershipState;
          if (Router.getCurrent() === "supportersContributors") {
            void this.render();
          }
        });
      }
      void MembershipOverviewRepository.refresh();
      void this.loadTabIfNeeded(this.selectedTab);
      void this.loadTabIfNeeded("supporters");
    },
    cleanup() {
      if (this.container && this.handleClickBound) {
        this.container.removeEventListener("click", this.handleClickBound);
      }
      if (this.routeEnterTimer) {
        clearTimeout(this.routeEnterTimer);
      }
      this.routeEnterTimer = null;
      this.routeEnterPending = false;
      this.handleClickBound = null;
      this.membershipUnsubscribe?.();
      this.membershipUnsubscribe = null;
      this.dialog = null;
      this.showMembershipQr = false;
      ScreenUtils.hide(this.container);
    },
    async loadTabIfNeeded(tab, force = false) {
      this.ensureState();
      const tabState = this.state[tab];
      if (!tabState || tabState.loading || (!force && tabState.loaded)) return;
      tabState.loading = true;
      tabState.error = null;
      await this.render();
      try {
        const result = tab === "supporters" ? await loadSupporters() : tab === "sponsors" ? await loadSponsors() : await loadContributors();
        tabState.items = result;
        tabState.loaded = true;
        tabState.error = null;
      } catch (error) {
        tabState.items = [];
        tabState.loaded = false;
        tabState.error = error?.message || String(error || "");
        if (this.selectedTab === tab) {
          this.focusKey = `retry:${tab}`;
        }
      } finally {
        tabState.loading = false;
        if (Router.getCurrent() === "supportersContributors") {
          await this.render();
        }
      }
    },
    async selectTab(tab, { focus = true } = {}) {
      if (!TABS.includes(tab)) return;
      this.selectedTab = tab;
      if (focus) this.focusKey = `tab:${tab}`;
      await this.render();
      void this.loadTabIfNeeded(tab);
    },
    renderMembershipPanel() {
      const membership = this.membershipState || MembershipOverviewRepository.getState();
      const overview = membership?.overview;
      const manageMembership = overview?.subscriptionActive === true;
      const actionUrl = manageMembership ? PATREON_MEMBERSHIP_URL : normalizeBaseUrl(SUPPORT_URL);
      const showPrimaryAction = !membership?.isLoading && overview != null;
      const showRefresh =
        !membership?.isLoading &&
        (overview == null ||
          membership?.hasError ||
          overview.subscriptionActive ||
          overview.providerConnected ||
          overview.hasActiveGrant ||
          overview.active);
      const primaryLabel = manageMembership
        ? t("supporter_membership_manage", {}, "Manage membership")
        : t("supporter_membership_view", {}, "View Membership");
      const refreshLabel = membership?.isRefreshing
        ? t("supporter_membership_refreshing", {}, "Refreshing")
        : t("supporter_membership_refresh", {}, "Refresh");
      return `
          <section class="supporters-brand-card supporters-membership-card${this.showMembershipQr ? " is-flipped" : ""}" aria-label="${escapeHtml(t("supporter_membership_title", {}, "Nuvio Supporter Membership"))}">
            <div class="supporters-brand-face supporters-brand-front supporters-membership-front">
              <div class="supporters-membership-copy" aria-live="polite">
                ${this.renderMembershipContent(membership)}
              </div>
              ${
                showRefresh || showPrimaryAction
                  ? `<div class="supporters-membership-actions">
                      ${
                        showRefresh
                          ? `<button class="supporters-membership-refresh-button supporters-focusable focusable" data-focus-key="membership:refresh" data-action="refreshMembership"${membership?.isRefreshing ? ' disabled aria-disabled="true"' : ""}>${escapeHtml(refreshLabel)}</button>`
                          : ""
                      }
                      ${
                        showPrimaryAction
                          ? `<button class="supporters-donate-button supporters-membership-primary-button supporters-focusable focusable" data-focus-key="membership:action" data-action="showMembershipQr">${escapeHtml(primaryLabel)}</button>`
                          : ""
                      }
                    </div>`
                  : ""
              }
            </div>
            <div class="supporters-brand-face supporters-brand-back" aria-hidden="${this.showMembershipQr ? "false" : "true"}">
              <div class="supporters-qr-copy">
                <h2>${escapeHtml(t(manageMembership ? "supporter_membership_scan_manage" : "supporter_membership_scan_support", {}, manageMembership ? "Scan to manage membership" : "Scan to view membership"))}</h2>
                <p>${escapeHtml(t(manageMembership ? "supporter_membership_scan_manage_description" : "supporter_membership_scan_support_description", {}, manageMembership ? "Open Patreon membership settings on your phone." : "Open the Supporter Membership page on your phone."))}</p>
              </div>
              <canvas class="supporters-donate-qr supporters-membership-qr" data-qr-content="${escapeHtml(actionUrl)}" aria-label="${escapeHtml(t("cd_membership_qr", {}, "Membership QR code"))}"></canvas>
              <button class="supporters-back-button supporters-focusable focusable" data-focus-key="membership:back" data-action="hideMembershipQr">
                ${escapeHtml(t("supporters_contributors_back_button", {}, "Back to details"))}
              </button>
            </div>
          </section>
        `;
    },
    renderMembershipContent(membership) {
      const overview = membership?.overview;
      if (membership?.isLoading) {
        return `<h1 class="supporters-title">${escapeHtml(t("supporter_membership_loading", {}, "Loading membership…"))}</h1>`;
      }
      if (!overview) {
        return `
            <h1 class="supporters-title">${escapeHtml(t("supporter_membership_title", {}, "Nuvio Supporter Membership"))}</h1>
            <p class="supporters-secondary-copy">${escapeHtml(t("supporter_membership_unable_load", {}, "Unable to load membership status. Please try again."))}</p>
          `;
      }
      if (overview.subscriptionActive) {
        return this.renderMembershipTierContent(overview);
      }
      if (overview.providerConnected && !overview.hasActiveGrant) {
        return `
            <h1 class="supporters-title">${escapeHtml(t("supporter_membership_connected_title", {}, "Patreon is connected"))}</h1>
            <p class="supporters-secondary-copy">${escapeHtml(t("supporter_membership_connected_description", {}, "No active Nuvio tier was found on this Patreon account. View the available options or refresh after changing your Patreon membership."))}</p>
            ${membership.hasError ? `<p class="supporters-membership-error">${escapeHtml(t("supporter_membership_unable_load", {}, "Unable to load membership status. Please try again."))}</p>` : ""}
          `;
      }
      if (overview.hasActiveGrant || overview.active) {
        return this.renderMembershipTierContent(overview);
      }
      return `
          <h1 class="supporters-title">${escapeHtml(t("supporter_membership_title", {}, "Nuvio Supporter Membership"))}</h1>
          <p class="supporters-secondary-copy">${escapeHtml(t("supporter_membership_description", {}, "Supporting Nuvio helps cover infrastructure and ongoing development while keeping the core experience free for everyone."))}</p>
          ${membership.hasError ? `<p class="supporters-membership-error">${escapeHtml(t("supporter_membership_unable_load", {}, "Unable to load membership status. Please try again."))}</p>` : ""}
        `;
    },
    renderMembershipTierContent(overview) {
      const tier = overview.membershipLevel || overview.grantTier || overview.tier || "SUPPORTER";
      const tierLabel =
        tier === "SUPPORTER_PLUS"
          ? t("supporter_membership_tier_supporter_plus", {}, "Supporter Plus")
          : t("supporter_membership_tier_supporter", {}, "Supporter");
      const since = formatSupporterDate(overview.supporterSince);
      return `
          <h1 class="supporters-title supporters-membership-tier-line">
            <span>${escapeHtml(t("supporter_membership_you_are", {}, "You’re a"))}</span>
            <strong>${escapeHtml(tierLabel)}</strong><span>.</span>
            <span>${escapeHtml(t("supporter_membership_thank_you", {}, "Thank you."))}</span>
          </h1>
          ${since ? `<p class="supporters-secondary-copy supporters-membership-since">${escapeHtml(t("supporter_membership_supporter_since", { date: since }, `Supporter since ${since}.`))}</p>` : ""}
        `;
    },
    renderTabs() {
      const labels = {
        supporters: t("supporters_tab", {}, "Supporters"),
        sponsors: t("sponsors_tab", {}, "Sponsors"),
        contributors: t("contributors_tab", {}, "Contributors")
      };
      return `
          <div class="supporters-tabs" role="tablist">
            ${TABS.map(
              (tab) => `
              <button class="supporters-tab supporters-focusable focusable${this.selectedTab === tab ? " selected" : ""}"
                      role="tab"
                      aria-selected="${this.selectedTab === tab ? "true" : "false"}"
                      data-tab="${tab}"
                      data-focus-key="tab:${tab}"
                      data-action="selectTab">
                ${escapeHtml(labels[tab])}
              </button>
            `
            ).join("")}
          </div>
        `;
    },
    renderTabBody() {
      const tabState = this.state?.[this.selectedTab] || {
        loading: false,
        loaded: false,
        items: [],
        error: null
      };
      if (tabState.loading) {
        const loading =
          this.selectedTab === "supporters"
            ? t("supporters_loading", {}, "Loading supporters...")
            : this.selectedTab === "sponsors"
              ? t("sponsors_loading", {}, "Loading sponsors...")
              : t("contributors_loading", {}, "Loading GitHub contributors...");
        return `
            <div class="supporters-status">
              <span>${escapeHtml(loading)}</span>
            </div>
          `;
      }
      if (tabState.error) {
        const title =
          this.selectedTab === "supporters"
            ? t("supporters_error_title", {}, "Couldn't load supporters")
            : this.selectedTab === "sponsors"
              ? t("sponsors_error_title", {}, "Couldn't load sponsors")
              : t("contributors_error_title", {}, "Couldn't load contributors");
        return `
            <div class="supporters-error-state">
              <h2>${escapeHtml(title)}</h2>
              <p>${escapeHtml(tabState.error)}</p>
              <button class="supporters-retry-button supporters-focusable focusable" data-focus-key="retry:${this.selectedTab}" data-action="retry">
                ${escapeHtml(t("action_retry", {}, "Retry"))}
              </button>
            </div>
          `;
      }
      if (tabState.loaded && !tabState.items.length) {
        const empty =
          this.selectedTab === "supporters"
            ? t("supporters_empty", {}, "No supporters found yet.")
            : this.selectedTab === "sponsors"
              ? t("sponsors_empty", {}, "No sponsors found yet.")
              : t("contributors_empty", {}, "No contributors found yet.");
        return `<div class="supporters-status">${escapeHtml(empty)}</div>`;
      }
      return `
          <div class="supporters-list-frame">
            <div class="supporters-list" role="tabpanel">
              ${tabState.items.map((item, index) => this.renderCard(item, index)).join("")}
            </div>
            ${settingsScrollIndicatorMarkup("vertical")}
          </div>
        `;
    },
    renderCard(item, index) {
      if (this.selectedTab === "contributors") return this.renderContributorCard(item, index);
      if (this.selectedTab === "sponsors") return this.renderSponsorCard(item, index);
      return this.renderSupporterCard(item, index);
    },
    renderNameAvatar(name) {
      return `<span class="supporters-avatar supporters-avatar-initials">${escapeHtml(initialsForName(name))}</span>`;
    },
    renderPersonAvatar(name, avatarUrl, { large = false } = {}) {
      const url = String(avatarUrl || "").trim();
      return `<span class="supporters-avatar supporters-avatar-image${large ? " large" : ""}">
          ${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" />` : ""}
          <span${url ? " hidden" : ""}>${escapeHtml(initialsForName(name))}</span>
        </span>`;
    },
    renderExternalIcon() {
      return `<svg class="supporters-card-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10M9 15 17 7M17 7h-5M17 7v5" /></svg>`;
    },
    renderSupporterCard(supporter, index) {
      const since = formatSupporterDate(supporter.supporterSince);
      return `
          <article class="supporters-person-card supporters-focusable focusable"
                   data-focus-key="item:supporters:${index}"
                   data-action="openItem"
                   data-tab="supporters"
                   data-item-index="${index}">
            ${this.renderPersonAvatar(supporter.name, supporter.avatarUrl)}
            <div class="supporters-card-copy">
              <h3>${escapeHtml(supporter.name)}</h3>
              <p>${escapeHtml(supporterTierLabel(supporter.membershipLevel))}</p>
              ${since ? `<p>${escapeHtml(t("supporters_since", { date: since }, `Supporting Nuvio since ${since}`))}</p>` : ""}
            </div>
            ${this.renderExternalIcon()}
          </article>
        `;
    },
    renderSponsorCard(sponsor, index) {
      return `
          <article class="supporters-person-card supporters-focusable focusable"
                   data-focus-key="item:sponsors:${index}"
                   data-action="openItem"
                   data-tab="sponsors"
                   data-item-index="${index}">
            ${this.renderNameAvatar(sponsor.name)}
            <div class="supporters-card-copy">
              <h3>${escapeHtml(sponsor.name)}</h3>
            </div>
            ${this.renderExternalIcon()}
          </article>
        `;
    }
  };
}
