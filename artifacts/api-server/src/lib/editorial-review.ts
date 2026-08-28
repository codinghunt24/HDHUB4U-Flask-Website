import type { TmdbCatalogMetadata } from "./tmdb-metadata";

export type EditorialReview = {
  intro: string;
  overview: string | null;
  audience: string | null;
  production: string | null;
  credits: string | null;
};

export type EditorialReviewFacts = Pick<
  TmdbCatalogMetadata,
  | "title"
  | "mediaType"
  | "originalTitle"
  | "overview"
  | "year"
  | "releaseDate"
  | "runtime"
  | "language"
  | "genres"
  | "rating"
  | "voteCount"
  | "revenue"
  | "budget"
  | "tagline"
  | "director"
  | "cast"
  | "keywords"
>;

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

const formatMoney = (value: number | null) =>
  value != null && value > 0
    ? `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`
    : null;

const cleanText = (value: string | null | undefined) => value?.trim() || null;

export const buildEditorialReview = (
  facts: EditorialReviewFacts,
): EditorialReview => {
  const kind = facts.mediaType === "tv" ? "series" : "film";
  const year = facts.year ? ` from ${facts.year}` : "";
  const genres = facts.genres.filter(Boolean).slice(0, 3);
  const genreSentence = genres.length
    ? ` It is catalogued under ${genres.join(", ")}.`
    : "";
  const tagline = cleanText(facts.tagline);
  const taglineSentence = tagline
    ? ` Its listed tagline is “${tagline}”${/[.!?]$/.test(tagline) ? "" : "."}`
    : "";
  const intro = `${facts.title} is a ${kind}${year}.${genreSentence}${
    taglineSentence
  }`;

  const audience =
    facts.rating != null && facts.voteCount != null && facts.voteCount > 0
      ? `TMDB records an audience rating of ${facts.rating.toFixed(1)}/10 based on ${new Intl.NumberFormat("en-US").format(facts.voteCount)} votes.`
      : facts.rating != null
        ? `TMDB records an audience rating of ${facts.rating.toFixed(1)}/10.`
        : null;

  const productionFacts = [
    facts.releaseDate
      ? `Release date: ${formatDate(facts.releaseDate)}`
      : null,
    facts.runtime ? `Runtime: ${facts.runtime} minutes` : null,
    facts.language ? `Original language: ${facts.language}` : null,
    facts.originalTitle &&
    facts.originalTitle.trim().toLowerCase() !== facts.title.trim().toLowerCase()
      ? `Original title: ${facts.originalTitle.trim()}`
      : null,
    facts.budget && facts.budget > 0
      ? `Reported budget: ${formatMoney(facts.budget)}`
      : null,
    facts.revenue && facts.revenue > 0
      ? `Reported revenue: ${formatMoney(facts.revenue)}`
      : null,
  ].filter(Boolean);
  const production = productionFacts.length
    ? productionFacts.join(" · ")
    : null;

  const director = cleanText(facts.director);
  const cast = facts.cast
    .filter((member) => member.name?.trim())
    .slice(0, 5)
    .map((member) =>
      member.character?.trim()
        ? `${member.name.trim()} as ${member.character.trim()}`
        : member.name.trim(),
    );
  const creditsFacts = [
    director ? `Director: ${director}` : null,
    cast.length ? `Cast: ${cast.join(", ")}` : null,
  ].filter(Boolean);
  const credits = creditsFacts.length ? creditsFacts.join(" · ") : null;

  return {
    intro,
    overview: cleanText(facts.overview),
    audience,
    production,
    credits,
  };
};