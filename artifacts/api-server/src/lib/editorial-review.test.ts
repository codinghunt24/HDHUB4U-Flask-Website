import assert from "node:assert/strict";
import test from "node:test";
import { buildEditorialReview } from "./editorial-review";

const baseFacts = {
  title: "The Example",
  mediaType: "movie" as const,
  originalTitle: "The Example Original",
  overview: "A factual synopsis supplied by the catalog.",
  year: 2025,
  releaseDate: "2025-06-14",
  runtime: 128,
  language: "English",
  genres: ["Drama", "Thriller"],
  rating: 7.8,
  voteCount: 12345,
  revenue: 987654,
  budget: 500000,
  tagline: "Every choice has a cost.",
  director: "A. Director",
  cast: [
    { name: "Actor One", character: "Lead", profileUrl: null },
    { name: "Actor Two", character: null, profileUrl: null },
  ],
  keywords: ["choice"],
};

test("composes a factual review from available movie metadata", () => {
  const review = buildEditorialReview(baseFacts);

  assert.match(review.intro, /The Example is a film from 2025/);
  assert.match(review.intro, /Drama, Thriller/);
  assert.equal(review.overview, baseFacts.overview);
  assert.match(review.audience ?? "", /7\.8\/10/);
  assert.match(review.audience ?? "", /12,345 votes/);
  assert.match(review.production ?? "", /June 14, 2025/);
  assert.match(review.production ?? "", /Reported budget: \$500,000/);
  assert.match(review.production ?? "", /Reported revenue: \$987,654/);
  assert.match(review.credits ?? "", /A\. Director/);
  assert.match(review.credits ?? "", /Actor One as Lead/);
});

test("omits unsupported review sections for sparse series metadata", () => {
  const review = buildEditorialReview({
    ...baseFacts,
    title: "Sparse Series",
    mediaType: "tv",
    originalTitle: null,
    overview: null,
    year: null,
    releaseDate: null,
    runtime: null,
    language: null,
    genres: [],
    rating: null,
    voteCount: null,
    revenue: null,
    budget: null,
    tagline: null,
    director: null,
    cast: [],
  });

  assert.equal(review.intro, "Sparse Series is a series.");
  assert.equal(review.overview, null);
  assert.equal(review.audience, null);
  assert.equal(review.production, null);
  assert.equal(review.credits, null);
});