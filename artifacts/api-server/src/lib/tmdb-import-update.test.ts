import assert from "node:assert/strict";
import test from "node:test";
import { getCandidateResolutionUpdate } from "./tmdb-import-update";

test("preserves ready TMDB metadata when a re-import cannot enrich", () => {
  const transientCandidate = {
    detectedTitle: "Example Feature",
    titleMatchStatus: "unavailable",
    titleMatchConfidence: 0,
    titleMatchType: null,
    titleMatchYear: null,
    tmdbId: null,
    tmdbMediaType: null,
    tmdbMetadata: null,
    tmdbEnrichmentStatus: "unavailable",
    tmdbEnrichedAt: null,
  } as any;

  assert.deepEqual(getCandidateResolutionUpdate(transientCandidate, "ready"), {});
});

test("accepts a successful re-import as an intentional metadata refresh", () => {
  const readyCandidate = {
    detectedTitle: "Example Feature",
    titleMatchStatus: "matched",
    titleMatchConfidence: 100,
    titleMatchType: "movie",
    titleMatchYear: 2026,
    tmdbId: 999999,
    tmdbMediaType: "movie",
    tmdbMetadata: { id: 999999, title: "Example Feature" },
    tmdbEnrichmentStatus: "ready",
    tmdbEnrichedAt: new Date("2026-08-27T00:00:00.000Z"),
  } as any;

  const update = getCandidateResolutionUpdate(readyCandidate, "ready");
  assert.equal(update.tmdbId, 999999);
  assert.equal(update.tmdbEnrichmentStatus, "ready");
  assert.deepEqual(update.tmdbMetadata, readyCandidate.tmdbMetadata);
});