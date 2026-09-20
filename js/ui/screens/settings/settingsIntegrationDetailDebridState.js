/* eslint-disable no-unused-vars */
import * as internals from "./settingsScreenContext.js";

export function createDebridIntegrationState(model) {
  const { normalizeDebridStreamPreferences, DebridProviders } = internals;
  const providers = DebridProviders.visible();
  const configuredProviders = providers.filter((provider) => DebridProviders.apiKeyFor(model.debrid, provider.id));
  const resolverProviders = DebridProviders.configuredResolverServices(model.debrid).map((credential) => credential.provider);
  const activeResolverProvider = DebridProviders.preferredResolverService(model.debrid)?.provider || null;
  const hasResolverProvider = Boolean(activeResolverProvider);
  const canResolvePlayableLinks = Boolean(model.debrid.enabled && hasResolverProvider);
  const hasCloudLibraryProvider = configuredProviders.some((provider) => provider.capabilities?.includes?.("cloudLibrary"));
  const canUseCloudLibrary = Boolean(model.debrid.cloudLibraryEnabled && hasCloudLibraryProvider);
  const streamPreferences = normalizeDebridStreamPreferences(model.debrid.streamPreferences);
  const resolverOptions = resolverProviders.map((provider) => ({
    id: provider.id,
    label: provider.displayName
  }));
  const preferredProviderId = activeResolverProvider?.id || "";

  return {
    providers,
    configuredProviders,
    resolverProviders,
    activeResolverProvider,
    hasResolverProvider,
    canResolvePlayableLinks,
    hasCloudLibraryProvider,
    canUseCloudLibrary,
    streamPreferences,
    resolverOptions,
    preferredProviderId
  };
}
