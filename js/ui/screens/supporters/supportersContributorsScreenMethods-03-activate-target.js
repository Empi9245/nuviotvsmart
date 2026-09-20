/* eslint-disable no-unused-vars */
import * as internals from "./supportersContributorsScreen.js";

export function createSupportersContributorsScreenMethods03() {
  const { Router, Platform, SUPPORT_URL, MembershipOverviewRepository, DEFAULT_TAB, normalizeBaseUrl, visibleFocusableNodes } = internals;

  return {
    async activateTarget(target) {
      const action = String(target?.dataset?.action || "");
      if (!action) return false;
      if (action === "selectTab") {
        await this.selectTab(String(target.dataset.tab || DEFAULT_TAB));
        return true;
      }
      if (action === "showMembershipQr") {
        this.showMembershipQr = true;
        this.focusKey = "membership:back";
        await this.render();
        return true;
      }
      if (action === "hideMembershipQr") {
        this.showMembershipQr = false;
        this.focusKey = "membership:action";
        await this.render();
        return true;
      }
      if (action === "refreshMembership") {
        this.focusKey = MembershipOverviewRepository.getState()?.overview ? "membership:action" : "membership:refresh";
        await MembershipOverviewRepository.refresh();
        if (Router.getCurrent() === "supportersContributors") {
          await this.render();
        }
        return true;
      }
      if (action === "retry") {
        await this.loadTabIfNeeded(this.selectedTab, true);
        return true;
      }
      if (action === "openItem") {
        const tab = String(target.dataset.tab || this.selectedTab);
        const index = Number(target.dataset.itemIndex || 0);
        const item = this.state?.[tab]?.items?.[index];
        if (item) {
          this.dialog = { type: tab, item, returnFocusKey: this.focusKey, showSupportQr: false };
          this.focusKey = "dialog:primary";
          await this.render();
        }
        return true;
      }
      if (action === "closeDialog") {
        const returnFocusKey = this.dialog?.returnFocusKey;
        this.dialog = null;
        this.focusKey = returnFocusKey || `tab:${this.selectedTab}`;
        this.preserveListScrollAfterFocus = true;
        await this.render();
        return true;
      }
      if (action === "toggleContributorQr") {
        if (this.dialog) {
          this.dialog.showSupportQr = !this.dialog.showSupportQr;
          this.focusKey = "dialog:kofi";
          await this.render();
        }
        return true;
      }
      if (action === "openSupport") {
        window.open?.(normalizeBaseUrl(SUPPORT_URL), "_blank");
        return true;
      }
      if (action === "openSponsor") {
        const url = this.dialog?.item?.channelUrl;
        if (url) window.open?.(url, "_blank");
        return true;
      }
      if (action === "openGithub") {
        const url = this.dialog?.item?.profileUrl;
        if (url) window.open?.(url, "_blank");
        return true;
      }
      return false;
    },
    async onKeyDown(event) {
      const code = Number(event?.keyCode || 0);
      const key = String(event?.key || "");
      if (Platform.isBackEvent(event) || code === 27 || key === "Escape" || key === "Esc" || key === "Backspace") {
        event?.preventDefault?.();
        return this.handleBack();
      }
      const direction = code === 37 ? "left" : code === 38 ? "up" : code === 39 ? "right" : code === 40 ? "down" : null;
      if (direction) {
        event?.preventDefault?.();
        const nodes = visibleFocusableNodes(this.dialog ? this.container.querySelector(".supporters-dialog") : this.container);
        const current = this.container.querySelector(".focusable.focused") || nodes[0];
        const target = this.getDirectionalTarget(current, direction);
        if (target) {
          this.focusTarget(target);
          if (target.dataset.action === "selectTab" && target.dataset.tab !== this.selectedTab) {
            await this.selectTab(String(target.dataset.tab || DEFAULT_TAB), { focus: true });
          }
        }
        return;
      }
      const isActivate = code === 13 || code === 23 || ["Enter", "NumpadEnter", "OK", "Select"].includes(String(event?.key || ""));
      if (!isActivate) return;
      event?.preventDefault?.();
      const current = this.container.querySelector(".focusable.focused");
      await this.activateTarget(current);
    },
    consumeBackRequest() {
      if (!this.dialog && !this.showMembershipQr) {
        return false;
      }
      void this.handleBack();
      return true;
    },
    async handleBack() {
      if (this.dialog) {
        const returnFocusKey = this.dialog.returnFocusKey;
        this.dialog = null;
        this.focusKey = returnFocusKey || `tab:${this.selectedTab}`;
        this.preserveListScrollAfterFocus = true;
        await this.render();
        return;
      }
      if (this.showMembershipQr) {
        this.showMembershipQr = false;
        this.focusKey = "membership:action";
        await this.render();
        return;
      }
      Router.back();
    },
    onPointerFocus(target) {
      if (!target) return;
      this.focusKey = String(target.dataset.focusKey || this.focusKey || "");
      if (target.dataset.action === "selectTab" && target.dataset.tab && target.dataset.tab !== this.selectedTab) {
        void this.selectTab(String(target.dataset.tab), { focus: true });
      }
    },
    async onPointerActivate(target) {
      return await this.activateTarget(target);
    }
  };
}
