import { requestTmdbJson } from "./tmdb-title-resolver";

export type TmdbMediaType = "movie" | "tv";

export type TmdbCatalogMetadata = {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  originalTitle: string | null;
  releaseDate: string | null;
  year: number | null;
  runtime: number | null;
  language: string | null;
  genres: string[];
  rating: number | null;
  voteCount: number | null;
  revenue: number | null;
  budget: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  tagline: string | null;
  editorialSummary: string;
  director: string | null;
  cast: Array<{ name: string; character: string | null; profileUrl: string | null }>;
  trailerUrl: string | null;
  imdbId: string | null;
  keywords: string[];
  related: Array<{
    id: number;
    mediaType: TmdbMediaType;
    title: string;
    year: number | null;
    posterUrl: string | null;
  }>;
  tmdbUrl: string;
  attribution: string;
  syncedAt: string;
};

type TmdbDetailResponse = {
  id?: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  original_language?: string;
  genres?: Array<{ name?: string }>;
  vote_average?: number;
  vote_count?: number;
  revenue?: number;
  budget?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  tagline?: string;
  credits?: {
    cast?: Array<{
      name?: string;
      character?: string;
      profile_path?: string | null;
      order?: number;
    }>;
    crew?: Array<{ name?: string; job?: string }>;
  };
  videos?: {
    results?: Array<{
      site?: string;
      key?: string;
      type?: string;
      official?: boolean;
    }>;
  };
  external_ids?: { imdb_id?: string | null };
  keywords?: {
    keywords?: Array<{ name?: string }>;
    results?: Array<{ name?: string }>;
  };
  recommendations?: { results?: TmdbRelatedResult[] };
  similar?: { results?: TmdbRelatedResult[] };
};

type TmdbRelatedResult = {
  id?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

const imageUrl = (
  path: string | null | undefined,
  size: "w342" | "w500" | "w1280",
) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

const getYear = (date: string | undefined) => {
  const match = date?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
};

const uniqueText = (values: Array<string | undefined | null>, limit: number) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].slice(
    0,
    limit,
  );

const languageNames: Record<string, string> = {
  bn: "Bengali",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  kn: "Kannada",
  ko: "Korean",
  ml: "Malayalam",
  mr: "Marathi",
  pa: "Punjabi",
  pt: "Portuguese",
  ru: "Russian",
  ta: "Tamil",
  te: "Telugu",
  ur: "Urdu",
  zh: "Chinese",
};

const getLanguageName = (languageCode: string | undefined) => {
  const normalizedCode = languageCode?.trim().toLowerCase();
  if (!normalizedCode) return null;
  return languageNames[normalizedCode] ?? normalizedCode.toUpperCase();
};

export const buildEditorialSummary = (
  metadata: Pick<
    TmdbCatalogMetadata,
    "title" | "mediaType" | "year" | "genres" | "runtime" | "director" | "cast" | "rating" | "revenue"
  >,
) => {
  const kind = metadata.mediaType === "tv" ? "series" : "film";
  const year = metadata.year ? ` released in ${metadata.year}` : "";
  const genre = metadata.genres.length
    ? ` Its TMDB catalog entry is listed under ${metadata.genres.slice(0, 2).join(" and ")}.`
    : "";
  const runtime = metadata.runtime
    ? ` The listed runtime is ${metadata.runtime} minutes.`
    : "";
  const credits = metadata.director
    ? ` Direction is credited to ${metadata.director}.`
    : metadata.cast[0]
      ? ` The featured cast includes ${metadata.cast.slice(0, 3).map((member) => member.name).join(", ")}.`
      : "";
  const rating =
    metadata.rating && metadata.rating > 0
      ? ` TMDB currently records a ${metadata.rating.toFixed(1)}/10 audience rating.`
      : "";
  const revenue =
    metadata.mediaType === "movie" && metadata.revenue && metadata.revenue > 0
      ? ` Reported box-office revenue is $${metadata.revenue.toLocaleString("en-US")}.`
      : "";

  return `${metadata.title} is a ${kind}${year}.${genre}${runtime}${credits}${rating}${revenue}`;
};

const toRelatedTitles = (
  values: TmdbRelatedResult[] | undefined,
  mediaType: TmdbMediaType,
) =>
  (values ?? [])
    .flatMap((item) => {
      const title = mediaType === "movie" ? item.title : item.name;
      if (!item.id || !title) return [];
      return [
        {
          id: item.id,
          mediaType,
          title,
          year: getYear(
            mediaType === "movie" ? item.release_date : item.first_air_date,
          ),
          posterUrl: imageUrl(item.poster_path, "w342"),
        },
      ];
    })
    .slice(0, 6);

export const fetchTmdbCatalogMetadata = async (
  id: number,
  mediaType: TmdbMediaType,
  apiKey: string,
): Promise<TmdbCatalogMetadata> => {
  const response = await requestTmdbJson<TmdbDetailResponse>(
    `/3/${mediaType}/${id}?append_to_response=credits,videos,external_ids,keywords,recommendations,similar`,
    apiKey,
  );
  const title = mediaType === "movie" ? response.title : response.name;
  if (!response.id || !title) {
    throw new Error("TMDB did not return a valid catalog record");
  }

  const releaseDate =
    mediaType === "movie" ? response.release_date : response.first_air_date;
  const cast = (response.credits?.cast ?? [])
    .sort((left, right) => (left.order ?? 999) - (right.order ?? 999))
    .flatMap((member) =>
      member.name
        ? [
            {
              name: member.name,
              character: member.character?.trim() || null,
              profileUrl: imageUrl(member.profile_path, "w342"),
            },
          ]
        : [],
    )
    .slice(0, 10);
  const director =
    response.credits?.crew?.find(
      (member) => member.job?.toLowerCase() === "director" && member.name,
    )?.name ?? null;
  const trailer = (response.videos?.results ?? []).find(
    (video) =>
      video.site === "YouTube" &&
      Boolean(video.key) &&
      (video.official || video.type === "Trailer"),
  );
  const runtime =
    response.runtime && response.runtime > 0
      ? response.runtime
      : response.episode_run_time?.find((value) => value > 0) ?? null;
  const base = {
    id: response.id,
    mediaType,
    title,
    originalTitle:
      (mediaType === "movie" ? response.original_title : response.original_name) ??
      null,
    releaseDate: releaseDate ?? null,
    year: getYear(releaseDate),
    runtime,
    language: getLanguageName(response.original_language),
    genres: uniqueText(response.genres?.map((genre) => genre.name) ?? [], 6),
    rating:
      typeof response.vote_average === "number"
        ? Math.round(response.vote_average * 10) / 10
        : null,
    voteCount: response.vote_count ?? null,
    revenue: mediaType === "movie" ? response.revenue ?? null : null,
    budget: mediaType === "movie" ? response.budget ?? null : null,
    posterUrl: imageUrl(response.poster_path, "w500"),
    backdropUrl: imageUrl(response.backdrop_path, "w1280"),
    tagline: response.tagline?.trim() || null,
    director,
    cast,
  };

  return {
    ...base,
    editorialSummary: buildEditorialSummary(base),
    trailerUrl: trailer?.key
      ? `https://www.youtube.com/watch?v=${trailer.key}`
      : null,
    imdbId: response.external_ids?.imdb_id ?? null,
    keywords: uniqueText(
      [
        ...(response.keywords?.keywords ?? []),
        ...(response.keywords?.results ?? []),
      ].map((keyword) => keyword.name),
      10,
    ),
    related: toRelatedTitles(
      response.recommendations?.results?.length
        ? response.recommendations.results
        : response.similar?.results,
      mediaType,
    ),
    tmdbUrl: `https://www.themoviedb.org/${mediaType}/${response.id}`,
    attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    syncedAt: new Date().toISOString(),
  };
};