import {
  normalizeTmdbLanguageCode,
  TmdbSettingsStore
} from "../../data/local/tmdbSettingsStore.js";
import { TMDB_API_KEY } from "../../config.js";
import { tmdbShowReleaseInfo, tmdbYearPart } from "../util/tmdbReleaseRange.js";
import { sortCollectionPartsByReleaseDate } from "./tmdbCollectionOrdering.js";
import { createTmdbMetadataServiceMethods01 } from "./tmdbMetadataServiceMethods-01-fetch-enrichment.js";
import { createTmdbMetadataServiceMethods02 } from "./tmdbMetadataServiceMethods-02-fetch-episode-enrichment.js";

export {
  normalizeTmdbLanguageCode,
  TmdbSettingsStore,
  TMDB_API_KEY,
  tmdbShowReleaseInfo,
  tmdbYearPart,
  sortCollectionPartsByReleaseDate
};
export * from "./tmdbMetadataServiceHelpers-01-tmdb-base-url.js";
export * from "./tmdbMetadataServiceHelpers-02-resolve-credit-entries.js";
export * from "./tmdbMetadataServiceHelpers-03-fetch-tmdb-images.js";

export const TmdbMetadataService = {
  ...createTmdbMetadataServiceMethods01(),
  ...createTmdbMetadataServiceMethods02()
};
