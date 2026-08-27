import assert from "node:assert/strict";
import test from "node:test";
import {
  getPrimaryTmdbGenre,
  normalizeCategorySlug,
} from "@workspace/db/tmdb-category";

test("uses the first non-empty TMDB genre as the primary category", () => {
  assert.equal(
    getPrimaryTmdbGenre({
      genres: ["", "Science Fiction", "Action"],
    }),
    "Science Fiction",
  );
});

test("returns no category when TMDB genres are missing or invalid", () => {
  assert.equal(getPrimaryTmdbGenre(null), null);
  assert.equal(getPrimaryTmdbGenre({ genres: [] }), null);
  assert.equal(getPrimaryTmdbGenre({ genres: [null, 42] }), null);
});

test("normalizes genre names into reusable category slugs", () => {
  assert.equal(normalizeCategorySlug("Science Fiction & Fantasy"), "science-fiction-and-fantasy");
  assert.equal(normalizeCategorySlug(" Acción "), "accion");
});