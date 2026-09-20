/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

import { createDebridIntegrationState } from "./settingsIntegrationDetailDebridState.js";
import { registerDebridIntegrationActions } from "./settingsIntegrationDetailDebridActions.js";
import { renderDebridIntegrationMarkup } from "./settingsIntegrationDetailDebridMarkup.js";

export function renderDebridIntegrationDetail(model) {
  const state = createDebridIntegrationState(model);
  registerDebridIntegrationActions.call(this, model, state);
  return renderDebridIntegrationMarkup.call(this, model, state);
}
