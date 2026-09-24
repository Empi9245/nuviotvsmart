import { addonRepository } from "../../data/repository/addonRepository.js";
import { ExperienceModeStore } from "../../data/local/experienceModeStore.js";
import { LayoutPreferences } from "../../data/local/layoutPreferences.js";

export function resolveExperienceRoute(profileId) {
  const experience = ExperienceModeStore.getForProfile(profileId);
  const layout = LayoutPreferences.getForProfile(profileId);
  const effectiveMode = experience.mode || (layout.hasChosenLayout ? "ADVANCED" : null);

  if (!effectiveMode) {
    return "experienceModeSelection";
  }
  if (effectiveMode === "ESSENTIAL" && !experience.addonSetupSkipped) {
    const cachedAddons = addonRepository.getCachedInstalledAddons();
    const hasConfiguredAddon = addonRepository
      .getInstalledAddonUrls()
      .some((url) => addonRepository.isAddonEnabled(url));
    if (!cachedAddons.length && !hasConfiguredAddon) {
      return "essentialAddonSetup";
    }
  }
  return "home";
}
