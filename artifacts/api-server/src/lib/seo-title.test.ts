import assert from "node:assert/strict";
import test from "node:test";
import { getImportedTitleUpdate, normalizeScrapedTitle } from "./seo-title";

test("keeps verified release details while removing promotional noise", () => {
  assert.equal(
    normalizeScrapedTitle(
      "TOXIC (2026) V2 HQ-HDTC [Hindi-Kannada-Tamil-Telugu] 1080p 720p 480p | Full Movie Download | HDHUB4U",
      "https://new5.hdhub4u.cl/toxic-2026-hindi-line-v2-hdtc-full-movie/",
    ),
    "Toxic (2026) V2 HQ-HDTC Hindi-Kannada-Tamil-Telugu 1080p 720p 480p Get",
  );
});

test("preserves series, season, episode, language, and quality facts", () => {
  assert.equal(
    normalizeScrapedTitle(
      "REACHER S04E03 Hindi Dual Audio 1080p WEB-DL HEVC",
      "https://public.example/reacher-s04e03-hindi-dual-audio/",
    ),
    "Reacher S04E03 Hindi Dual Audio 1080p WEB-DL HEVC",
  );
});

test("decodes entities and removes duplicate adjacent words", () => {
  assert.equal(
    normalizeScrapedTitle(
      "Movie Movie &amp; Stories | Watch Online",
      "https://public.example/movie-stories/",
    ),
    "Movie & Stories See Online",
  );
});

test("uses a readable URL fallback without inventing metadata", () => {
  assert.equal(
    normalizeScrapedTitle(
      "HDHUB4U | Download",
      "https://new5.hdhub4u.cl/a-quiet-place-day-one/",
    ),
    "a quiet place day one",
  );
});

test("bounds unusually long titles at a word boundary", () => {
  const title = normalizeScrapedTitle(
    `Example Film 2026 Hindi ${"Extended Release Detail ".repeat(10)}`,
    "https://public.example/example-film/",
  );

  assert.ok(title.length <= 120);
  assert.equal(title.endsWith(" "), false);
});

test("protects existing editorial titles and refreshes only auto titles", () => {
  assert.deepEqual(
    getImportedTitleUpdate("manual", "Normalized Source Title"),
    {},
  );
  assert.deepEqual(
    getImportedTitleUpdate("auto", "Normalized Source Title"),
    { title: "Normalized Source Title" },
  );
});