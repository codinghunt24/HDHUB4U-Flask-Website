// src/lib/editorial-review.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/lib/editorial-review.ts
var formatDate = (value) => {
  if (!value) return null;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
};
var formatMoney = (value) => value != null && value > 0 ? `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}` : null;
var cleanText = (value) => value?.trim() || null;
var cleanEnglishText = (value) => {
  const text = cleanText(value);
  return text && /^[\u0000-\u024f\s]+$/u.test(text) ? text : null;
};
var buildEditorialReview = (facts) => {
  const kind = facts.mediaType === "tv" ? "series" : "film";
  const year = facts.year ? ` from ${facts.year}` : "";
  const genres = facts.genres.filter(Boolean).slice(0, 3);
  const genreSentence = genres.length ? ` It is catalogued under ${genres.join(", ")}.` : "";
  const tagline = cleanEnglishText(facts.tagline);
  const taglineSentence = tagline ? ` Its listed tagline is \u201C${tagline}\u201D${/[.!?]$/.test(tagline) ? "" : "."}` : "";
  const intro = `${facts.title} is a ${kind}${year}.${genreSentence}${taglineSentence}`;
  const audience = facts.rating != null && facts.voteCount != null && facts.voteCount > 0 ? `TMDB records an audience rating of ${facts.rating.toFixed(1)}/10 based on ${new Intl.NumberFormat("en-US").format(facts.voteCount)} votes.` : facts.rating != null ? `TMDB records an audience rating of ${facts.rating.toFixed(1)}/10.` : null;
  const productionFacts = [
    facts.releaseDate ? `Release date: ${formatDate(facts.releaseDate)}` : null,
    facts.runtime ? `Runtime: ${facts.runtime} minutes` : null,
    facts.language ? `Original language: ${facts.language}` : null,
    cleanEnglishText(facts.originalTitle) && cleanEnglishText(facts.originalTitle).toLowerCase() !== facts.title.trim().toLowerCase() ? `Original title: ${cleanEnglishText(facts.originalTitle)}` : null,
    facts.budget && facts.budget > 0 ? `Reported budget: ${formatMoney(facts.budget)}` : null,
    facts.revenue && facts.revenue > 0 ? `Reported revenue: ${formatMoney(facts.revenue)}` : null
  ].filter(Boolean);
  const production = productionFacts.length ? productionFacts.join(" \xB7 ") : null;
  const director = cleanText(facts.director);
  const cast = facts.cast.filter((member) => member.name?.trim()).slice(0, 5).map(
    (member) => member.character?.trim() ? `${member.name.trim()} as ${member.character.trim()}` : member.name.trim()
  );
  const creditsFacts = [
    director ? `Director: ${director}` : null,
    cast.length ? `Cast: ${cast.join(", ")}` : null
  ].filter(Boolean);
  const credits = creditsFacts.length ? creditsFacts.join(" \xB7 ") : null;
  return {
    intro,
    overview: cleanEnglishText(facts.overview),
    audience,
    production,
    credits
  };
};

// src/lib/editorial-review.test.ts
var baseFacts = {
  title: "The Example",
  mediaType: "movie",
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
  budget: 5e5,
  tagline: "Every choice has a cost.",
  director: "A. Director",
  cast: [
    { name: "Actor One", character: "Lead", profileUrl: null },
    { name: "Actor Two", character: null, profileUrl: null }
  ],
  keywords: ["choice"]
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
    cast: []
  });
  assert.equal(review.intro, "Sparse Series is a series.");
  assert.equal(review.overview, null);
  assert.equal(review.audience, null);
  assert.equal(review.production, null);
  assert.equal(review.credits, null);
});
test("omits non-Latin original titles from the English visitor copy", () => {
  const review = buildEditorialReview({
    ...baseFacts,
    originalTitle: "\u0927\u0941\u0930\u0902\u0927\u0930: \u0926 \u0930\u093F\u0935\u0947\u0902\u091C"
  });
  assert.doesNotMatch(review.production ?? "", /धुरंधर/);
  assert.match(review.production ?? "", /Original language: English/);
  assert.match(review.production ?? "", /Reported budget: \$500,000/);
});
