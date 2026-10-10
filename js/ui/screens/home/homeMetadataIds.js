import { parseTmdbIdInput } from "../../../core/tmdb/tmdbService.js";

export function resolveHomeTmdbLookupId(...items) {
  const sources = items.filter((item) => item && typeof item === "object");
  for (const item of sources) {
    for (const value of [
      item.tmdbId,
      item.tmdb_id,
      item.ids?.tmdb,
      item.externalIds?.tmdb,
      item.external_ids?.tmdb,
      item.external_ids?.tmdb_id
    ]) {
      const parsed = parseTmdbIdInput(value);
      if (parsed.kind === "numeric" && Number(parsed.idPart) > 0) return `tmdb:${parsed.idPart}`;
    }
  }
  for (const item of sources) {
    for (const value of [
      item.imdbId,
      item.imdb_id,
      item.ids?.imdb,
      item.externalIds?.imdb,
      item.external_ids?.imdb_id
    ]) {
      const parsed = parseTmdbIdInput(String(value || "").toLowerCase());
      if (parsed.kind === "imdb" && /^tt\d+$/.test(parsed.idPart)) return parsed.idPart;
    }
  }
  for (const item of sources) {
    for (const value of [item.contentId, item.id]) {
      const parsed = parseTmdbIdInput(value);
      if (parsed.kind === "numeric" && Number(parsed.idPart) > 0) return `tmdb:${parsed.idPart}`;
      if (parsed.kind === "imdb" && /^tt\d+$/.test(parsed.idPart)) return parsed.idPart;
    }
  }
  return "";
}
