import assert from "node:assert/strict";
import test from "node:test";
import { parseScrapedTitle } from "./seo-title";
import {
  createTmdbTitleResolver,
  resolveTmdbCandidates,
  scoreTmdbCandidate,
  type TmdbTitleCandidate,
} from "./tmdb-title-resolver";

const movie = (
  title: string,
  year: number,
  originalTitle: string | null = null,
): TmdbTitleCandidate => ({
  id: year,
  mediaType: "movie",
  title,
  originalTitle,
  year,
});

test("accepts a clear exact movie title and year match", () => {
  const parsed = parseScrapedTitle(
    "TOXIC (2026) V2 HQ-HDTC Hindi 1080p",
  );
  const result = resolveTmdbCandidates(parsed, [
    movie("Toxic", 2026),
    movie("Toxic Avenger", 2023),
  ]);

  assert.equal(result.status, "matched");
  assert.equal(result.displayTitle, "Toxic");
  assert.equal(result.detectedTitle, "Toxic");
  assert.ok(result.confidence >= 0.9);
});

test("keeps the safe title when equally strong candidates are ambiguous", () => {
  const parsed = parseScrapedTitle("The Gift 2015 Hindi 1080p");
  const result = resolveTmdbCandidates(parsed, [
    movie("The Gift", 2015),
    movie("The Gift", 2015),
  ]);

  assert.equal(result.status, "review");
  assert.equal(result.displayTitle, parsed.normalizedTitle);
  assert.equal(result.detectedTitle, "The Gift");
});

test("rejects an exact title with the wrong year", () => {
  const parsed = parseScrapedTitle("Dune 2021 Hindi 1080p");
  const wrongYearScore = scoreTmdbCandidate(parsed, movie("Dune", 1984));

  assert.ok(wrongYearScore < 0.65);
  assert.equal(
    resolveTmdbCandidates(parsed, [movie("Dune", 1984)]).status,
    "unmatched",
  );
});

test("matches punctuation and diacritic variants", () => {
  const parsed = parseScrapedTitle("Amelie 2001 French 1080p");
  const result = resolveTmdbCandidates(parsed, [
    movie("Amélie", 2001, "Le Fabuleux Destin d'Amélie Poulain"),
  ]);

  assert.equal(result.status, "matched");
  assert.equal(result.displayTitle, "Amélie");
});

test("marks unrelated TMDB results as unmatched", () => {
  const parsed = parseScrapedTitle("A Quiet Place Day One 2024 1080p");
  const result = resolveTmdbCandidates(parsed, [
    movie("Inside Out 2", 2024),
  ]);

  assert.equal(result.status, "unmatched");
  assert.equal(result.displayTitle, parsed.normalizedTitle);
});

test("does not call TMDB when a key is missing", async () => {
  let searches = 0;
  const resolver = createTmdbTitleResolver(null, 25, async () => {
    searches += 1;
    return [];
  });
  const result = await resolver(parseScrapedTitle("Dune 2021 Hindi 1080p"));

  assert.equal(result.status, "unavailable");
  assert.equal(searches, 0);
});

test("caches repeated searches and respects the lookup cap", async () => {
  let searches = 0;
  const resolver = createTmdbTitleResolver("test-key", 1, async (parsed) => {
    searches += 1;
    return [movie(parsed.candidateTitle, parsed.year ?? 2024)];
  });
  const dune = parseScrapedTitle("Dune 2021 Hindi 1080p");
  const first = await resolver(dune);
  const cached = await resolver(dune);
  const capped = await resolver(parseScrapedTitle("Arrival 2016 1080p"));

  assert.equal(first.status, "matched");
  assert.equal(cached.status, "matched");
  assert.equal(capped.status, "unavailable");
  assert.equal(searches, 1);
});

test("fails safely when TMDB search rejects", async () => {
  const resolver = createTmdbTitleResolver(
    "test-key",
    1,
    async () => {
      throw new Error("429");
    },
  );

  const result = await resolver(parseScrapedTitle("Arrival 2016 1080p"));
  assert.equal(result.status, "unavailable");
  assert.equal(result.displayTitle, "Arrival 2016 1080p");
});