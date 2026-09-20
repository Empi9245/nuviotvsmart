/* eslint-disable no-unused-vars */
import * as internals from "./profileSettingsSyncService.js";

export function createProfileSettingsSyncServiceMethods01() {
  const { resolveProfileId, withProfileSettingsSyncLock, pullProfileSettingsUnlocked, pushProfileSettingsUnlocked } = internals;

  return {
    async pull(profileId = null) {
      const resolvedProfileId = resolveProfileId(profileId);
      return withProfileSettingsSyncLock(resolvedProfileId, () => pullProfileSettingsUnlocked(resolvedProfileId));
    },
    async push(profileId = null) {
      const resolvedProfileId = resolveProfileId(profileId);
      return withProfileSettingsSyncLock(resolvedProfileId, () => pushProfileSettingsUnlocked(resolvedProfileId));
    }
  };
}
