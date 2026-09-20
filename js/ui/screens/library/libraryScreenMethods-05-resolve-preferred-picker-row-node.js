/* eslint-disable no-unused-vars */
import * as internals from "./libraryScreen.js";

export function createLibraryScreenMethods05() {
  const { getRootSidebarNodes, findNearestNodeByCenterX, groupNodesByRow } = internals;

  return {
    resolvePreferredPickerRowNode(referenceNode = null) {
      const anchors = Array.from(this.container?.querySelectorAll(".library-picker-row .library-picker-anchor.focusable") || []);
      if (!anchors.length) {
        return null;
      }
      const remembered = this.lastMainFocus && this.lastMainFocus.closest?.(".library-picker-row") ? this.resolveLastMainFocus() : null;
      return remembered || findNearestNodeByCenterX(referenceNode, anchors) || anchors[0] || null;
    },
    resolveRelativePickerRowNode(current, direction) {
      if (!current || !current.matches?.(".library-picker-anchor.focusable") || !current.closest?.(".library-picker-row")) {
        return null;
      }
      const anchors = Array.from(this.container?.querySelectorAll(".library-picker-row .library-picker-anchor.focusable") || []);
      if (!anchors.length) {
        return null;
      }
      const rows = groupNodesByRow(anchors);
      const rowIndex = rows.findIndex((row) => row.nodes.includes(current));
      if (rowIndex < 0) {
        return null;
      }
      const targetRow = direction === "up" ? rows[rowIndex - 1] : direction === "down" ? rows[rowIndex + 1] : null;
      if (!targetRow?.nodes?.length) {
        return null;
      }
      return findNearestNodeByCenterX(current, targetRow.nodes) || targetRow.nodes[0] || null;
    },
    resolvePreferredGridNode(referenceNode = null) {
      const cards = Array.from(this.container?.querySelectorAll(".library-grid-card.focusable") || []);
      if (!cards.length) {
        return null;
      }
      const remembered = this.lastMainFocus && this.lastMainFocus.closest?.(".library-grid") ? this.resolveLastMainFocus() : null;
      return remembered || findNearestNodeByCenterX(referenceNode, cards) || cards[0] || null;
    },
    buildGridRows() {
      const cards = Array.from(this.container?.querySelectorAll(".library-grid-card.focusable") || []);
      this.gridRows = cards.length ? groupNodesByRow(cards) : [];
    },
    resolveRelativeGridNode(current, direction) {
      if (!current || !current.matches?.(".library-grid-card.focusable")) {
        return null;
      }
      const rows = this.gridRows || [];
      if (!rows.length) {
        return null;
      }
      const currentRect = current.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const rowIndex = rows.findIndex((row) => row.nodes.includes(current));
      if (rowIndex < 0) {
        return null;
      }
      const currentRow = rows[rowIndex];
      const columnIndex = Math.max(0, currentRow.nodes.indexOf(current));

      if (direction === "left") {
        return currentRow.nodes[columnIndex - 1] || current;
      }
      if (direction === "right") {
        return currentRow.nodes[columnIndex + 1] || current;
      }
      if (direction === "up") {
        const previousRow = rows[rowIndex - 1];
        return previousRow ? findNearestNodeByCenterX(current, previousRow.nodes) : current;
      }
      if (direction === "down") {
        const nextRow = rows[rowIndex + 1];
        if (!nextRow) {
          return current;
        }
        let bestNode = nextRow.nodes[0] || null;
        let bestDistance = Number.POSITIVE_INFINITY;
        nextRow.nodes.forEach((node) => {
          const rect = node.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const distance = Math.abs(centerX - currentCenterX);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestNode = node;
          }
        });
        return bestNode;
      }
      return null;
    },
    isTopGridRowNode(node) {
      if (!node?.matches?.(".library-grid-card.focusable")) {
        return false;
      }
      return Boolean(this.gridRows?.[0]?.nodes?.includes(node));
    },
    handleActionsRowNavigation(event, current) {
      if (!current || !current.closest?.(".library-actions-row")) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      if (code === 37 || code === 39) {
        const buttons = Array.from(this.container?.querySelectorAll(".library-actions-row .focusable") || []).filter(
          (node) => !node.disabled
        );
        if (!buttons.length) {
          return false;
        }
        const currentIndex = Math.max(0, buttons.indexOf(current));
        const nextIndex = Math.max(0, Math.min(buttons.length - 1, currentIndex + (code === 37 ? -1 : 1)));
        event?.preventDefault?.();
        this.setFocusedNode(buttons[nextIndex] || current);
        return true;
      }
      if (code === 38) {
        const target = this.resolvePreferredPickerRowNode(current);
        if (!target) {
          return false;
        }
        event?.preventDefault?.();
        this.setFocusedNode(target);
        return true;
      }
      if (code === 40) {
        const target = this.resolvePreferredGridNode(current);
        if (!target) {
          return false;
        }
        event?.preventDefault?.();
        this.setFocusedNode(target);
        return true;
      }
      return false;
    },
    handleContentRowMemoryNavigation(event, current) {
      const state = this.controller.state;
      if (state.sourceMode === "local" || state.expandedPicker || !current) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      const isTopGridRow = this.isTopGridRowNode(current);
      const fromPickerRow =
        code === 40 && current.matches?.(".library-picker-anchor.focusable") && Boolean(current.closest?.(".library-picker-row"));
      const fromGrid =
        code === 38 && current.matches?.(".library-grid-card.focusable") && Boolean(current.closest?.(".library-grid")) && isTopGridRow;
      const fromActionsRow = current.closest?.(".library-actions-row") || null;
      if (fromActionsRow) {
        return this.handleActionsRowNavigation(event, current);
      }
      if (!fromPickerRow && !fromGrid) {
        return false;
      }
      const target = this.resolvePreferredActionsRowNode();
      if (!target) {
        return false;
      }
      event?.preventDefault?.();
      this.setFocusedNode(target);
      return true;
    },
    handleFilterRowHorizontalNavigation(event, current) {
      if (!current || !current.matches?.(".library-picker-anchor.focusable") || !current.closest?.(".library-picker-row")) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      const delta = code === 37 ? -1 : code === 39 ? 1 : 0;
      if (!delta) {
        return false;
      }
      const anchors = Array.from(this.container?.querySelectorAll(".library-picker-row .library-picker-anchor.focusable") || []);
      if (!anchors.length) {
        return false;
      }
      const currentIndex = Math.max(0, anchors.indexOf(current));
      const nextIndex = Math.max(0, Math.min(anchors.length - 1, currentIndex + delta));
      if (nextIndex === currentIndex) {
        event?.preventDefault?.();
        return true;
      }
      const target = anchors[nextIndex] || null;
      if (!target) {
        return false;
      }
      event?.preventDefault?.();
      this.setFocusedNode(target);
      return true;
    },
    handleFilterRowVerticalNavigation(event, current) {
      if (!current || !current.matches?.(".library-picker-anchor.focusable") || !current.closest?.(".library-picker-row")) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      const direction = code === 38 ? "up" : code === 40 ? "down" : "";
      if (!direction) {
        return false;
      }
      const target = this.resolveRelativePickerRowNode(current, direction);
      if (!target || target === current) {
        return false;
      }
      event?.preventDefault?.();
      this.setFocusedNode(target);
      return true;
    },
    handleGridNavigation(event, current) {
      if (!current || !current.matches?.(".library-grid-card.focusable") || !current.closest?.(".library-grid")) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      const direction = code === 37 ? "left" : code === 39 ? "right" : code === 38 ? "up" : code === 40 ? "down" : "";
      if (!direction) {
        return false;
      }
      if (direction === "up") {
        const target = this.resolveRelativeGridNode(current, direction);
        if (target && target !== current) {
          event?.preventDefault?.();
          this.setFocusedNode(target);
          return true;
        }
        const pickerTarget = this.resolvePreferredPickerRowNode(current);
        if (!pickerTarget || pickerTarget === current) {
          return false;
        }
        event?.preventDefault?.();
        this.setFocusedNode(pickerTarget);
        return true;
      }
      const target = this.resolveRelativeGridNode(current, direction);
      if (!target) {
        return false;
      }
      event?.preventDefault?.();
      this.setFocusedNode(target);
      return true;
    },
    handleSidebarVerticalNavigation(event, current) {
      if (!current || !this.isSidebarNode(current)) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      const delta = code === 38 ? -1 : code === 40 ? 1 : 0;
      if (!delta) {
        return false;
      }
      const nodes = getRootSidebarNodes(this.container, this.layoutPrefs);
      if (!nodes.length) {
        return false;
      }
      const currentIndex = Math.max(0, nodes.indexOf(current));
      const nextIndex = Math.max(0, Math.min(nodes.length - 1, currentIndex + delta));
      event?.preventDefault?.();
      this.setFocusedNode(nodes[nextIndex] || current);
      return true;
    },
    resolvePreferredPrivacyNode() {
      const options = Array.from(this.container?.querySelectorAll(".library-list-editor .library-privacy-button.focusable") || []);
      if (!options.length) {
        return null;
      }
      return (
        options.find((node) => String(node.dataset.privacy || "") === this.lastPrivacyFocus && !node.disabled) ||
        options.find((node) => node.classList.contains("selected") && !node.disabled) ||
        options.find((node) => !node.disabled) ||
        options[0] ||
        null
      );
    }
  };
}
