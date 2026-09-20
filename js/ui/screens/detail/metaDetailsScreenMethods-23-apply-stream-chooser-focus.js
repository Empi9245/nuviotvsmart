/* eslint-disable no-unused-vars */
import * as internals from "./metaDetailsScreenContext.js";

export function createMetaDetailsScreenMethods23() {
  const { getDpadDirection } = internals;

  return {
    applyStreamChooserFocus() {
      const { filters, cards, selectedFilterIndex } = this.getStreamChooserLists();
      if (!filters.length && !cards.length) {
        this.streamChooserFocus = null;
        return false;
      }

      if (!this.streamChooserFocus) {
        this.syncStreamChooserFocusFromDom();
      }
      let zone = this.streamChooserFocus?.zone || "filter";
      let index = Number(this.streamChooserFocus?.index || 0);

      if (zone === "filter" && !filters.length && cards.length) {
        zone = "card";
        index = 0;
      } else if (zone === "card" && !cards.length && filters.length) {
        zone = "filter";
        index = selectedFilterIndex;
      }

      if (zone === "filter") {
        index = Math.max(0, Math.min(filters.length - 1, index));
        this.streamChooserFocus = { zone, index };
        return this.focusInList(filters, index);
      }

      index = Math.max(0, Math.min(cards.length - 1, index));
      this.streamChooserFocus = { zone: "card", index };
      return this.focusInList(cards, index);
    },
    handleStreamChooserDpad(event) {
      if (!this.pendingEpisodeSelection && !this.pendingMovieSelection) {
        return false;
      }
      const pending = this.getActivePendingSelection();
      if (pending?.loading && !pending?.streams?.length) {
        if (typeof event?.preventDefault === "function") {
          event.preventDefault();
        }
        return true;
      }
      const direction = getDpadDirection(event);
      if (!direction) {
        return false;
      }

      const { filters, cards, selectedFilterIndex } = this.getStreamChooserLists();
      const hasValidLocalFocus =
        this.streamChooserFocus &&
        ((this.streamChooserFocus.zone === "filter" &&
          filters.length &&
          Number(this.streamChooserFocus.index) >= 0 &&
          Number(this.streamChooserFocus.index) < filters.length) ||
          (this.streamChooserFocus.zone === "card" &&
            cards.length &&
            Number(this.streamChooserFocus.index) >= 0 &&
            Number(this.streamChooserFocus.index) < cards.length));
      const focusState = hasValidLocalFocus ? this.streamChooserFocus : this.syncStreamChooserFocusFromDom();
      let zone = focusState?.zone || (filters.length ? "filter" : "card");
      let index = Number(focusState?.index || 0);
      if (zone === "filter" && !filters.length && cards.length) {
        zone = "card";
        index = Math.max(0, Math.min(cards.length - 1, index));
      } else if (zone === "card" && !cards.length && filters.length) {
        zone = "filter";
        index = selectedFilterIndex;
      }
      if (zone === "filter" && filters.length) {
        const focusedFilterIndex = filters.findIndex((node) => node.classList.contains("focused") || node === document.activeElement);
        if (focusedFilterIndex >= 0) {
          index = focusedFilterIndex;
        }
      } else if (zone === "card" && cards.length) {
        const focusedCardIndex = cards.findIndex((node) => node.classList.contains("focused") || node === document.activeElement);
        if (focusedCardIndex >= 0) {
          index = focusedCardIndex;
        }
      }

      if (typeof event?.preventDefault === "function") {
        event.preventDefault();
      }

      if (zone === "filter") {
        if (direction === "left") {
          this.streamChooserFocus = { zone, index: Math.max(0, index - 1) };
          return this.applyStreamChooserFocus() || true;
        }
        if (direction === "right") {
          this.streamChooserFocus = { zone, index: Math.min(filters.length - 1, index + 1) };
          return this.applyStreamChooserFocus() || true;
        }
        if (direction === "down" && cards.length) {
          this.streamChooserFocus = { zone: "card", index: 0 };
          return this.applyStreamChooserFocus() || true;
        }
        return true;
      }

      if (zone === "card") {
        if (direction === "up") {
          if (index > 0) {
            this.streamChooserFocus = { zone: "card", index: index - 1 };
            return this.applyStreamChooserFocus() || true;
          }
          if (filters.length) {
            this.streamChooserFocus = { zone: "filter", index: selectedFilterIndex };
            return this.applyStreamChooserFocus() || true;
          }
          return true;
        }
        if (direction === "down") {
          this.streamChooserFocus = { zone: "card", index: Math.min(cards.length - 1, index + 1) };
          return this.applyStreamChooserFocus() || true;
        }
        if (direction === "left" || direction === "right") {
          return true;
        }
        return true;
      }

      if (direction === "up" && filters.length) {
        this.streamChooserFocus = { zone: "filter", index: selectedFilterIndex };
        return this.applyStreamChooserFocus() || true;
      }
      if (direction === "down" && cards.length) {
        this.streamChooserFocus = { zone: "card", index: 0 };
        return this.applyStreamChooserFocus() || true;
      }

      return true;
    }
  };
}
