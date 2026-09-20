/* eslint-disable no-unused-vars */
import * as internals from "./libraryScreen.js";

export function createLibraryScreenMethods06() {
  const {
    Router,
    CloudLibraryPlaybackProgressStore,
    CloudLibraryPlaybackSessionStore,
    getRootSidebarNodes,
    getRootSidebarSelectedNode,
    isRootSidebarNode,
    setModernSidebarExpanded,
    findNearestNodeByCenterX
  } = internals;

  return {
    handlePrivacyMemoryNavigation(event, current) {
      const state = this.controller.getState();
      if (!state.listEditorState || !current) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      if ((code === 37 || code === 39) && current.matches?.(".library-privacy-button.focusable")) {
        const options = Array.from(this.container?.querySelectorAll(".library-list-editor .library-privacy-button.focusable") || []).filter(
          (node) => !node.disabled
        );
        const currentIndex = options.indexOf(current);
        if (currentIndex < 0) {
          return false;
        }
        const delta = code === 37 ? -1 : 1;
        const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
        const target = options[nextIndex] || current;
        event?.preventDefault?.();
        this.setFocusedNode(target);
        return true;
      }
      const fromDescription = code === 40 && current.matches?.(".library-dialog-textarea.focusable[data-editor-field='description']");
      const fromActions =
        code === 38 &&
        current.matches?.(
          ".library-list-editor .library-action-button.focusable[data-action='saveListEditor'], .library-list-editor .library-action-button.focusable[data-action='cancelListEditor']"
        );
      if (!fromDescription && !fromActions) {
        return false;
      }
      const target = this.resolvePreferredPrivacyNode();
      if (!target) {
        return false;
      }
      event?.preventDefault?.();
      this.setFocusedNode(target);
      return true;
    },
    handleManageDialogNavigation(event, current) {
      if (!this.controller.getState().showManageDialog || !current?.closest?.(".library-manage-dialog")) {
        return false;
      }
      const code = Number(event?.keyCode || 0);
      const direction = code === 37 ? "left" : code === 39 ? "right" : code === 38 ? "up" : code === 40 ? "down" : "";
      if (!direction) {
        return false;
      }

      const listButtons = Array.from(this.container?.querySelectorAll(".library-manage-list-button.focusable") || []).filter(
        (node) => !node.disabled
      );
      const actionRows = Array.from(this.container?.querySelectorAll(".library-manage-actions-row") || []);
      const rowButtons = actionRows.map((row) =>
        Array.from(row.querySelectorAll(".library-action-button.focusable")).filter((node) => !node.disabled)
      );
      const firstRow = rowButtons[0] || [];
      const secondRow = rowButtons[1] || [];
      const nearestInRow = (row) => findNearestNodeByCenterX(current, row) || row[0] || null;
      let target = null;

      if (current.matches?.(".library-manage-list-button")) {
        const index = listButtons.indexOf(current);
        if (direction === "up") {
          target = listButtons[index - 1] || current;
        } else if (direction === "down") {
          target = listButtons[index + 1] || firstRow[0] || current;
        } else if (direction === "left" || direction === "right") {
          target = current;
        }
      } else if (current.closest?.(".library-manage-actions-row") === actionRows[0]) {
        const index = firstRow.indexOf(current);
        if (direction === "left") {
          target = firstRow[index - 1] || current;
        } else if (direction === "right") {
          target = firstRow[index + 1] || current;
        } else if (direction === "up") {
          target = listButtons[listButtons.length - 1] || current;
        } else if (direction === "down") {
          target = nearestInRow(secondRow) || current;
        }
      } else if (current.closest?.(".library-manage-actions-row") === actionRows[1]) {
        const index = secondRow.indexOf(current);
        if (direction === "left") {
          target = secondRow[index - 1] || current;
        } else if (direction === "right") {
          target = secondRow[index + 1] || current;
        } else if (direction === "up") {
          target = nearestInRow(firstRow) || current;
        } else if (direction === "down") {
          target = current;
        }
      }

      if (!target) {
        return false;
      }
      event?.preventDefault?.();
      this.setFocusedNode(target);
      return true;
    },
    isSidebarNode(node) {
      return isRootSidebarNode(node);
    },
    async focusSidebarNode(preferredNode = null) {
      this.focusZone = "sidebar";
      if (this.layoutPrefs?.modernSidebar && !this.sidebarExpanded) {
        this.sidebarExpanded = true;
        setModernSidebarExpanded(this.container, true);
      }
      const target =
        preferredNode ||
        getRootSidebarSelectedNode(this.container, this.layoutPrefs) ||
        getRootSidebarNodes(this.container, this.layoutPrefs)[0] ||
        null;
      if (!target) {
        return false;
      }
      this.setFocusedNode(target);
      return true;
    },
    async focusMainNode(preferredNode = null, { preferEntryPoint = false } = {}) {
      this.focusZone = "content";
      if (this.layoutPrefs?.modernSidebar && this.sidebarExpanded) {
        this.sidebarExpanded = false;
        setModernSidebarExpanded(this.container, false);
      }
      if (this.pendingHydrationState) {
        const pendingHydrationState = this.pendingHydrationState;
        this.pendingHydrationState = null;
        this.updateRenderedLibraryContent(pendingHydrationState, {
          preservePickerRow: false
        });
      }
      const target = preferredNode || (preferEntryPoint ? this.resolveMainEntryFocus() : null) || this.resolveLastMainFocus() || null;
      if (!target) {
        return false;
      }
      this.setFocusedNode(target);
      return true;
    },
    shouldTransferToSidebar(node) {
      if (!node || this.isSidebarNode(node)) {
        return false;
      }
      const main = this.container?.querySelector(".home-main");
      if (!main || !main.contains(node)) {
        return false;
      }
      const nodeRect = node.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      return nodeRect.left - mainRect.left <= 140;
    },
    closeTopOverlay() {
      const state = this.controller.getState();
      if (state.cloudFilePickerItem) {
        this.controller.closeCloudFilePicker();
        return true;
      }
      if (state.listEditorState) {
        this.controller.closeEditor();
        return true;
      }
      if (state.showDeleteConfirm) {
        this.controller.closeDeleteConfirm();
        return true;
      }
      if (state.showManageDialog) {
        this.lastActionsRowAction = "openManageLists";
        this.pendingActionRestore = "openManageLists";
        this.controller.closeManageLists();
        return true;
      }
      if (this.closePosterOptionsMenu()) {
        return true;
      }
      if (state.expandedPicker) {
        this.pendingPickerRestore = state.expandedPicker;
        this.controller.closePicker();
        return true;
      }
      return false;
    },
    consumeBackRequest() {
      return this.closeTopOverlay();
    },
    async playCloudFile(item, file) {
      const result = await this.controller.resolveCloudPlayback(item, file);
      if (!result?.url) return;
      const filename = result.filename || file.name || item.name;
      const streamId = `${item.stableKey}:${file.stableKey}`;
      const cloudSessionToken = CloudLibraryPlaybackSessionStore.create({
        item,
        currentFileKey: file.stableKey
      });
      const resume = CloudLibraryPlaybackProgressStore.getResume(item, file);
      const playableFiles = this.controller.playableFilesForCloudItem(item);
      const sequenceIndex = Math.max(
        0,
        playableFiles.findIndex((candidate) => candidate.stableKey === file.stableKey)
      );
      const stream = {
        id: streamId,
        url: result.url,
        name: filename,
        title: filename,
        description: item.name,
        addonName: item.providerName,
        behaviorHints: {
          filename,
          videoSize: result.videoSizeBytes || file.sizeBytes || null
        }
      };
      Router.navigate("player", {
        streamUrl: result.url,
        itemId: item.stableKey,
        itemType: "cloud",
        videoId: streamId,
        playerTitle: filename,
        playerSubtitle: item.name,
        episodeTitle: filename,
        season: 1,
        episode: sequenceIndex + 1,
        cloudSessionToken,
        resumePositionMs: resume?.positionMs || 0,
        resumeDurationMs: resume?.durationMs || 0,
        returnToStreamOnBack: false,
        returnToLibraryOnBack: true,
        streamCandidates: [stream],
        preferredStreamId: streamId
      });
    }
  };
}
