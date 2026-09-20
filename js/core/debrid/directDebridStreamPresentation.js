import { DebridSettingsStore } from "../../data/local/debridSettingsStore.js";
import { DebridProviders } from "./debridProviders.js";
import { DebridStreamTemplateEngine } from "./debridStreamTemplateEngine.js";
import { sizeBytesFromStreamText } from "./streamTextSizeParser.js";
import { resolutionFromFields } from "./streamResolution.js";
import { createDebridStreamPresentationMethods01 } from "./debridStreamPresentationMethods-01-apply.js";
import {
  isDirectDebrid,
  isManagedDebridStream,
  needsLocalDebridResolve
} from "./debridStreamPresentationHelpers-01-resolution-labels.js";

export {
  DebridSettingsStore,
  DebridProviders,
  DebridStreamTemplateEngine,
  sizeBytesFromStreamText,
  resolutionFromFields
};
export * from "./debridStreamPresentationHelpers-01-resolution-labels.js";
export * from "./debridStreamPresentationHelpers-02-has-token.js";
export * from "./debridStreamPresentationHelpers-03-effective-settings.js";
export * from "./debridStreamPresentationHelpers-04-compare-key.js";
export * from "./debridStreamPresentationHelpers-05-build-template-values.js";

export const DebridStreamPresentation = {
  ...createDebridStreamPresentationMethods01(),
  isDirectDebrid,
  isManagedDebridStream,
  needsLocalDebridResolve
};
