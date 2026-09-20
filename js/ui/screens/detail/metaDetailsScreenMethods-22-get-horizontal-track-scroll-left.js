/* eslint-disable no-unused-vars */
import * as internals from "./metaDetailsScreenContext.js";

export function createMetaDetailsScreenMethods22() {
  const { DETAIL_TAB_FOCUS_TARGET, DETAIL_ROW_FOCUS_TARGET, isSeriesDetailMeta } = internals;

  return {
    getHorizontalTrackScrollLeft(horizontalTrack, target) {
      if (!(horizontalTrack instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        return 0;
      }
      const maxScrollLeft = Math.max(0, horizontalTrack.scrollWidth - horizontalTrack.clientWidth);
      if (horizontalTrack.classList.contains("series-episode-track")) {
        const styles = globalThis.getComputedStyle ? globalThis.getComputedStyle(horizontalTrack) : null;
        const leftPad = Math.max(0, Number.parseFloat(styles?.paddingLeft || "0") || 0);
        return Math.max(0, Math.min(maxScrollLeft, target.offsetLeft - leftPad));
      }
      if (horizontalTrack.classList.contains("detail-morelike-track") || horizontalTrack.classList.contains("detail-comments-track")) {
        const styles = globalThis.getComputedStyle ? globalThis.getComputedStyle(horizontalTrack) : null;
        const leftPad = Math.max(0, Number.parseFloat(styles?.paddingLeft || "0") || 0);
        return Math.max(0, Math.min(maxScrollLeft, target.offsetLeft - leftPad));
      }

      // The first focusable item already sits after the track's safe gutter.
      // Applying the generic edge padding to its offsetLeft leaves a residual
      // horizontal shift after navigating back to the start of TV rails.
      if (horizontalTrack.querySelector(".focusable") === target) {
        return 0;
      }

      const edgePadding = horizontalTrack.classList.contains("home-track") ? 0 : 24;
      const targetLeft = target.offsetLeft;
      const targetRight = targetLeft + target.offsetWidth;
      const viewLeft = horizontalTrack.scrollLeft;
      const viewRight = viewLeft + horizontalTrack.clientWidth;
      if (targetRight > viewRight - edgePadding) {
        return Math.max(0, Math.min(maxScrollLeft, targetRight - horizontalTrack.clientWidth + edgePadding));
      }
      if (targetLeft < viewLeft + edgePadding) {
        return Math.max(0, Math.min(maxScrollLeft, targetLeft - edgePadding));
      }
      return viewLeft;
    },
    syncDetailScrollBounds(target) {
      const detailContent = this.getDetailContentScroller();
      if (!detailContent || !(target instanceof HTMLElement) || !detailContent.contains(target)) {
        return;
      }
      const focusables = Array.from(detailContent.querySelectorAll(".focusable")).filter((node) => node instanceof HTMLElement);
      if (!focusables.length) {
        return;
      }
      const targetGroup = this.getDetailFocusGroup(target);
      const firstGroup = this.getDetailFocusGroup(focusables[0]);
      const lastGroup = this.getDetailFocusGroup(focusables[focusables.length - 1]);
      if (targetGroup && firstGroup && targetGroup === firstGroup) {
        detailContent.scrollTop = 0;
        return;
      }
      if (targetGroup && lastGroup && targetGroup === lastGroup) {
        detailContent.scrollTop = Math.max(0, detailContent.scrollHeight - detailContent.clientHeight);
      }
    },
    getRememberedEpisodeIndex(episodes = []) {
      const seasonEpisodes = this.getSelectedSeasonEpisodes();
      const total = Array.isArray(episodes) && episodes.length ? Math.max(episodes.length, seasonEpisodes.length) : seasonEpisodes.length;
      if (!total) {
        return 0;
      }
      const seasonKey = String(Number(this.selectedSeason || 0) || 0);
      const remembered = Number(this.episodeFocusIndexBySeason?.[seasonKey]);
      if (Number.isFinite(remembered) && remembered >= 0) {
        return Math.min(total - 1, remembered);
      }
      return 0;
    },
    getSelectedSeasonIndex(seasons = []) {
      if (!Array.isArray(seasons) || !seasons.length) {
        return 0;
      }
      const selectedIndex = seasons.findIndex((node) => Number(node?.dataset?.season || 0) === Number(this.selectedSeason || 0));
      return selectedIndex >= 0 ? selectedIndex : 0;
    },
    getActiveInsightTabKey() {
      return isSeriesDetailMeta(this.meta, this.episodes)
        ? String(this.seriesInsightTab || "cast")
        : String(this.movieInsightTab || "cast");
    },
    getActiveInsightTabIndex(tabs = [], fallbackIndex = 0) {
      if (!Array.isArray(tabs) || !tabs.length) {
        return 0;
      }
      const activeTabKey = this.getActiveInsightTabKey();
      const activeTabIndex = tabs.findIndex((node) => String(node?.dataset?.tab || "") === activeTabKey);
      if (activeTabIndex >= 0) {
        return activeTabIndex;
      }
      const selectedTabIndex = tabs.findIndex((node) => node?.classList?.contains("selected"));
      if (selectedTabIndex >= 0) {
        return selectedTabIndex;
      }
      return Math.max(0, Math.min(tabs.length - 1, Number(fallbackIndex) || 0));
    },
    rememberEpisodeFocus(target, list = null) {
      if (!(target instanceof HTMLElement) || !target.matches(".series-episode-card")) {
        return;
      }
      const seasonKey = String(Number(this.selectedSeason || 0) || 0);
      const absoluteIndex = Number(target.dataset.episodeIndex || -1);
      if (Number.isFinite(absoluteIndex) && absoluteIndex >= 0) {
        this.episodeFocusIndexBySeason[seasonKey] = absoluteIndex;
        return;
      }
      const items =
        Array.isArray(list) && list.length
          ? list
          : Array.from(this.container?.querySelectorAll(".series-episode-track .series-episode-card.focusable") || []);
      const index = items.indexOf(target);
      if (index >= 0) {
        this.episodeFocusIndexBySeason[seasonKey] = index;
      }
    },
    getRememberedRailIndex(railKey, items = []) {
      if (!railKey || !Array.isArray(items) || !items.length) {
        return 0;
      }
      const remembered = Number(this.railFocusIndexByKey?.[railKey]);
      if (Number.isFinite(remembered) && remembered >= 0) {
        return Math.min(items.length - 1, remembered);
      }
      return 0;
    },
    getRememberedCompanyIndex(companyTracks = [], companyCards = [], trackIndex = 0) {
      const cards = Array.isArray(companyCards?.[trackIndex]) ? companyCards[trackIndex] : [];
      if (!cards.length) {
        return 0;
      }
      const railKey = String(companyTracks?.[trackIndex]?.dataset?.scrollKey || "").trim();
      if (!railKey) {
        return 0;
      }
      return this.getRememberedRailIndex(railKey, cards);
    },
    rememberRailFocus(target, list = null) {
      if (!(target instanceof HTMLElement) || !target.matches(".detail-morelike-card, .detail-company-card")) {
        return;
      }
      const track = target.closest("[data-scroll-key]");
      const railKey = String(track?.dataset?.scrollKey || "").trim();
      if (!railKey) {
        return;
      }
      const itemSelector = target.matches(".detail-company-card") ? ".detail-company-card.focusable" : ".detail-morelike-card.focusable";
      const items = Array.isArray(list) && list.length ? list : Array.from(track.querySelectorAll(itemSelector));
      const index = items.indexOf(target);
      if (index >= 0) {
        this.railFocusIndexByKey[railKey] = index;
      }
    },
    getActivePreviewRailKey() {
      const kind = isSeriesDetailMeta(this.meta, this.episodes) ? "series" : "movie";
      const activeTab = kind === "series" ? String(this.seriesInsightTab || "") : String(this.movieInsightTab || "");
      const railTab = ["morelike", "trailer", "collection"].includes(activeTab) ? activeTab : "morelike";
      return `${railTab}:${kind}`;
    },
    getPreviewRailTabKey(target) {
      const railKey = String(target?.closest?.(".detail-morelike-track")?.dataset?.scrollKey || "");
      const railTab = railKey.split(":", 1)[0];
      if (["morelike", "trailer", "collection"].includes(railTab)) {
        return railTab;
      }
      return this.getActiveInsightTabKey();
    },
    getInsightTabIndexForPreviewRail(tabs = [], target) {
      const railTab = this.getPreviewRailTabKey(target);
      const index = tabs.findIndex((node) => String(node?.dataset?.tab || "") === railTab);
      return index >= 0 ? index : this.getActiveInsightTabIndex(tabs);
    },
    focusInList(list, targetIndex, options = {}) {
      if (!Array.isArray(list) || !list.length) {
        return false;
      }
      let preserveVerticalScroll = Boolean(options?.preserveVerticalScroll);
      const animated = options?.animated !== false;
      const index = Math.max(0, Math.min(list.length - 1, targetIndex));
      const target = list[index];
      if (!target) {
        return false;
      }
      const previous = this.container.querySelector(".focused");
      this.container.querySelectorAll(".focused").forEach((node) => {
        if (node !== target) node.classList.remove("focused");
      });
      target.classList.add("focused");
      target.focus({ preventScroll: true });
      this.rememberEpisodeFocus(target, list);
      this.rememberRailFocus(target, list);
      const horizontalTrack = target.closest(
        ".series-episode-track, .series-cast-track, .movie-cast-track, .home-track, .series-episode-ratings-grid, .series-rating-seasons, .detail-morelike-track, .detail-company-track, .series-season-row, .series-insight-tabs, .detail-comments-modes, .detail-comments-track"
      );
      if (horizontalTrack) {
        if (previous && previous !== target && horizontalTrack.contains(previous)) {
          preserveVerticalScroll = true;
        }
        const nextScrollLeft = this.getHorizontalTrackScrollLeft(horizontalTrack, target);
        if (animated) {
          this.animateScroll(horizontalTrack, "x", nextScrollLeft, 260);
        } else {
          horizontalTrack.scrollLeft = nextScrollLeft;
        }
        const detailContent = this.getDetailContentScroller();
        if (!preserveVerticalScroll && detailContent && detailContent.contains(horizontalTrack)) {
          const verticalTarget = horizontalTrack.matches(".detail-comments-modes, .detail-comments-track")
            ? target.closest(".detail-comments-section") || horizontalTrack
            : horizontalTrack;
          const rect = verticalTarget.getBoundingClientRect();
          const contentRect = detailContent.getBoundingClientRect();
          const focusTarget = horizontalTrack.matches(".series-insight-tabs") ? DETAIL_TAB_FOCUS_TARGET : DETAIL_ROW_FOCUS_TARGET;
          const targetTop = contentRect.top + detailContent.clientHeight * focusTarget;
          const nextScrollTop = detailContent.scrollTop + rect.top - targetTop;
          if (animated) {
            this.animateScroll(detailContent, "y", nextScrollTop, 280);
          } else {
            const maxScrollTop = Math.max(0, detailContent.scrollHeight - detailContent.clientHeight);
            detailContent.scrollTop = Math.max(0, Math.min(maxScrollTop, Math.round(nextScrollTop)));
          }
        }
      } else if (target.closest?.(".series-detail-actions")) {
        const detailContent = this.getDetailContentScroller();
        if (!preserveVerticalScroll && detailContent) {
          if (animated) {
            this.animateScroll(detailContent, "y", 0, 280);
          } else {
            detailContent.scrollTop = 0;
          }
        }
      } else if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      if (!preserveVerticalScroll && !animated) {
        this.syncDetailScrollBounds(target);
      }
      this.syncEpisodeTitleMarquee();
      return true;
    },
    resolvePopupFocusNode() {
      let current = this.container.querySelector(".focusable.focused");
      if (current) {
        return current;
      }
      const active = document.activeElement;
      if (active && active.classList?.contains("focusable") && this.container.contains(active)) {
        active.classList.add("focused");
        return active;
      }
      const first = this.container.querySelector(".series-stream-filter.focusable, .series-stream-card.focusable");
      if (first) {
        this.container.querySelectorAll(".focusable").forEach((node) => node.classList.remove("focused"));
        first.classList.add("focused");
        first.focus();
        return first;
      }
      return null;
    },
    getStreamChooserLists() {
      const filters = Array.from(this.container.querySelectorAll(".series-stream-filter.focusable"));
      const cards = Array.from(this.container.querySelectorAll(".series-stream-card.focusable"));
      const selectedFilterIndex = Math.max(
        0,
        filters.findIndex((node) => node.classList.contains("selected"))
      );
      return { filters, cards, selectedFilterIndex };
    },
    syncStreamChooserFocusFromDom() {
      const { filters, cards, selectedFilterIndex } = this.getStreamChooserLists();
      const activeElement = document.activeElement;
      const focusedFilterIndex = filters.findIndex((node) => node.classList.contains("focused") || node === activeElement);
      if (focusedFilterIndex >= 0) {
        this.streamChooserFocus = { zone: "filter", index: focusedFilterIndex };
        return this.streamChooserFocus;
      }
      const focusedCardIndex = cards.findIndex((node) => node.classList.contains("focused") || node === activeElement);
      if (focusedCardIndex >= 0) {
        this.streamChooserFocus = { zone: "card", index: focusedCardIndex };
        return this.streamChooserFocus;
      }
      this.streamChooserFocus = { zone: "filter", index: selectedFilterIndex };
      return this.streamChooserFocus;
    }
  };
}
