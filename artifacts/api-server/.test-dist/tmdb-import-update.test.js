// src/lib/tmdb-import-update.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/lib/tmdb-import-update.ts
var getCandidateResolutionUpdate = (candidate, existingStatus) => {
  if (candidate.tmdbEnrichmentStatus !== "ready" && existingStatus === "ready") {
    return {};
  }
  return {
    detectedTitle: candidate.detectedTitle ?? null,
    titleMatchStatus: candidate.titleMatchStatus ?? "unmatched",
    titleMatchConfidence: candidate.titleMatchConfidence ?? null,
    titleMatchType: candidate.titleMatchType === "unknown" ? null : candidate.titleMatchType ?? null,
    titleMatchYear: candidate.titleMatchYear ?? null,
    tmdbId: candidate.tmdbId ?? null,
    tmdbMediaType: candidate.tmdbMediaType ?? null,
    tmdbMetadata: candidate.tmdbMetadata ?? null,
    tmdbEnrichmentStatus: candidate.tmdbEnrichmentStatus ?? "pending",
    tmdbEnrichedAt: candidate.tmdbEnrichedAt ?? null
  };
};

// src/lib/tmdb-import-update.test.ts
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
    tmdbEnrichedAt: null
  };
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
    tmdbEnrichedAt: /* @__PURE__ */ new Date("2026-08-27T00:00:00.000Z")
  };
  const update = getCandidateResolutionUpdate(readyCandidate, "ready");
  assert.equal(update.tmdbId, 999999);
  assert.equal(update.tmdbEnrichmentStatus, "ready");
  assert.deepEqual(update.tmdbMetadata, readyCandidate.tmdbMetadata);
});
