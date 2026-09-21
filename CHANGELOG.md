## 1.1.8

### Improvements & Fixes

- Reworked CSS build output into a single ordered bundle compatible with Tizen and webOS wrapper runtimes while preserving stylesheet cascade order and static-page references (@WhiteGiso)
- Fixed Tizen clock formatting to prefer the browser Intl hour cycle when the platform-reported pattern conflicts with the actual formatter (@WhiteGiso)
- Aligned player completion with Android by preserving natural-completion state through post-play dismissal, preventing an AVPlay resume after stream completion, and restoring movie-detail fallback navigation (@WhiteGiso)
- Refreshed embedded webOS subtitle styling after enabling the selected subtitle track during playback (@WhiteGiso)
- Normalized Samsung Back key aliases and removed the duplicate Tizen hardware-key path to prevent repeated navigation while preserving packaged input handling (@WhiteGiso)
- Fixed Tizen EngineFS proxy-header normalization so encoded header values and HLS segment URLs are serialized correctly (@WhiteGiso)

## 1.1.7

### Improvements & Fixes

- Broke the Smart TV router and screen import cycle so Tizen startup no longer captures an undefined navigation router and remains stuck loading on affected TVs (@WhiteGiso)

## 1.1.6

### Improvements & Fixes

- Restored the Tizen install compatibility floor at 2.3 while keeping the runtime support warning at Tizen 4.0, so older TVs can install the app and choose whether to continue (@WhiteGiso)

## 1.1.5

### Improvements & Fixes

- Added an always-visible unsupported-device warning with localized Close and Try Anyway actions; the bypass lasts for the current session only, so the warning returns on the next launch (@WhiteGiso)
- Removed the Tizen package-level minimum-version block so older TVs can reach the in-app compatibility decision while runtime capability checks remain active (@WhiteGiso)
- Completed unsupported-device warning translations across all 36 app locales (@WhiteGiso)
- Fixed the Essential playback settings crash on unsupported Tizen TVs and clearly disabled the unavailable P2P option (@WhiteGiso)
- Restored direct and managed Debrid stream classification and local-resolution helpers in the shared presentation API (@WhiteGiso)
- Expanded runtime lint coverage and removed stale self-imports from player and profile modules (@WhiteGiso)

## 1.1.4

### Improvements & Fixes

- Reconciled Tizen audio metadata with AVPlay stream and container codec order so track labels and selections remain consistent with Android TV ordering (@WhiteGiso)
- Preserved the live playback resume position when returning from the player to an existing Streams screen, preventing stale route parameters from reopening a stream at an older position (@WhiteGiso)
- Unified Tizen HLS engine selection around hls.js when MSE is available, including live playback, while retaining AVPlay and native HLS fallbacks (@WhiteGiso)
- Added a bounded, cancellable queue for bursty plugin HTTP requests while preserving the active concurrency limit, cancellation, and diagnostics (@WhiteGiso)
- Improved live stream detection and recovery across direct-file, HLS, and native playback transitions (@WhiteGiso)
- Updated TV streaming and build dependencies while preserving compatibility with the legacy webOS packaging path (@WhiteGiso)
- Reorganized Smart TV UI, player, data, synchronization, and stylesheet code into focused responsibility-based modules while preserving Android TV-aligned runtime contracts (@WhiteGiso)

## 1.1.3

### Improvements & Fixes

- Hardened stream and subtitle header isolation across hosts, redirects, and HTTPS downgrades while preserving provider request contracts (@WhiteGiso)
- Added Android-aligned movie credits, post-credits skip intervals, precise seeking, settings, and post-play integration (@WhiteGiso)
- Aligned binge-group defaults, TMDB collection ordering, Simkl TVDB preferences, RTL text detection, subtitle language aliases, and Continue Watching theming (@WhiteGiso)
- Added certified Rotten Tomatoes and audience rating states to MDBList metadata and playback/detail surfaces (@WhiteGiso)

## 1.1.2

### Improvements & Fixes

- Added Android-aligned subtitle delay persistence and remote-friendly Auto Sync controls for addon subtitles (@WhiteGiso)
- Improved Discover poster hydration by loading visible and nearby artwork explicitly inside TV scroll containers (@WhiteGiso)

## 1.1.1

### Improvements & Fixes

- Aligned Tizen VOD HLS playback with Android by preferring hls.js when MSE is available while retaining AVPlay and native HLS fallbacks (@WhiteGiso)
- Preserved Tizen playback-proxy startup for packaged EngineFS services when generic web-service capability is unavailable (@WhiteGiso)
- Prevented bright seams in Arabic HTML subtitles by compositing text opacity separately from the outline layer (@WhiteGiso)
- Improved plugin provider connectivity by trying all resolved DNS addresses within the existing request deadline and tracing per-address connection timeouts (@WhiteGiso)

## 1.1.0

### Improvements & Fixes

- Aligned series detail episode rendering with Android TV through stable season and episode updates, duplicate-card removal, long-season virtualization, and focused title marquee behavior (@WhiteGiso)
- Published focused Home heroes immediately, stabilized artwork crossfades and focused GIF cleanup, and prevented preserved Home content from bleeding into other routes (@WhiteGiso)
- Improved Continue Watching Next Up resolution by enriching the selected season and episode, applying TMDB release dates independently, and filtering unavailable episodes (@WhiteGiso)
- Kept Skip Intro visibility and D-pad focus synchronized with playback loading while containing left and right overlay navigation events (@WhiteGiso)
- Restored Android-aligned poster focus scaling across Home layouts and fixed subtitle rail sizing on legacy Chromium TV runtimes (@WhiteGiso)

## 1.0.10

### Improvements & Fixes

- Confirmed the Tizen 6.0 minimum for plugins after Tizen 5.5 service-runtime testing; retained the existing Tizen 5.x plugin and synchronization block while preserving EngineFS torrent support (@WhiteGiso)
- Kept the production PluginService transport with certificate verification and excluded experimental Tizen 5.5 bundling and network adaptations (@WhiteGiso)
- Refresh addon catalog responses after manual synchronization, including failed sync attempts, matching Android's refresh behavior (@WhiteGiso)
- Isolated catalog cache entries by addon URL and prevented in-flight responses from repopulating invalidated cache entries (@WhiteGiso)

## 1.0.9

### Improvements & Fixes

- Improved HLS request budgets, buffering and webOS playback recovery, and reduced transient stall log noise (@WhiteGiso)
- Fixed next-episode overlay focus and extended next-episode source resolution time (@WhiteGiso)
- Improved Home image hydration efficiency, hero overflow and Library Discover navigation (@WhiteGiso)
- Expanded directional remote key normalization and added a webOS service path for TMDB lookups (@WhiteGiso)
- Reconciled verified empty cloud plugin snapshots while preserving dirty local state, restricted plugin HTTP access to loopback clients and aligned provider request timeouts (@WhiteGiso)

## 1.0.8

### Improvements & Fixes

- Restored animated Home focus transitions and spring scrolling on modern webOS while retaining constrained-runtime safeguards (@WhiteGiso)
- Fixed progressive Home catalog rendering and visible poster hydration so lower rows and artwork no longer arrive late during D-pad navigation (@WhiteGiso)
- Prevented an unavailable optional webOS PluginService from blocking watched items, watch progress, and Continue Watching refreshes (@WhiteGiso)
- Decoded escaped Android newline sequences when importing localized strings (@WhiteGiso)

## 1.0.7

### Improvements & Fixes

- Disabled executable plugins and plugin pull/push synchronization on Samsung Tizen 4.x and 5.x while preserving the supported EngineFS/P2P path, and documented the platform limits (@WhiteGiso)
- Standardized the supported Tizen 6+ service pipeline with fixed service ports, canonical WGT packaging, strict health readiness, watchdog recovery, and actionable plugin diagnostics (@WhiteGiso)
- Unified the webOS media and plugin companion layout and hardened Smart TV service, playback, subtitle, navigation, and remote-request handling (@WhiteGiso)
- Improved profile-scoped plugin and watched-state synchronization with provider identity matching and local-state preservation when tracking services fail (@WhiteGiso)
- Removed obsolete Tizen compatibility bridges, legacy service definitions, and unused repository/store-submission assets (@WhiteGiso)

## 1.0.6

### Improvements & Fixes

- Aligned Smart TV playback with Android TV, including post-play recommendations, next-episode and trailer playback, TMDB/Trakt/MDBList metadata, player preferences, subtitle positioning, localized UI, and richer Tizen/webOS diagnostics (@WhiteGiso)
- Stabilized plugin execution and playback across Tizen and webOS, with safer companion-service handling, proxy fallbacks, provider actions, profile synchronization, and reliable Plugins-screen D-pad focus (@WhiteGiso)
- Improved Smart TV navigation and startup responsiveness by rendering Home, Library, Search, Discover, Catalogs, Collections, Detail, Settings, QR login, and TMDB routes before remote work completes while preserving focus and Back behavior (@WhiteGiso)
- Preserved library and watched state across profiles and remote synchronization, including safe empty addon snapshots, Trakt watched movies, cross-provider title identity matching, and consistent native search navigation (@WhiteGiso)
- Made startup update detection reliable on slow Tizen boots with route coordination and transient-request retries, and corrected the README release links for installer, Tizen WGT, and webOS downloads (@WhiteGiso)

## 1.0.5

### Improvements & Fixes

- Aligned Smart TV plugin execution and stream searching with Android TV, including exception containment, provider scheduling, shared sessions, profile synchronization, and pause/resume lifecycle (@WhiteGiso)
- Kept Tizen EngineFS and PluginService independent, on-demand, and separately packaged for direct installation and Apps2Samsung while preserving their distinct ports and identifiers (@WhiteGiso)
- Added runtime notices and translations for TVs where plugin execution is unsupported or limited, without adding messages on fully supported runtimes (@WhiteGiso)
- Hardened TV input/navigation and Tizen/WebOS service handling while retaining warnings and errors for real failures only (@WhiteGiso)

## 1.0.4

### Improvements & Fixes

- Hardened Continue Watching, library loading, and remote progress state so profile changes and delayed synchronization do not replace valid TV content with a temporary empty view (@WhiteGiso)
- Aligned plugin execution with Android behavior by preserving eligible provider work in a cancellable queue and isolating legacy plugin data and migrations per profile (@WhiteGiso)
- Improved Home hero metadata and artwork transitions, Tizen live HLS fallback, and Library/Plugins focus restoration for Samsung TV navigation (@WhiteGiso)
- Aligned plugin synchronization with Android by pulling the remote snapshot before any pending push, so opaque legacy rows cannot block classification and provider hydration (@WhiteGiso)
- Added independent Tizen EngineFS and PluginService lifecycles and ports, preserving lazy P2P startup and starting PluginService on demand during plugin synchronization or the first plugin request, with runtime diagnostics and duplicate-port handling (@WhiteGiso)
- Strengthened Tizen WGT packaging and Samsung installer validation so both service files, bridge, and manifest declarations are checked before installation (@WhiteGiso)

## 1.0.3

### Improvements & Fixes

- Finalized the Tizen plugin-service lifecycle, packaging contract, local health probing, launcher fallbacks, plugin HTTP playback proxy, and localized plugin UI handling (@WhiteGiso)
- Scoped plugin repositories, provider code, and cloud synchronization to the effective profile, including revision and dirty-state protection against cross-profile updates (@WhiteGiso)
- Preserved profile-bound local repository changes during remote reconciliation so stale snapshots cannot overwrite recent TV updates (@WhiteGiso)
- Moved provider-code caching from synchronous `localStorage` to profile-keyed asynchronous IndexedDB with bounded eviction, memory fallback, cleanup handling, authentication/profile integration, and the required Tizen storage privilege (@WhiteGiso)
- Restored the existing detail route after playback, targeting the correct history entry and avoiding duplicate detail screens while retaining stream cleanup (@WhiteGiso)
- Removed test programs and plugin fixtures from tracked application directories, keeping local test assets exclusively under the ignored root `tests/` directory (@WhiteGiso)
