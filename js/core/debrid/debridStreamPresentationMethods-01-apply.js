/* eslint-disable no-unused-vars */
import * as internals from "./directDebridStreamPresentation.js";

export function createDebridStreamPresentationMethods01() {
  const {
    DebridSettingsStore,
    DebridProviders,
    isManagedDebridStream,
    isUncachedDebridStream,
    isInactiveResolverStream,
    facts,
    effectiveSettings,
    matchesFilters,
    compareStreams,
    applyLimits,
    formatManagedStream
  } = internals;

  return {
    apply(groups = [], settings = DebridSettingsStore.get()) {
      if (!settings.enabled || !DebridProviders.preferredResolverService(settings)) {
        return groups;
      }
      const effective = effectiveSettings(settings);
      return (groups || []).map((group) => {
        const visibleStreams = (group.streams || [])
          .filter((stream) => !isInactiveResolverStream(stream, settings))
          .filter((stream) => !isUncachedDebridStream(stream));
        const managed = visibleStreams.filter(isManagedDebridStream);
        const passthrough = visibleStreams.filter((stream) => !isManagedDebridStream(stream));
        const presented = managed
          .map((stream) => ({ stream, fact: facts(stream) }))
          .filter((entry) => matchesFilters(entry.fact, effective));
        const ordered = effective.sortCriteria.length ? presented.sort((left, right) => compareStreams(left, right, effective)) : presented;
        const limited = applyLimits(ordered, effective).map((entry) => formatManagedStream(entry.stream, entry.fact, settings));
        return {
          ...group,
          streams: [...limited, ...passthrough]
        };
      });
    }
  };
}
