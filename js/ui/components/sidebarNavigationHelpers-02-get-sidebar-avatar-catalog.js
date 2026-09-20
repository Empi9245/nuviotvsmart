/* eslint-disable no-unused-vars */

import { Router } from "../navigation/router.js";

import { ProfileManager } from "../../core/profile/profileManager.js";

import { AvatarRepository } from "../../data/remote/supabase/avatarRepository.js";

import { MemberAccessRepository } from "../../data/remote/supabase/memberAccessRepository.js";

import { I18n } from "../../i18n/index.js";

import { getTvRuntimePerformanceProfile } from "../../platform/tvRuntimePerformance.js";

import {
  sidebarAvatarCatalogPromises,
  t,
  profileInitial,
  getThemeAccentFallback,
  DISCOVER_SIDEBAR_ITEM,
  getItemForAction,
  sidebarItems,
  getSelectedItem,
  itemLabel,
  iconMarkup,
  getModernSidebarPresentation
} from "./sidebarNavigationHelpers-01-root-sidebar-items.js";

export function getSidebarAvatarCatalog(hasMemberAccess = false) {
  const cacheKey = hasMemberAccess ? "member" : "standard";
  if (!sidebarAvatarCatalogPromises.has(cacheKey)) {
    sidebarAvatarCatalogPromises.set(
      cacheKey,
      AvatarRepository.getAvatarCatalog(hasMemberAccess).catch(() => {
        sidebarAvatarCatalogPromises.delete(cacheKey);
        return [];
      })
    );
  }
  return sidebarAvatarCatalogPromises.get(cacheKey);
}

export async function getSidebarProfileState({ cacheOnly = false } = {}) {
  const activeProfileId = String(ProfileManager.getActiveProfileId() || "");
  const memberAccess = cacheOnly ? MemberAccessRepository.getCachedAccess() : await MemberAccessRepository.getAccess().catch(() => null);
  const hasMemberAvatarAccess = MemberAccessRepository.hasEntitlement(memberAccess, "PROFILE_AVATARS");
  const [profiles, avatarCatalog] = await Promise.all([
    ProfileManager.getProfiles(),
    cacheOnly ? AvatarRepository.getCachedAvatarCatalog(hasMemberAvatarAccess) : getSidebarAvatarCatalog(hasMemberAvatarAccess)
  ]);
  const activeProfile =
    profiles.find((profile) => String(profile.id || profile.profileIndex || "1") === activeProfileId) || profiles[0] || null;
  const activeProfileAvatarUrl =
    String(activeProfile?.avatarUrl || "").trim() || AvatarRepository.getAvatarImageUrl(activeProfile?.avatarId, avatarCatalog);

  return {
    activeProfileName: String(activeProfile?.name || t("sidebar.profileFallback")).trim() || t("sidebar.profileFallback"),
    activeProfileInitial: profileInitial(activeProfile?.name || t("sidebar.profileFallback")),
    activeProfileColorHex: String(activeProfile?.avatarColorHex || getThemeAccentFallback()),
    activeProfileAvatarUrl: String(activeProfileAvatarUrl || ""),
    showProfileSelector: Boolean(activeProfile)
  };
}

export function activateLegacySidebarAction(action, currentRoute = "") {
  const normalizedAction = String(action || "");
  if (!normalizedAction) {
    return;
  }
  if (normalizedAction === "gotoAccount") {
    Router.navigate("profileSelection");
    return;
  }

  const target = normalizedAction === "gotoDiscover" ? DISCOVER_SIDEBAR_ITEM : getItemForAction(normalizedAction);
  if (!target) {
    return;
  }
  if (target.route === currentRoute) {
    // Re-selecting the tab you are already on. Let the screen react, e.g. Home
    // scrolls back to the top, matching the Android TV app.
    Router.getCurrentScreen()?.onSidebarReselect?.();
    return;
  }
  Router.navigate(target.route);
}

export function isSelectedSidebarAction(action, selectedRoute = "") {
  return getItemForAction(action)?.route === String(selectedRoute || "");
}

export function renderLegacySidebar({ selectedRoute = "home", profile = null, layout = {}, expanded = false } = {}) {
  const items = sidebarItems(layout);
  const selectedItem = getSelectedItem(selectedRoute);
  const profileState = profile || {};
  const showProfileSelector = Boolean(profileState.showProfileSelector && profileState.activeProfileName);
  const collapsible = Boolean(layout?.collapseSidebar);
  const performanceConstrained = getTvRuntimePerformanceProfile().isPerformanceConstrained;

  return `
    <aside class="home-sidebar root-sidebar root-sidebar-legacy${expanded ? " expanded content-expanded" : ""}${performanceConstrained ? " performance-constrained" : ""}"
           data-selected-route="${selectedRoute}"
           data-collapsible="${collapsible ? "true" : "false"}">
      ${
        showProfileSelector
          ? `
        <button class="home-profile-pill focusable"
                data-nav-zone="sidebar"
                data-nav-index="0"
                data-action="gotoAccount"
                aria-label="${t("sidebar.switchProfile")}">
          <span class="home-profile-avatar" style="background:${profileState.activeProfileColorHex || getThemeAccentFallback()}">
            ${
              profileState.activeProfileAvatarUrl
                ? `<img class="sidebar-profile-avatar-image" src="${profileState.activeProfileAvatarUrl}" alt="${profileState.activeProfileName || t("sidebar.profileFallback")}" />`
                : profileState.activeProfileInitial || "P"
            }
          </span>
          <span class="home-profile-name">${profileState.activeProfileName || t("sidebar.profileFallback")}</span>
        </button>
      `
          : ""
      }
      <div class="home-nav-list">
        ${items
          .map(
            (item, index) => `
          <button class="home-nav-item focusable${selectedItem.action === item.action ? " selected" : ""}"
                  data-nav-zone="sidebar"
                  data-nav-index="${showProfileSelector ? index + 1 : index}"
                  data-action="${item.action}"
                  aria-label="${itemLabel(item)}">
            <span class="home-nav-icon-wrap">${iconMarkup(item, "home-nav-icon")}</span>
            <span class="home-nav-label">${itemLabel(item)}</span>
          </button>
        `
          )
          .join("")}
      </div>
    </aside>
  `;
}

export function renderModernSidebar({
  selectedRoute = "home",
  profile = null,
  expanded = false,
  pillIconOnly = false,
  blurEnabled = false,
  layout = {}
} = {}) {
  const items = sidebarItems(layout);
  const selectedItem = getSelectedItem(selectedRoute);
  const profileState = profile || {};
  const showProfileSelector = Boolean(profileState.showProfileSelector && profileState.activeProfileName);
  const { keepPillExpanded } = getModernSidebarPresentation(selectedRoute);
  const showPill = selectedItem.route !== "search";
  const selectedLabel = itemLabel(selectedItem);
  const performanceConstrained = getTvRuntimePerformanceProfile().isPerformanceConstrained;

  return `
    <div class="modern-sidebar-shell${expanded ? " expanded panel-visible" : ""}${blurEnabled ? " blur-enabled" : ""}${keepPillExpanded ? " keep-pill-expanded" : ""}${performanceConstrained ? " performance-constrained" : ""}" data-selected-route="${selectedRoute}">
      ${
        showPill
          ? `
        <button class="modern-sidebar-pill${pillIconOnly && !keepPillExpanded ? " icon-only" : ""}"
                data-nav-zone="sidebar"
                data-nav-index="0"
                data-action="expandSidebar"
                aria-label="${t("sidebar.expandSidebar")}" aria-expanded="${expanded ? "true" : "false"}">
          <img class="modern-sidebar-pill-chevron" src="assets/icons/ic_chevron_compact_left.png" alt="" aria-hidden="true" />
          <span class="modern-sidebar-pill-chip">
            <span class="modern-sidebar-pill-icon-wrap">${iconMarkup(selectedItem, "modern-sidebar-pill-icon")}</span>
            <span class="modern-sidebar-pill-label">${selectedLabel}</span>
          </span>
        </button>
      `
          : ""
      }
      <aside class="modern-sidebar-panel" aria-hidden="${expanded ? "false" : "true"}">
        ${
          showProfileSelector
            ? `
          <button class="modern-sidebar-profile focusable"
                  data-nav-zone="sidebar"
                  data-nav-index="${showPill ? 1 : 0}"
                  data-action="gotoAccount" aria-label="${t("sidebar.switchProfile")}">
            <span class="modern-sidebar-profile-avatar" style="background:${profileState.activeProfileColorHex || getThemeAccentFallback()}">
              ${
                profileState.activeProfileAvatarUrl
                  ? `<img class="sidebar-profile-avatar-image" src="${profileState.activeProfileAvatarUrl}" alt="${profileState.activeProfileName || t("sidebar.profileFallback")}" />`
                  : profileState.activeProfileInitial || "P"
              }
            </span>
            <span class="modern-sidebar-profile-name">${profileState.activeProfileName || t("sidebar.profileFallback")}</span>
          </button>
        `
            : ""
        }
        <div class="modern-sidebar-nav-list">
          ${items
            .map(
              (item, index) => `
            <button class="modern-sidebar-nav-item focusable${selectedItem.action === item.action ? " selected" : ""}"
                    data-nav-zone="sidebar"
                    data-nav-index="${(showPill ? 1 : 0) + (showProfileSelector ? 1 : 0) + index}"
                    data-action="${item.action}"
                    aria-label="${itemLabel(item)}">
              <span class="modern-sidebar-nav-icon-circle">
                ${iconMarkup(item, "modern-sidebar-nav-icon")}
              </span>
              <span class="modern-sidebar-nav-label">${itemLabel(item)}</span>
            </button>
          `
            )
            .join("")}
        </div>
      </aside>
    </div>
  `;
}

export function isModernSidebarBlurAvailable() {
  return Boolean(globalThis.document?.documentElement?.classList?.contains("modern-sidebar-blur-capable"));
}
