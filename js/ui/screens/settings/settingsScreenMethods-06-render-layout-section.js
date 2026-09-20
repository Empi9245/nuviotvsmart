/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

import { registerLayoutActions } from "./settingsLayoutActions.js";
import { renderLayoutMarkup } from "./settingsLayoutMarkup.js";

export function createSettingsScreenMethods06() {
  return {
    renderLayoutSection(model) {
      registerLayoutActions.call(this, model);
      return renderLayoutMarkup.call(this, model);
    }
  };
}
