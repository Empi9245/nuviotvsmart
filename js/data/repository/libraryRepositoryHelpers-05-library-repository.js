/* eslint-disable no-unused-vars */

import { AuthManager } from "../../core/auth/authManager.js";

import { toTraktImageUrl } from "../../core/trakt/traktImageUrl.js";

import { SavedLibrarySyncService } from "../../core/profile/savedLibrarySyncService.js";

import { ProfileManager } from "../../core/profile/profileManager.js";

import { LocalStore } from "../../core/storage/localStore.js";

import { savedLibraryRepository } from "./savedLibraryRepository.js";

import { metaRepository } from "./metaRepository.js";

import { requestJson, TraktAuthService } from "./traktAuthService.js";

import { TraktLibrarySourceMode, TraktSettingsStore } from "../local/traktSettingsStore.js";

import { SimklAuthService } from "./simklAuthService.js";

import { SimklSyncService } from "./simklSyncService.js";

import { LibraryRepository } from "./libraryRepositoryHelpers-04-library-repository.js";
import { makeTypeLabel } from "./libraryRepositoryHelpers-01-library-source-mode.js";

export const libraryRepository = new LibraryRepository();

export const libraryTypeLabel = makeTypeLabel;
