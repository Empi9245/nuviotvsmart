/* eslint-disable no-unused-vars */
import * as internals from "./catalogSeeAllScreen.js";

export function createCatalogSeeAllScreenMethods03() {
  const { Router, ScreenUtils, isBackEvent } = internals;

  return {
    async onKeyDown(event) {
      if (isBackEvent(event)) {
        event?.preventDefault?.();
        if (this.closePosterOptionsMenu()) {
          return;
        }
        Router.back();
        return;
      }
      const code = Number(event?.keyCode || 0);
      const focusedBeforeDpad = this.container?.querySelector(".focusable.focused") || null;
      if (code === 13 && this.isPosterHoldTarget(focusedBeforeDpad)) {
        event?.preventDefault?.();
        if (!event?.repeat && !this.hasPendingPosterHold(focusedBeforeDpad)) {
          this.startPendingPosterHold(focusedBeforeDpad);
        }
        return;
      }
      if (this.handleGridDpad(event)) {
        return;
      }
      if (code !== 13) {
        return;
      }
      const current = this.container.querySelector(".focusable.focused");
      if (!current) {
        return;
      }
      const action = String(current.dataset.action || "");
      if (action === "openDetail") {
        this.openDetailFromNode(current);
      }
    },
    onKeyUp(event) {
      if (Number(event?.keyCode || 0) !== 13) {
        return;
      }
      const current = this.container?.querySelector(".seeall-card.focusable.focused[data-action='openDetail']") || null;
      if (this.completePendingPosterHold(current, event)) {
        event?.preventDefault?.();
      }
    },
    consumeBackRequest() {
      return this.closePosterOptionsMenu();
    },
    cleanup() {
      this.loadToken = (this.loadToken || 0) + 1;
      this.cancelPendingPosterHold();
      this.posterOptionsController?.destroy?.({ restoreFocus: false });
      this.posterOptionsController = null;
      this.posterOptionsFocusKey = "";
      ScreenUtils.hide(this.container);
    }
  };
}
