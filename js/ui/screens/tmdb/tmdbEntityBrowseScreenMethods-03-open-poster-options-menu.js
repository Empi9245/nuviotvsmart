/* eslint-disable no-unused-vars */
import * as internals from "./tmdbEntityBrowseScreen.js";

export function createTmdbEntityBrowseScreenMethods03() {
  const { Router, ScreenUtils, posterItemFromNode, PosterOptionsDialogController, isBackEvent } = internals;

  return {
    async openPosterOptionsMenu(node) {
      const item = posterItemFromNode(node, node?.dataset?.itemType || "movie");
      if (!item?.id) {
        return false;
      }
      this.posterOptionsFocusKey = String(node.dataset.focusKey || "");
      if (!this.posterOptionsController) {
        this.posterOptionsController = new PosterOptionsDialogController({
          onDetails: (target) => {
            Router.navigate("detail", {
              itemId: target.id,
              itemType: target.type || "movie",
              fallbackTitle: target.title || "Untitled",
              fallbackPoster: target.poster || "",
              fallbackBackground: target.background || "",
              catalogType: target.catalogType || target.type || "movie"
            });
          },
          onDismiss: () => {
            this.pendingRestoreFocus = true;
            this.render();
          },
          onChanged: () => {
            void this.refreshWatchedTitleIds();
          }
        });
      }
      return this.posterOptionsController.open(item, {
        focusKey: this.posterOptionsFocusKey,
        itemIndex: Number(node.dataset.itemIndex || -1)
      });
    },
    closePosterOptionsMenu() {
      if (!this.posterOptionsController?.dialog) {
        return false;
      }
      this.posterOptionsController.destroy();
      this.posterOptionsFocusKey = "";
      return true;
    },
    openDetailFromNode(node) {
      if (!(node instanceof HTMLElement) || !node.dataset.itemId) {
        return false;
      }
      Router.navigate("detail", {
        itemId: node.dataset.itemId,
        itemType: node.dataset.itemType || "movie",
        fallbackTitle: node.dataset.itemTitle || "Untitled",
        fallbackPoster: node.dataset.posterSrc || "",
        fallbackBackground: node.dataset.backdropSrc || "",
        catalogType: node.dataset.itemType || "movie"
      });
      return true;
    },
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
      const current = this.container?.querySelector(".focusable.focused") || null;
      const posterHold = this.isPosterHoldTarget(current);
      if (code === 13 && posterHold) {
        event?.preventDefault?.();
        if (!event?.repeat && !this.hasPendingPosterHold(current)) {
          this.startPendingPosterHold(current);
        }
        return;
      }
      if (!posterHold || code !== 13) {
        this.cancelPendingPosterHold();
      }
      if (this.handleDpad(event)) {
        return;
      }
      if (code !== 13 || !current) {
        return;
      }
      const action = String(current.dataset.action || "");
      if (action === "retry") {
        await this.load();
      } else if (action === "openDetail") {
        this.openDetailFromNode(current);
      }
    },
    onKeyUp(event) {
      if (Number(event?.keyCode || 0) !== 13) {
        return;
      }
      const current = this.container?.querySelector(".tmdb-entity-card.focusable.focused") || null;
      if (this.completePendingPosterHold(current, event)) {
        event?.preventDefault?.();
      }
    },
    onPointerFocus(target) {
      if (this.isPosterHoldTarget(target)) {
        this.rememberFocusedCard(target);
      }
    },
    onPointerActivate(target) {
      const actionTarget = target?.closest?.("[data-action]");
      const action = String(actionTarget?.dataset?.action || "");
      if (action === "openDetail") {
        return this.openDetailFromNode(actionTarget);
      }
      if (action === "retry") {
        void this.load();
        return true;
      }
      return false;
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
      this.loadingRails?.clear?.();
      ScreenUtils.hide(this.container);
    }
  };
}
