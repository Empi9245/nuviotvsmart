import { renderDebridIntegrationDetail } from "./settingsIntegrationDetailDebrid.js";
import { renderTmdbIntegrationDetail } from "./settingsIntegrationDetailTmdb.js";
import { renderMdblistIntegrationDetail } from "./settingsIntegrationDetailMdblist.js";
import { renderAnimeskipIntegrationDetail } from "./settingsIntegrationDetailAnimeskip.js";

export function createSettingsScreenMethods08() {
  return {
    renderIntegrationDetail(model, key) {
      this.actionMap.set("integration:back", () => {
        this.integrationView = "hub";
        const focusByIntegration = {
          debrid: "integration:hub:debrid",
          tmdb: "integration:hub:tmdb",
          mdblist: "integration:hub:mdblist",
          animeskip: "integration:hub:animeskip"
        };
        this.contentFocusKey = focusByIntegration[key] || "integration:hub:tmdb";
      });
      if (key === "debrid") return renderDebridIntegrationDetail.call(this, model);
      if (key === "tmdb") return renderTmdbIntegrationDetail.call(this, model);
      if (key === "mdblist") return renderMdblistIntegrationDetail.call(this, model);
      return renderAnimeskipIntegrationDetail.call(this, model);
    }
  };
}
