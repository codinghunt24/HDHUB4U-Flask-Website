// src/lib/tmdb-category.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// ../../lib/db/src/tmdb-category.mjs
var normalizeCategorySlug = (value) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/&/g, " and ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
var getPrimaryTmdbGenre = (metadata) => {
  const genres = metadata?.genres;
  if (!Array.isArray(genres)) return null;
  const primaryGenre = genres.find(
    (genre) => typeof genre === "string" && genre.trim().length > 0
  );
  return primaryGenre?.trim() ?? null;
};

// src/lib/tmdb-category.test.ts
test("uses the first non-empty TMDB genre as the primary category", () => {
  assert.equal(
    getPrimaryTmdbGenre({
      genres: ["", "Science Fiction", "Action"]
    }),
    "Science Fiction"
  );
});
test("returns no category when TMDB genres are missing or invalid", () => {
  assert.equal(getPrimaryTmdbGenre(null), null);
  assert.equal(getPrimaryTmdbGenre({ genres: [] }), null);
  assert.equal(getPrimaryTmdbGenre({ genres: [null, 42] }), null);
});
test("normalizes genre names into reusable category slugs", () => {
  assert.equal(normalizeCategorySlug("Science Fiction & Fantasy"), "science-fiction-and-fantasy");
  assert.equal(normalizeCategorySlug(" Acci\xF3n "), "accion");
});
