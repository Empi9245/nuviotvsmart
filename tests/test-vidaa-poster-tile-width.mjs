import assert from "node:assert/strict";
import {
  limitTmdbPosterTileUrl,
  limitTmdbImageWidth,
  normalizeTmdbPosterUrl
} from "../js/core/tmdb/tmdbImageUrl.js";

// Grid tiles render posters at the same scale as Home cards. On VIDAA they
// must download Android's poster rendition (w342) instead of full-size
// artwork into a ~250px tile, while every non-TMDB URL stays untouched.
const cases = [
  ["https://image.tmdb.org/t/p/original/poster.jpg", "https://image.tmdb.org/t/p/w342/poster.jpg"],
  ["https://image.tmdb.org/t/p/w780/poster.jpg", "https://image.tmdb.org/t/p/w342/poster.jpg"],
  ["https://image.tmdb.org/t/p/w500/poster.jpg", "https://image.tmdb.org/t/p/w342/poster.jpg"],
  ["https://image.tmdb.org/t/p/w342/poster.jpg", "https://image.tmdb.org/t/p/w342/poster.jpg"],
  ["//image.tmdb.org/t/p/original/poster.jpg", "//image.tmdb.org/t/p/w342/poster.jpg"]
];
for (const [source, expected] of cases) {
  assert.equal(limitTmdbPosterTileUrl(source), expected);
}

// Signed provider URLs, lookalike hosts and embedded TMDB references in
// queries must never be rewritten.
for (const source of [
  "https://addon.example/image/original/poster.jpg?signature=fixture%2Bvalue&size=1280",
  "https://image.tmdb.org.evil.example/t/p/original/poster.jpg",
  "https://proxy.example/?url=https://image.tmdb.org/t/p/original/poster.jpg",
  "data:image/png;base64,fixture",
  ""
]) {
  assert.equal(limitTmdbPosterTileUrl(source), normalizeTmdbPosterUrl(source));
}

// The tile helper is the plain width cap applied after poster normalization:
// it must stay strictly smaller or equal for oversized artwork.
const oversized = "https://image.tmdb.org/t/p/original/poster.jpg";
assert.equal(
  limitTmdbPosterTileUrl(oversized),
  limitTmdbImageWidth(normalizeTmdbPosterUrl(oversized), 342)
);

console.log(
  "PASS: grid poster tiles cap TMDB artwork to w342 and keep every non-TMDB URL unchanged."
);
