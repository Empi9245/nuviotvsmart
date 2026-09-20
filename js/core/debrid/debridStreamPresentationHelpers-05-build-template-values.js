import { DebridSettingsStore } from "../../data/local/debridSettingsStore.js";

import { DebridProviders } from "./debridProviders.js";

import { DebridStreamTemplateEngine } from "./debridStreamTemplateEngine.js";

import { sizeBytesFromStreamText } from "./streamTextSizeParser.js";

import { resolutionFromFields } from "./streamResolution.js";

import {
  toArray,
  buildSeasonEpisodeList,
  formatEpisodes,
  formatSeasons,
  labelUnlessUnknown,
  labelsExcludingUnknown,
  languageEmoji,
  streamType,
  serviceCached
} from "./debridStreamPresentationHelpers-04-compare-key.js";
import {
  RESOLUTION_LABELS,
  QUALITY_LABELS,
  VISUAL_TAG_LABELS,
  AUDIO_TAG_LABELS,
  AUDIO_CHANNEL_LABELS,
  LANGUAGE_LABELS,
  ENCODE_LABELS
} from "./debridStreamPresentationHelpers-01-resolution-labels.js";

export function buildTemplateValues(stream = {}, fact = {}) {
  const resolve = stream.clientResolve || stream.raw?.clientResolve || {};
  const raw = resolve.stream?.raw || {};
  const parsed = raw.parsed || {};
  const seasons = toArray(parsed.seasons);
  const episodes = toArray(parsed.episodes);
  const visualTags = [...toArray(parsed.hdr), parsed.bitDepth].filter(Boolean);
  const audioTags = toArray(parsed.audio);
  const audioChannels = toArray(parsed.channels);
  const languages = toArray(parsed.languages);
  const providerId = stream.debridCacheStatus?.providerId || resolve.service;
  const provider = DebridProviders.byId(providerId);
  const serviceShortName = String(resolve.serviceExtension || "").trim() || provider?.shortName || "";
  return {
    "stream.title": parsed.parsedTitle || resolve.title || stream.title || null,
    "stream.year": parsed.year ?? null,
    "stream.season": resolve.season ?? null,
    "stream.episode": resolve.episode ?? null,
    "stream.seasons": seasons,
    "stream.episodes": episodes,
    "stream.seasonEpisode": buildSeasonEpisodeList(resolve.season ?? null, resolve.episode ?? null, seasons, episodes),
    "stream.formattedEpisodes": formatEpisodes(episodes),
    "stream.formattedSeasons": formatSeasons(seasons),
    "stream.resolution": parsed.resolution || labelUnlessUnknown(fact.resolution, RESOLUTION_LABELS),
    "stream.library": false,
    "stream.quality": parsed.quality || labelUnlessUnknown(fact.quality, QUALITY_LABELS),
    "stream.visualTags": visualTags.length ? visualTags : labelsExcludingUnknown(fact.visualTags, VISUAL_TAG_LABELS),
    "stream.audioTags": audioTags.length ? audioTags : labelsExcludingUnknown(fact.audioTags, AUDIO_TAG_LABELS),
    "stream.audioChannels": audioChannels.length ? audioChannels : labelsExcludingUnknown(fact.audioChannels, AUDIO_CHANNEL_LABELS),
    "stream.languages": languages.length
      ? languages
      : (fact.languages || []).map((language) => LANGUAGE_LABELS[language]?.[0]).filter(Boolean),
    "stream.languageEmojis": (languages.length
      ? languages
      : (fact.languages || []).map((language) => LANGUAGE_LABELS[language]?.[0]).filter(Boolean)
    ).map(languageEmoji),
    "stream.size":
      raw.size ?? stream.behaviorHints?.videoSize ?? stream.debridCacheStatus?.cachedSize ?? sizeBytesFromStreamText(stream) ?? null,
    "stream.folderSize": raw.folderSize ?? null,
    "stream.encode": parsed.codec ? String(parsed.codec).toUpperCase() : labelUnlessUnknown(fact.codec, ENCODE_LABELS),
    "stream.indexer": raw.indexer || raw.tracker || null,
    "stream.network": parsed.network || raw.network || null,
    "stream.releaseGroup": parsed.group || fact.releaseGroup || null,
    "stream.duration": parsed.duration ?? null,
    "stream.edition": parsed.edition || fact.edition || null,
    "stream.filename": raw.filename || resolve.filename || stream.behaviorHints?.filename || stream.debridCacheStatus?.cachedName || null,
    "stream.regexMatched": null,
    "stream.type": streamType(stream, resolve),
    "service.cached": serviceCached(stream, resolve),
    "service.shortName": serviceShortName,
    "service.name": provider?.displayName || DebridProviders.displayName(providerId),
    "addon.name": stream.addonName || stream.raw?.addonName || null
  };
}

export function formatTemplateName(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatTemplateDescription(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function resolveManagedStreamDescription(templateDescription = "", stream = {}, displayedName = "") {
  const displayed = String(displayedName || "")
    .trim()
    .toLowerCase();
  return (
    [templateDescription, stream.description, stream.title]
      .map((value) => formatTemplateDescription(value))
      .find((value) => value && value.toLowerCase() !== displayed) || null
  );
}

export function formatManagedStream(stream = {}, fact, settings = DebridSettingsStore.get()) {
  const resolve = stream.clientResolve || stream.raw?.clientResolve || {};
  const providerId = stream.debridCacheStatus?.providerId || resolve.service;
  const provider = DebridProviders.byId(providerId);
  const values = buildTemplateValues(stream, fact);
  const name = formatTemplateName(DebridStreamTemplateEngine.render(settings.streamNameTemplate, values));
  const description = formatTemplateDescription(DebridStreamTemplateEngine.render(settings.streamDescriptionTemplate, values));
  return {
    ...stream,
    name: name || stream.name || `${DebridProviders.displayName(providerId)} Instant`,
    description: resolveManagedStreamDescription(
      description,
      stream,
      name || stream.name || `${DebridProviders.displayName(providerId)} Instant`
    ),
    addonName: stream.addonName || null,
    addonLogo: stream.addonLogo ?? null,
    debridProviderName: provider?.displayName || DebridProviders.displayName(providerId),
    streamPresentation: {
      resolution: values["stream.resolution"] || null,
      quality: values["stream.quality"] || null,
      visualTags: values["stream.visualTags"] || [],
      encode: values["stream.encode"] || null,
      audioTags: values["stream.audioTags"] || [],
      audioChannels: values["stream.audioChannels"] || [],
      languages: values["stream.languages"] || [],
      languageEmojis: values["stream.languageEmojis"] || [],
      size: values["stream.size"] || null,
      indexer: values["stream.indexer"] || null,
      releaseGroup: values["stream.releaseGroup"] || null,
      type: values["stream.type"] || null,
      cached: values["service.cached"],
      serviceShortName: values["service.shortName"] || null,
      serviceName: values["service.name"] || null
    }
  };
}
