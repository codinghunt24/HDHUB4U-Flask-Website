import assert from "node:assert/strict";
import test from "node:test";
import {
  getImportedTitleUpdate,
  normalizeScrapedTitle,
  parseScrapedTitle,
} from "./seo-title";

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

test("extracts only the movie name and year from release noise", () => {
  assert.deepEqual(
    parseScrapedTitle(
      "TOXIC (2026) V2 HQ-HDTC [Hindi-Kannada-Tamil-Telugu] 1080p 720p 480p | Full Movie Download | HDHUB4U",
      "https://new5.hdhub4u.cl/toxic-2026-hindi-line-v2-hdtc-full-movie/",
    ),
    {
      sourceTitle:
        "TOXIC (2026) V2 HQ-HDTC [Hindi-Kannada-Tamil-Telugu] 1080p 720p 480p | Full Movie Download | HDHUB4U",
      normalizedTitle:
        "Toxic (2026) V2 HQ-HDTC Hindi-Kannada-Tamil-Telugu 1080p 720p 480p Get",
      candidateTitle: "Toxic",
      year: 2026,
      mediaType: "movie",
      season: null,
      episode: null,
    },
  );
});

test("extracts a series name and season episode markers", () => {
  const parsed = parseScrapedTitle(
    "REACHER S04E03 Hindi Dual Audio 1080p WEB-DL HEVC",
  );

  assert.equal(parsed.candidateTitle, "Reacher");
  assert.equal(parsed.mediaType, "tv");
  assert.equal(parsed.season, 4);
  assert.equal(parsed.episode, 3);
});

test("recognizes episode-only and complete-series releases as TV", () => {
  const episodeOnly = parseScrapedTitle(
    "Reacher Episode 3 Hindi 1080p WEB-DL",
  );
  assert.equal(episodeOnly.candidateTitle, "Reacher");
  assert.equal(episodeOnly.mediaType, "tv");
  assert.equal(episodeOnly.episode, 3);

  const completeSeries = parseScrapedTitle(
    "Panchayat Complete Web Series Hindi 1080p",
  );
  assert.equal(completeSeries.candidateTitle, "Panchayat");
  assert.equal(completeSeries.mediaType, "tv");
});

test("keeps media type unknown when the release title has no reliable marker", () => {
  const parsed = parseScrapedTitle("Dune 2021 Hindi 1080p");
  assert.equal(parsed.mediaType, "unknown");
  assert.equal(parsed.candidateTitle, "Dune");
});

test("does not strip language words when they are part of a movie name", () => {
  assert.equal(
    parseScrapedTitle("Hindi Medium (2017) Hindi 1080p WEB-DL").candidateTitle,
    "Hindi Medium",
  );
  assert.equal(
    parseScrapedTitle("English Vinglish (2012) Hindi 720p").candidateTitle,
    "English Vinglish",
  );
  assert.equal(
    parseScrapedTitle("The English Patient (1996) English 1080p").candidateTitle,
    "The English Patient",
  );
  assert.equal(
    parseScrapedTitle("The Hindi Teacher Hindi 1080p").candidateTitle,
    "The Hindi Teacher",
  );
});

test("strips a language suffix only when release metadata confirms it", () => {
  assert.equal(
    parseScrapedTitle("Arrival Hindi Dual Audio 1080p").candidateTitle,
    "Arrival",
  );
  assert.equal(
    parseScrapedTitle("Kantara Hindi-Kannada-Tamil 1080p WEB-DL")
      .candidateTitle,
    "Kantara",
  );
});