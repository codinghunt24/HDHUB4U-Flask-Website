export type TmdbImportCandidate = {
  detectedTitle?: string | null;
  titleMatchStatus?: string | null;
  titleMatchConfidence?: number | null;
  titleMatchType?: "movie" | "tv" | "unknown" | null;
  titleMatchYear?: number | null;
  tmdbId?: number | null;
  tmdbMediaType?: "movie" | "tv" | null;
  tmdbMetadata?: Record<string, unknown> | null;
  tmdbEnrichmentStatus?: string | null;
  tmdbEnrichedAt?: Date | null;
};

export type TmdbResolutionUpdate = {
  detectedTitle?: string | null;
  titleMatchStatus?: string;
  titleMatchConfidence?: number | null;
  titleMatchType?: "movie" | "tv" | null;
  titleMatchYear?: number | null;
  tmdbId?: number | null;
  tmdbMediaType?: "movie" | "tv" | null;
  tmdbMetadata?: Record<string, unknown> | null;
  tmdbEnrichmentStatus?: string;
  tmdbEnrichedAt?: Date | null;
};

export const getCandidateResolutionUpdate = (
  candidate: TmdbImportCandidate,
  existingStatus?: string | null,
): TmdbResolutionUpdate => {
  if (
    candidate.tmdbEnrichmentStatus !== "ready" &&
    existingStatus === "ready"
  ) {
    return {};
  }

  return {
    detectedTitle: candidate.detectedTitle ?? null,
    titleMatchStatus: candidate.titleMatchStatus ?? "unmatched",
    titleMatchConfidence: candidate.titleMatchConfidence ?? null,
    titleMatchType:
      candidate.titleMatchType === "unknown"
        ? null
        : candidate.titleMatchType ?? null,
    titleMatchYear: candidate.titleMatchYear ?? null,
    tmdbId: candidate.tmdbId ?? null,
    tmdbMediaType: candidate.tmdbMediaType ?? null,
    tmdbMetadata: candidate.tmdbMetadata ?? null,
    tmdbEnrichmentStatus: candidate.tmdbEnrichmentStatus ?? "pending",
    tmdbEnrichedAt: candidate.tmdbEnrichedAt ?? null,
  };
};