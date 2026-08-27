const MAX_SCRAPED_TITLE_LENGTH = 120;

export type ScrapedTitleMediaType = "movie" | "tv" | "unknown";

export type ParsedScrapedTitle = {
  sourceTitle: string;
  normalizedTitle: string;
  candidateTitle: string;
  year: number | null;
  mediaType: ScrapedTitleMediaType;
  season: number | null;
  episode: number | null;
};

const decodeTitleEntities = (value: string) =>
  value
    .replace(/&amp;|&#0*38;/gi, "&")
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
    .replace(/&nbsp;|&#0*160;/gi, " ")
    .replace(/&ndash;|&#0*8211;/gi, "–")
    .replace(/&mdash;|&#0*8212;/gi, "—")
    .replace(/&rsquo;|&#0*8217;/gi, "’");

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TECHNICAL_TOKEN =
  /^(?:HD|UHD|HDRIP|WEB-?DL|WEBRIP|BLU-?RAY|DVDRIP|HQ-?HDTC|HDTC|HQ|CAM|HEVC|X26[45]|DDP?\d(?:\.\d)?|AAC|ESUBS?|S\d{1,2}E\d{1,3}|\d{3,4}P)$/i;

const normalizeUppercaseWords = (value: string) =>
  value
    .split(" ")
    .map((word) => {
      if (
        TECHNICAL_TOKEN.test(word.replace(/[(),]/g, "")) ||
        !/[A-Z]/.test(word) ||
        word !== word.toUpperCase() ||
        word.length < 4
      ) {
        return word;
      }
      const lower = word.toLowerCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");

const removeAdjacentDuplicateWords = (value: string) => {
  const words = value.split(" ");
  return words
    .filter((word, index) => {
      if (index === 0) return true;
      const current = word.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const previous = words[index - 1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      return !current || current !== previous;
    })
    .join(" ");
};

const truncateAtWord = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const truncated = cut.slice(0, lastSpace >= 72 ? lastSpace : maxLength);
  return truncated.replace(/[\s,;:|/–—-]+$/g, "");
};

const titleFromUrl = (sourceUrl?: string | URL | null) => {
  if (!sourceUrl) return "";
  try {
    const url = sourceUrl instanceof URL ? sourceUrl : new URL(sourceUrl);
    const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(segment)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
};

export const normalizeScrapedTitle = (
  sourceTitle: string,
  sourceUrl?: string | URL | null,
) => {
  let title = decodeTitleEntities(sourceTitle)
    .replace(/<[^>]+>/g, " ")
    .replace(/[\[\]{}]/g, " ")
    .replace(/[|•]+/g, " ");

  try {
    const url = sourceUrl instanceof URL ? sourceUrl : new URL(sourceUrl ?? "");
    const hostname = url.hostname.replace(/^www\./i, "");
    title = title
      .replace(new RegExp(escapeRegExp(hostname), "gi"), " ")
      .replace(/\b(?:new\d+\.)?hdhub4u(?:\.[a-z]{2,})*\b/gi, " ");
  } catch {
    title = title.replace(/\bhdhub4u(?:\.[a-z]{2,})*\b/gi, " ");
  }

  title = title
    .replace(/\bwatch\b/gi, " See ")
    .replace(/\bstream(?:\s+online)?\b/gi, " ")
    .replace(/\bdownload\b/gi, " Get ")
    .replace(/\bfree\s+(?=Get\b)/gi, " ")
    .replace(/\bfull\s+(?:movie|series)\b/gi, " ")
    .replace(/\bclick\s+here\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:|/–—-]+|[\s,;:|/–—-]+$/g, "")
    .trim();

  if (title.length < 3 || /^(?:Get|See(?:\s+Online)?)$/i.test(title)) {
    title = titleFromUrl(sourceUrl);
  }

  title = normalizeUppercaseWords(removeAdjacentDuplicateWords(title))
    .replace(/\s+([,;:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (title.length < 3) return "Imported Post";
  return truncateAtWord(title, MAX_SCRAPED_TITLE_LENGTH);
};

const RELEASE_NOISE_SOURCE =
  String.raw`\b(?:V\d+|Dual\s+Audio|Multi\s+Audio|HQ-?HDTC|HDTC|WEB-?DL|WEBRIP|BLU-?RAY|DVDRIP|HDRIP|CAMRIP|CAM|UHD|HD|HQ|HEVC|X26[45]|DDP?\d(?:\.\d)?|AAC|ESUBS?|2160P|1080P|720P|480P|360P|Get|See)\b`;
const LANGUAGE_RELEASE_NOISE =
  /\b(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Punjabi|Marathi|Gujarati)(?:\s*[-/+]\s*(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Punjabi|Marathi|Gujarati))*\b(?=\s+(?:Dual\s+Audio|Multi\s+Audio|HQ-?HDTC|HDTC|WEB-?DL|WEBRIP|BLU-?RAY|DVDRIP|HDRIP|CAMRIP|CAM|UHD|HD|HQ|HEVC|X26[45]|DDP?\d(?:\.\d)?|AAC|ESUBS?|2160P|1080P|720P|480P|360P)\b)/gi;

const getFallbackCandidateTitle = (normalizedTitle: string) =>
  normalizedTitle
    .replace(/\s+(?:Get|See)(?:\s+Online)?\s*$/i, "")
    .replace(/[\s,;:|/–—([{-]+$/g, "")
    .trim();

export const parseScrapedTitle = (
  sourceTitle: string,
  sourceUrl?: string | URL | null,
): ParsedScrapedTitle => {
  const normalizedTitle = normalizeScrapedTitle(sourceTitle, sourceUrl);
  const yearMatch = normalizedTitle.match(/\b((?:19|20)\d{2})\b/);
  const seasonEpisodeMatch = normalizedTitle.match(
    /\bS(\d{1,2})(?:E(\d{1,3}))?\b/i,
  );
  const seasonWordMatch = normalizedTitle.match(
    /\bSeason\s+(\d{1,2})(?:\s+Episode\s+(\d{1,3}))?\b/i,
  );
  const episodeWordMatch = normalizedTitle.match(/\bEpisode\s+(\d{1,3})\b/i);
  const seriesMarkerMatch =
    seasonEpisodeMatch ??
    seasonWordMatch ??
    episodeWordMatch ??
    normalizedTitle.match(
      /\b(?:Complete\s+(?:Web\s+|TV\s+)?Series|Web\s+Series|TV\s+Series|Series)\b/i,
    );
  const movieMarkerMatch = sourceTitle.match(/\b(?:Full\s+)?Movie\b/i);
  const mediaType: ScrapedTitleMediaType = seriesMarkerMatch
    ? "tv"
    : movieMarkerMatch
      ? "movie"
      : "unknown";
  const noiseBoundary = [
    ...normalizedTitle.matchAll(new RegExp(RELEASE_NOISE_SOURCE, "gi")),
  ].find((match) => typeof match.index === "number" && match.index > 0)?.index;
  const languageBoundary = [...normalizedTitle.matchAll(LANGUAGE_RELEASE_NOISE)]
    .find((match) => typeof match.index === "number" && match.index > 0)?.index;
  const boundaries = [
    yearMatch?.index,
    seriesMarkerMatch?.index,
    noiseBoundary,
    languageBoundary,
  ].filter(
    (index): index is number =>
      typeof index === "number" && index > 0,
  );
  const candidateEnd =
    boundaries.length > 0 ? Math.min(...boundaries) : normalizedTitle.length;
  const candidateTitle =
    getFallbackCandidateTitle(normalizedTitle.slice(0, candidateEnd)) ||
    getFallbackCandidateTitle(normalizedTitle);

  return {
    sourceTitle: decodeTitleEntities(sourceTitle)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    normalizedTitle,
    candidateTitle: candidateTitle || "Imported Post",
    year: yearMatch ? Number(yearMatch[1]) : null,
    mediaType,
    season: seasonEpisodeMatch?.[1]
      ? Number(seasonEpisodeMatch[1])
      : seasonWordMatch?.[1]
        ? Number(seasonWordMatch[1])
        : null,
    episode: seasonEpisodeMatch?.[2]
      ? Number(seasonEpisodeMatch[2])
      : seasonWordMatch?.[2]
        ? Number(seasonWordMatch[2])
        : episodeWordMatch?.[1]
          ? Number(episodeWordMatch[1])
          : null,
  };
};

export const getImportedTitleUpdate = (
  titleSource: string,
  normalizedTitle: string,
) => (titleSource === "auto" ? { title: normalizedTitle } : {});
