/* eslint-disable no-unused-vars */

import { Router } from "../navigation/routerState.js";

import { ProfileManager } from "../../core/profile/profileManager.js";

import { AvatarRepository } from "../../data/remote/supabase/avatarRepository.js";

import { MemberAccessRepository } from "../../data/remote/supabase/memberAccessRepository.js";

import { I18n } from "../../i18n/index.js";

import { getTvRuntimePerformanceProfile } from "../../platform/tvRuntimePerformance.js";

import { syncSidebarStateClasses, scheduleRootSidebarTextFit } from "./sidebarNavigationHelpers-01-root-sidebar-items.js";

export function setModernSidebarExpanded(container, expanded) {
  const shell = container?.querySelector(".modern-sidebar-shell");
  if (!shell) {
    return false;
  }
  if (getTvRuntimePerformanceProfile().platform === "vidaa") {
    const shouldExpand = Boolean(expanded);
    const requestedExpanded = shell._vidaaSidebarExpanded ?? shell.classList.contains("expanded");
    if (requestedExpanded === shouldExpand) {
      return true;
    }
    shell._vidaaSidebarExpanded = shouldExpand;
    const panel = shell.querySelector(".modern-sidebar-panel");
    const pill = shell.querySelector(".modern-sidebar-pill");
    if (shell._modernOpenTimer) {
      clearTimeout(shell._modernOpenTimer);
      shell._modernOpenTimer = null;
    }
    if (shell._modernCloseEndTimer) {
      clearTimeout(shell._modernCloseEndTimer);
      shell._modernCloseEndTimer = null;
    }
    shell.classList.toggle("expanded", shouldExpand);
    shell.classList.toggle("opening", shouldExpand);
    shell.classList.toggle("collapsing", !shouldExpand);
    if (shouldExpand) {
      shell.classList.add("panel-visible");
      panel?.setAttribute("aria-hidden", "false");
    }
    pill?.setAttribute("aria-expanded", String(shouldExpand));
    syncSidebarStateClasses(container);
    if (shouldExpand) {
      scheduleRootSidebarTextFit(container);
      shell._modernOpenTimer = setTimeout(() => {
        shell.classList.remove("opening");
        shell._modernOpenTimer = null;
      }, 120);
    } else {
      shell._modernCloseEndTimer = setTimeout(() => {
        shell.classList.remove("panel-visible", "collapsing");
        panel?.setAttribute("aria-hidden", "true");
        shell._modernCloseEndTimer = null;
      }, 120);
    }
    return true;
  }
  const panel = shell.querySelector(".modern-sidebar-panel");
  const pill = shell.querySelector(".modern-sidebar-pill");
  if (shell._modernOpenTimer) {
    clearTimeout(shell._modernOpenTimer);
    shell._modernOpenTimer = null;
  }
  if (shell._modernCloseStartTimer) {
    clearTimeout(shell._modernCloseStartTimer);
    shell._modernCloseStartTimer = null;
  }
  if (shell._modernCloseEndTimer) {
    clearTimeout(shell._modernCloseEndTimer);
    shell._modernCloseEndTimer = null;
  }

  if (expanded) {
    shell.classList.add("panel-visible", "opening");
    shell.classList.remove("collapsing");
    syncSidebarStateClasses(container);
    if (panel) {
      panel.setAttribute("aria-hidden", "false");
    }
    if (pill) {
      pill.setAttribute("aria-expanded", "true");
    }
    requestAnimationFrame(() => {
      shell.classList.add("expanded");
      syncSidebarStateClasses(container);
    });
    shell._modernOpenTimer = setTimeout(() => {
      shell.classList.remove("opening");
      shell._modernOpenTimer = null;
      scheduleRootSidebarTextFit(container);
      syncSidebarStateClasses(container);
    }, 365);
    scheduleRootSidebarTextFit(container);
    return true;
  }

  shell.classList.add("collapsing");
  shell.classList.remove("opening");
  syncSidebarStateClasses(container);
  if (pill) {
    pill.setAttribute("aria-expanded", "false");
  }
  shell._modernCloseStartTimer = setTimeout(() => {
    shell.classList.remove("expanded");
    shell._modernCloseStartTimer = null;
    syncSidebarStateClasses(container);
  }, 70);
  shell._modernCloseEndTimer = setTimeout(() => {
    shell.classList.remove("panel-visible", "collapsing");
    if (panel) {
      panel.setAttribute("aria-hidden", "true");
    }
    shell._modernCloseEndTimer = null;
    scheduleRootSidebarTextFit(container);
    syncSidebarStateClasses(container);
  }, 430);
  scheduleRootSidebarTextFit(container);
  return true;
}

export function focusWithoutAutoScroll(node) {
  if (!node || typeof node.focus !== "function") {
    return;
  }
  try {
    node.focus({ preventScroll: true });
  } catch (_) {
    node.focus();
  }
}
