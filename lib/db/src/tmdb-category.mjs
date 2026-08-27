export const normalizeCategorySlug = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);

export const getPrimaryTmdbGenre = (metadata) => {
  const genres = metadata?.genres;
  if (!Array.isArray(genres)) return null;

  const primaryGenre = genres.find(
    (genre) => typeof genre === "string" && genre.trim().length > 0,
  );
  return primaryGenre?.trim() ?? null;
};