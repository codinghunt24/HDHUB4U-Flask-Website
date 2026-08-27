import { request as httpsRequest } from "node:https";
import { type LookupFunction } from "node:net";
import {
  resolvePublicDestination,
} from "./sitemap-import";
import {
  type ParsedScrapedTitle,
  type ScrapedTitleMediaType,
} from "./seo-title";

const TMDB_ORIGIN = "https://api.themoviedb.org";
const TMDB_TIMEOUT_MS = 8_000;
const MAX_TMDB_RESPONSE_BYTES = 1024 * 1024;
const MATCH_THRESHOLD = 0.9;
const REVIEW_THRESHOLD = 0.65;
const MINIMUM_WINNING_MARGIN = 0.08;

export type TmdbTitleCandidate = {
  id: number;
  mediaType: Exclude<ScrapedTitleMediaType, "unknown">;
  title: string;
  originalTitle: string | null;
  year: number | null;
};

export type TitleMatchStatus =
  | "matched"
  | "review"
  | "unmatched"
  | "unavailable";

export type ResolvedTitle = {
  displayTitle: string;
  detectedTitle: string;
  status: TitleMatchStatus;
  confidence: number;
  tmdbId: number | null;
  mediaType: ScrapedTitleMediaType;
  year: number | null;
};

type TmdbSearchResponse = {
  results?: Array<{
    id?: number;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
  }>;
};

const normalizeComparableTitle = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getLevenshteinDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const getTitleSimilarity = (left: string, right: string) => {
  const normalizedLeft = normalizeComparableTitle(left);
  const normalizedRight = normalizeComparableTitle(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const distance = getLevenshteinDistance(normalizedLeft, normalizedRight);
  const editSimilarity =
    1 - distance / Math.max(normalizedLeft.length, normalizedRight.length);
  const leftTokens = new Set(normalizedLeft.split(" "));
  const rightTokens = new Set(normalizedRight.split(" "));
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenSimilarity = union > 0 ? intersection / union : 0;

  return editSimilarity * 0.65 + tokenSimilarity * 0.35;
};

export const scoreTmdbCandidate = (
  parsed: ParsedScrapedTitle,
  candidate: TmdbTitleCandidate,
) => {
  const primarySimilarity = getTitleSimilarity(
    parsed.candidateTitle,
    candidate.title,
  );
  const originalSimilarity = candidate.originalTitle
    ? getTitleSimilarity(parsed.candidateTitle, candidate.originalTitle)
    : 0;
  let score = Math.max(primarySimilarity, originalSimilarity) * 0.86;

  if (parsed.year && candidate.year) {
    score += parsed.year === candidate.year ? 0.12 : -0.28;
  }
  if (
    parsed.mediaType !== "unknown" &&
    parsed.mediaType === candidate.mediaType
  ) {
    score += 0.04;
  }

  return Math.max(0, Math.min(1, score));
};

export const resolveTmdbCandidates = (
  parsed: ParsedScrapedTitle,
  candidates: TmdbTitleCandidate[],
): ResolvedTitle => {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      confidence: scoreTmdbCandidate(parsed, candidate),
    }))
    .sort((left, right) => right.confidence - left.confidence);
  const best = ranked[0];
  const second = ranked[1];

  if (!best || best.confidence < REVIEW_THRESHOLD) {
    return {
      displayTitle: parsed.normalizedTitle,
      detectedTitle: parsed.candidateTitle,
      status: "unmatched",
      confidence: best?.confidence ?? 0,
      tmdbId: null,
      mediaType: parsed.mediaType,
      year: parsed.year,
    };
  }

  const winningMargin = best.confidence - (second?.confidence ?? 0);
  const matched =
    best.confidence >= MATCH_THRESHOLD &&
    (!second || winningMargin >= MINIMUM_WINNING_MARGIN);

  return {
    displayTitle: matched ? best.candidate.title : parsed.normalizedTitle,
    detectedTitle: best.candidate.title,
    status: matched ? "matched" : "review",
    confidence: best.confidence,
    tmdbId: matched ? best.candidate.id : null,
    mediaType: best.candidate.mediaType,
    year: best.candidate.year,
  };
};

const mapTmdbResults = (
  response: TmdbSearchResponse,
  mediaType: Exclude<ScrapedTitleMediaType, "unknown">,
): TmdbTitleCandidate[] =>
  (response.results ?? [])
    .slice(0, 10)
    .map((result) => {
      const title = mediaType === "movie" ? result.title : result.name;
      const originalTitle =
        mediaType === "movie" ? result.original_title : result.original_name;
      const date =
        mediaType === "movie" ? result.release_date : result.first_air_date;
      return result.id && title
        ? {
            id: result.id,
            mediaType,
            title,
            originalTitle: originalTitle ?? null,
            year: date?.match(/^(\d{4})/) ? Number(date.slice(0, 4)) : null,
          }
        : null;
    })
    .filter((candidate): candidate is TmdbTitleCandidate => Boolean(candidate));

export const requestTmdbJson = async <T>(
  path: string,
  apiKey: string,
): Promise<T> => {
  const url = new URL(path, TMDB_ORIGIN);
  url.searchParams.set("api_key", apiKey);
  const destination = await resolvePublicDestination(url);

  return new Promise((resolve, reject) => {
    const boundLookup: LookupFunction = (_hostname, options, callback) => {
      if (typeof options === "object" && options.all) {
        callback(null, [destination]);
        return;
      }
      callback(null, destination.address, destination.family);
    };
    const request = httpsRequest(
      url,
      {
        method: "GET",
        headers: { accept: "application/json" },
        lookup: boundLookup,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_TMDB_RESPONSE_BYTES) {
            request.destroy(new Error("TMDB response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            reject(new Error("TMDB search is unavailable"));
            return;
          }
          try {
            resolve(
              JSON.parse(Buffer.concat(chunks).toString("utf8")) as T,
            );
          } catch {
            reject(new Error("TMDB returned an invalid response"));
          }
        });
      },
    );
    request.setTimeout(TMDB_TIMEOUT_MS, () => {
      request.destroy(new Error("TMDB search timed out"));
    });
    request.on("error", reject);
    request.end();
  });
};

const searchTmdb = async (
  parsed: ParsedScrapedTitle,
  apiKey: string,
): Promise<TmdbTitleCandidate[]> => {
  const mediaTypes =
    parsed.mediaType === "unknown"
      ? (["movie", "tv"] as const)
      : ([parsed.mediaType] as const);
  const responses = await Promise.all(
    mediaTypes.map(async (mediaType) => {
      const params = new URLSearchParams({ query: parsed.candidateTitle });
      if (parsed.year) {
        params.set(
          mediaType === "movie" ? "year" : "first_air_date_year",
          String(parsed.year),
        );
      }
      const response = await requestTmdbJson<TmdbSearchResponse>(
        `/3/search/${mediaType}?${params.toString()}`,
        apiKey,
      );
      return mapTmdbResults(response, mediaType);
    }),
  );
  return responses.flat();
};

export const createTmdbTitleResolver = (
  apiKey: string | null,
  maxLookups = 25,
  search: (
    parsed: ParsedScrapedTitle,
    key: string,
  ) => Promise<TmdbTitleCandidate[]> = searchTmdb,
) => {
  let lookups = 0;
  const cache = new Map<string, Promise<ResolvedTitle>>();

  return (parsed: ParsedScrapedTitle): Promise<ResolvedTitle> => {
    const cacheKey = [
      parsed.candidateTitle,
      parsed.year ?? "",
      parsed.mediaType,
    ].join("|");
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const resolution = (async () => {
      if (!apiKey || lookups >= maxLookups) {
        return {
          displayTitle: parsed.normalizedTitle,
          detectedTitle: parsed.candidateTitle,
          status: "unavailable" as const,
          confidence: 0,
          tmdbId: null,
          mediaType: parsed.mediaType,
          year: parsed.year,
        };
      }
      lookups += 1;
      try {
        return resolveTmdbCandidates(
          parsed,
          await search(parsed, apiKey),
        );
      } catch {
        return {
          displayTitle: parsed.normalizedTitle,
          detectedTitle: parsed.candidateTitle,
          status: "unavailable" as const,
          confidence: 0,
          tmdbId: null,
          mediaType: parsed.mediaType,
          year: parsed.year,
        };
      }
    })();
    cache.set(cacheKey, resolution);
    return resolution;
  };
};