// src/lib/tmdb-title-resolver.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/lib/seo-title.ts
var MAX_SCRAPED_TITLE_LENGTH = 120;
var decodeTitleEntities = (value) => value.replace(/&amp;|&#0*38;/gi, "&").replace(/&quot;|&#0*34;/gi, '"').replace(/&apos;|&#0*39;|&#x0*27;/gi, "'").replace(/&nbsp;|&#0*160;/gi, " ").replace(/&ndash;|&#0*8211;/gi, "\u2013").replace(/&mdash;|&#0*8212;/gi, "\u2014").replace(/&rsquo;|&#0*8217;/gi, "\u2019");
var escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var TECHNICAL_TOKEN = /^(?:HD|UHD|HDRIP|WEB-?DL|WEBRIP|BLU-?RAY|DVDRIP|HQ-?HDTC|HDTC|HQ|CAM|HEVC|X26[45]|DDP?\d(?:\.\d)?|AAC|ESUBS?|S\d{1,2}E\d{1,3}|\d{3,4}P)$/i;
var normalizeUppercaseWords = (value) => value.split(" ").map((word) => {
  if (TECHNICAL_TOKEN.test(word.replace(/[(),]/g, "")) || !/[A-Z]/.test(word) || word !== word.toUpperCase() || word.length < 4) {
    return word;
  }
  const lower = word.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}).join(" ");
var removeAdjacentDuplicateWords = (value) => {
  const words = value.split(" ");
  return words.filter((word, index) => {
    if (index === 0) return true;
    const current = word.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const previous = words[index - 1].toLowerCase().replace(/[^a-z0-9]+/g, "");
    return !current || current !== previous;
  }).join(" ");
};
var truncateAtWord = (value, maxLength) => {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const truncated = cut.slice(0, lastSpace >= 72 ? lastSpace : maxLength);
  return truncated.replace(/[\s,;:|/–—-]+$/g, "");
};
var titleFromUrl = (sourceUrl) => {
  if (!sourceUrl) return "";
  try {
    const url = sourceUrl instanceof URL ? sourceUrl : new URL(sourceUrl);
    const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(segment).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
};
var normalizeScrapedTitle = (sourceTitle, sourceUrl) => {
  let title = decodeTitleEntities(sourceTitle).replace(/<[^>]+>/g, " ").replace(/[\[\]{}]/g, " ").replace(/[|•]+/g, " ");
  try {
    const url = sourceUrl instanceof URL ? sourceUrl : new URL(sourceUrl ?? "");
    const hostname = url.hostname.replace(/^www\./i, "");
    title = title.replace(new RegExp(escapeRegExp(hostname), "gi"), " ").replace(/\b(?:new\d+\.)?hdhub4u(?:\.[a-z]{2,})*\b/gi, " ");
  } catch {
    title = title.replace(/\bhdhub4u(?:\.[a-z]{2,})*\b/gi, " ");
  }
  title = title.replace(/\bwatch\b/gi, " See ").replace(/\bstream(?:\s+online)?\b/gi, " ").replace(/\bdownload\b/gi, " Get ").replace(/\bfree\s+(?=Get\b)/gi, " ").replace(/\bfull\s+(?:movie|series)\b/gi, " ").replace(/\bclick\s+here\b/gi, " ").replace(/\s+/g, " ").replace(/^[\s,;:|/–—-]+|[\s,;:|/–—-]+$/g, "").trim();
  if (title.length < 3 || /^(?:Get|See(?:\s+Online)?)$/i.test(title)) {
    title = titleFromUrl(sourceUrl);
  }
  title = normalizeUppercaseWords(removeAdjacentDuplicateWords(title)).replace(/\s+([,;:)])/g, "$1").replace(/([(])\s+/g, "$1").replace(/\s+/g, " ").trim();
  if (title.length < 3) return "Imported Post";
  return truncateAtWord(title, MAX_SCRAPED_TITLE_LENGTH);
};
var RELEASE_NOISE_SOURCE = String.raw`\b(?:V\d+|Dual\s+Audio|Multi\s+Audio|HQ-?HDTC|HDTC|WEB-?DL|WEBRIP|BLU-?RAY|DVDRIP|HDRIP|CAMRIP|CAM|UHD|HD|HQ|HEVC|X26[45]|DDP?\d(?:\.\d)?|AAC|ESUBS?|2160P|1080P|720P|480P|360P|Get|See)\b`;
var LANGUAGE_RELEASE_NOISE = /\b(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Punjabi|Marathi|Gujarati)(?:\s*[-/+]\s*(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Punjabi|Marathi|Gujarati))*\b(?=\s+(?:Dual\s+Audio|Multi\s+Audio|HQ-?HDTC|HDTC|WEB-?DL|WEBRIP|BLU-?RAY|DVDRIP|HDRIP|CAMRIP|CAM|UHD|HD|HQ|HEVC|X26[45]|DDP?\d(?:\.\d)?|AAC|ESUBS?|2160P|1080P|720P|480P|360P)\b)/gi;
var getFallbackCandidateTitle = (normalizedTitle) => normalizedTitle.replace(/\s+(?:Get|See)(?:\s+Online)?\s*$/i, "").replace(/[\s,;:|/–—([{-]+$/g, "").trim();
var parseScrapedTitle = (sourceTitle, sourceUrl) => {
  const normalizedTitle = normalizeScrapedTitle(sourceTitle, sourceUrl);
  const yearMatch = normalizedTitle.match(/\b((?:19|20)\d{2})\b/);
  const seasonEpisodeMatch = normalizedTitle.match(
    /\bS(\d{1,2})(?:E(\d{1,3}))?\b/i
  );
  const seasonWordMatch = normalizedTitle.match(
    /\bSeason\s+(\d{1,2})(?:\s+Episode\s+(\d{1,3}))?\b/i
  );
  const episodeWordMatch = normalizedTitle.match(/\bEpisode\s+(\d{1,3})\b/i);
  const seriesMarkerMatch = seasonEpisodeMatch ?? seasonWordMatch ?? episodeWordMatch ?? normalizedTitle.match(
    /\b(?:Complete\s+(?:Web\s+|TV\s+)?Series|Web\s+Series|TV\s+Series|Series)\b/i
  );
  const movieMarkerMatch = sourceTitle.match(/\b(?:Full\s+)?Movie\b/i);
  const mediaType = seriesMarkerMatch ? "tv" : movieMarkerMatch ? "movie" : "unknown";
  const noiseBoundary = [
    ...normalizedTitle.matchAll(new RegExp(RELEASE_NOISE_SOURCE, "gi"))
  ].find((match) => typeof match.index === "number" && match.index > 0)?.index;
  const languageBoundary = [...normalizedTitle.matchAll(LANGUAGE_RELEASE_NOISE)].find((match) => typeof match.index === "number" && match.index > 0)?.index;
  const boundaries = [
    yearMatch?.index,
    seriesMarkerMatch?.index,
    noiseBoundary,
    languageBoundary
  ].filter(
    (index) => typeof index === "number" && index > 0
  );
  const candidateEnd = boundaries.length > 0 ? Math.min(...boundaries) : normalizedTitle.length;
  const candidateTitle = getFallbackCandidateTitle(normalizedTitle.slice(0, candidateEnd)) || getFallbackCandidateTitle(normalizedTitle);
  return {
    sourceTitle: decodeTitleEntities(sourceTitle).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    normalizedTitle,
    candidateTitle: candidateTitle || "Imported Post",
    year: yearMatch ? Number(yearMatch[1]) : null,
    mediaType,
    season: seasonEpisodeMatch?.[1] ? Number(seasonEpisodeMatch[1]) : seasonWordMatch?.[1] ? Number(seasonWordMatch[1]) : null,
    episode: seasonEpisodeMatch?.[2] ? Number(seasonEpisodeMatch[2]) : seasonWordMatch?.[2] ? Number(seasonWordMatch[2]) : episodeWordMatch?.[1] ? Number(episodeWordMatch[1]) : null
  };
};

// src/lib/tmdb-title-resolver.ts
import { request as httpsRequest } from "node:https";

// src/lib/sitemap-import.ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
var lookupAllAddresses = (hostname) => lookup(hostname, { all: true, verbatim: true });
var parseIpv6 = (address) => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const [withoutZone] = normalized.split("%", 1);
  const pieces = withoutZone.split("::");
  if (pieces.length > 2) return null;
  const parsePart = (part) => {
    if (!part) return [];
    const values = part.split(":");
    const groups = [];
    for (const value of values) {
      if (value.includes(".")) {
        const octets = value.split(".").map(Number);
        if (octets.length !== 4 || octets.some(
          (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255
        )) {
          return null;
        }
        groups.push(octets[0] << 8 | octets[1], octets[2] << 8 | octets[3]);
      } else {
        if (!/^[\da-f]{1,4}$/i.test(value)) return null;
        groups.push(Number.parseInt(value, 16));
      }
    }
    return groups;
  };
  const left = parsePart(pieces[0]);
  const right = parsePart(pieces[1] ?? "");
  if (!left || !right) return null;
  if (pieces.length === 1 && left.length !== 8) return null;
  if (pieces.length === 2 && left.length + right.length >= 8) return null;
  return [
    ...left,
    ...pieces.length === 2 ? Array.from({ length: 8 - left.length - right.length }, () => 0) : [],
    ...right
  ];
};
var isUnsafeIpv4Address = (address) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 0 || a === 192 && b === 168 || a === 198 && (b === 18 || b === 19) || a === 198 && b === 51 && parts[2] === 100 || a === 203 && b === 0 && parts[2] === 113 || a >= 224;
};
var isUnsafeIpAddress = (address) => {
  const family = isIP(address);
  if (family === 4) return isUnsafeIpv4Address(address);
  if (family !== 6) return true;
  const groups = parseIpv6(address);
  if (!groups) return true;
  const first = groups[0];
  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 65535;
  if (isIpv4Mapped) {
    const embeddedIpv4 = [
      groups[6] >> 8,
      groups[6] & 255,
      groups[7] >> 8,
      groups[7] & 255
    ].join(".");
    return isUnsafeIpv4Address(embeddedIpv4);
  }
  return groups.every((group) => group === 0) || groups.slice(0, 7).every((group) => group === 0) || (first & 65024) === 64512 || (first & 65472) === 65152 || (first & 65280) === 65280 || groups[0] === 8193 && groups[1] === 3512 || groups[0] === 8193 && groups[1] === 0;
};
var resolvePublicDestination = async (url, resolve = lookupAllAddresses) => {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolve(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isUnsafeIpAddress(address))) {
    throw new Error("This source resolves to a non-public address");
  }
  return addresses[0];
};

// src/lib/tmdb-title-resolver.ts
var TMDB_ORIGIN = "https://api.themoviedb.org";
var TMDB_TIMEOUT_MS = 8e3;
var MAX_TMDB_RESPONSE_BYTES = 1024 * 1024;
var MATCH_THRESHOLD = 0.9;
var REVIEW_THRESHOLD = 0.65;
var MINIMUM_WINNING_MARGIN = 0.08;
var normalizeComparableTitle = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
var getLevenshteinDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};
var getTitleSimilarity = (left, right) => {
  const normalizedLeft = normalizeComparableTitle(left);
  const normalizedRight = normalizeComparableTitle(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const distance = getLevenshteinDistance(normalizedLeft, normalizedRight);
  const editSimilarity = 1 - distance / Math.max(normalizedLeft.length, normalizedRight.length);
  const leftTokens = new Set(normalizedLeft.split(" "));
  const rightTokens = new Set(normalizedRight.split(" "));
  const intersection = [...leftTokens].filter(
    (token) => rightTokens.has(token)
  ).length;
  const union = (/* @__PURE__ */ new Set([...leftTokens, ...rightTokens])).size;
  const tokenSimilarity = union > 0 ? intersection / union : 0;
  return editSimilarity * 0.65 + tokenSimilarity * 0.35;
};
var scoreTmdbCandidate = (parsed, candidate) => {
  const primarySimilarity = getTitleSimilarity(
    parsed.candidateTitle,
    candidate.title
  );
  const originalSimilarity = candidate.originalTitle ? getTitleSimilarity(parsed.candidateTitle, candidate.originalTitle) : 0;
  let score = Math.max(primarySimilarity, originalSimilarity) * 0.86;
  if (parsed.year && candidate.year) {
    score += parsed.year === candidate.year ? 0.12 : -0.28;
  }
  if (parsed.mediaType !== "unknown" && parsed.mediaType === candidate.mediaType) {
    score += 0.04;
  }
  return Math.max(0, Math.min(1, score));
};
var resolveTmdbCandidates = (parsed, candidates) => {
  const ranked = candidates.map((candidate) => ({
    candidate,
    confidence: scoreTmdbCandidate(parsed, candidate)
  })).sort((left, right) => right.confidence - left.confidence);
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
      year: parsed.year
    };
  }
  const winningMargin = best.confidence - (second?.confidence ?? 0);
  const matched = best.confidence >= MATCH_THRESHOLD && (!second || winningMargin >= MINIMUM_WINNING_MARGIN);
  return {
    displayTitle: matched ? best.candidate.title : parsed.normalizedTitle,
    detectedTitle: best.candidate.title,
    status: matched ? "matched" : "review",
    confidence: best.confidence,
    tmdbId: matched ? best.candidate.id : null,
    mediaType: best.candidate.mediaType,
    year: best.candidate.year
  };
};
var mapTmdbResults = (response, mediaType) => (response.results ?? []).slice(0, 10).map((result) => {
  const title = mediaType === "movie" ? result.title : result.name;
  const originalTitle = mediaType === "movie" ? result.original_title : result.original_name;
  const date = mediaType === "movie" ? result.release_date : result.first_air_date;
  return result.id && title ? {
    id: result.id,
    mediaType,
    title,
    originalTitle: originalTitle ?? null,
    year: date?.match(/^(\d{4})/) ? Number(date.slice(0, 4)) : null
  } : null;
}).filter((candidate) => Boolean(candidate));
var requestTmdbJson = async (path, apiKey) => {
  const url = new URL(path, TMDB_ORIGIN);
  url.searchParams.set("api_key", apiKey);
  const destination = await resolvePublicDestination(url);
  return new Promise((resolve, reject) => {
    const boundLookup = (_hostname, options, callback) => {
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
        lookup: boundLookup
      },
      (response) => {
        const chunks = [];
        let receivedBytes = 0;
        response.on("data", (chunk) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_TMDB_RESPONSE_BYTES) {
            request.destroy(new Error("TMDB response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error("TMDB search is unavailable"));
            return;
          }
          try {
            resolve(
              JSON.parse(Buffer.concat(chunks).toString("utf8"))
            );
          } catch {
            reject(new Error("TMDB returned an invalid response"));
          }
        });
      }
    );
    request.setTimeout(TMDB_TIMEOUT_MS, () => {
      request.destroy(new Error("TMDB search timed out"));
    });
    request.on("error", reject);
    request.end();
  });
};
var searchTmdb = async (parsed, apiKey) => {
  const mediaTypes = parsed.mediaType === "unknown" ? ["movie", "tv"] : [parsed.mediaType];
  const responses = await Promise.all(
    mediaTypes.map(async (mediaType) => {
      const params = new URLSearchParams({ query: parsed.candidateTitle });
      if (parsed.year) {
        params.set(
          mediaType === "movie" ? "year" : "first_air_date_year",
          String(parsed.year)
        );
      }
      const response = await requestTmdbJson(
        `/3/search/${mediaType}?${params.toString()}`,
        apiKey
      );
      return mapTmdbResults(response, mediaType);
    })
  );
  return responses.flat();
};
var createTmdbTitleResolver = (apiKey, maxLookups = 25, search = searchTmdb) => {
  let lookups = 0;
  const cache = /* @__PURE__ */ new Map();
  return (parsed) => {
    const cacheKey = [
      parsed.candidateTitle,
      parsed.year ?? "",
      parsed.mediaType
    ].join("|");
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const resolution = (async () => {
      if (!apiKey || lookups >= maxLookups) {
        return {
          displayTitle: parsed.normalizedTitle,
          detectedTitle: parsed.candidateTitle,
          status: "unavailable",
          confidence: 0,
          tmdbId: null,
          mediaType: parsed.mediaType,
          year: parsed.year
        };
      }
      lookups += 1;
      try {
        return resolveTmdbCandidates(
          parsed,
          await search(parsed, apiKey)
        );
      } catch {
        return {
          displayTitle: parsed.normalizedTitle,
          detectedTitle: parsed.candidateTitle,
          status: "unavailable",
          confidence: 0,
          tmdbId: null,
          mediaType: parsed.mediaType,
          year: parsed.year
        };
      }
    })();
    cache.set(cacheKey, resolution);
    return resolution;
  };
};

// src/lib/tmdb-title-resolver.test.ts
var movie = (title, year, originalTitle = null) => ({
  id: year,
  mediaType: "movie",
  title,
  originalTitle,
  year
});
test("accepts a clear exact movie title and year match", () => {
  const parsed = parseScrapedTitle(
    "TOXIC (2026) V2 HQ-HDTC Hindi 1080p"
  );
  const result = resolveTmdbCandidates(parsed, [
    movie("Toxic", 2026),
    movie("Toxic Avenger", 2023)
  ]);
  assert.equal(result.status, "matched");
  assert.equal(result.displayTitle, "Toxic");
  assert.equal(result.detectedTitle, "Toxic");
  assert.ok(result.confidence >= 0.9);
});
test("keeps the safe title when equally strong candidates are ambiguous", () => {
  const parsed = parseScrapedTitle("The Gift 2015 Hindi 1080p");
  const result = resolveTmdbCandidates(parsed, [
    movie("The Gift", 2015),
    movie("The Gift", 2015)
  ]);
  assert.equal(result.status, "review");
  assert.equal(result.displayTitle, parsed.normalizedTitle);
  assert.equal(result.detectedTitle, "The Gift");
});
test("rejects an exact title with the wrong year", () => {
  const parsed = parseScrapedTitle("Dune 2021 Hindi 1080p");
  const wrongYearScore = scoreTmdbCandidate(parsed, movie("Dune", 1984));
  assert.ok(wrongYearScore < 0.65);
  assert.equal(
    resolveTmdbCandidates(parsed, [movie("Dune", 1984)]).status,
    "unmatched"
  );
});
test("matches punctuation and diacritic variants", () => {
  const parsed = parseScrapedTitle("Amelie 2001 French 1080p");
  const result = resolveTmdbCandidates(parsed, [
    movie("Am\xE9lie", 2001, "Le Fabuleux Destin d'Am\xE9lie Poulain")
  ]);
  assert.equal(result.status, "matched");
  assert.equal(result.displayTitle, "Am\xE9lie");
});
test("marks unrelated TMDB results as unmatched", () => {
  const parsed = parseScrapedTitle("A Quiet Place Day One 2024 1080p");
  const result = resolveTmdbCandidates(parsed, [
    movie("Inside Out 2", 2024)
  ]);
  assert.equal(result.status, "unmatched");
  assert.equal(result.displayTitle, parsed.normalizedTitle);
});
test("does not call TMDB when a key is missing", async () => {
  let searches = 0;
  const resolver = createTmdbTitleResolver(null, 25, async () => {
    searches += 1;
    return [];
  });
  const result = await resolver(parseScrapedTitle("Dune 2021 Hindi 1080p"));
  assert.equal(result.status, "unavailable");
  assert.equal(searches, 0);
});
test("caches repeated searches and respects the lookup cap", async () => {
  let searches = 0;
  const resolver = createTmdbTitleResolver("test-key", 1, async (parsed) => {
    searches += 1;
    return [movie(parsed.candidateTitle, parsed.year ?? 2024)];
  });
  const dune = parseScrapedTitle("Dune 2021 Hindi 1080p");
  const first = await resolver(dune);
  const cached = await resolver(dune);
  const capped = await resolver(parseScrapedTitle("Arrival 2016 1080p"));
  assert.equal(first.status, "matched");
  assert.equal(cached.status, "matched");
  assert.equal(capped.status, "unavailable");
  assert.equal(searches, 1);
});
test("fails safely when TMDB search rejects", async () => {
  const resolver = createTmdbTitleResolver(
    "test-key",
    1,
    async () => {
      throw new Error("429");
    }
  );
  const result = await resolver(parseScrapedTitle("Arrival 2016 1080p"));
  assert.equal(result.status, "unavailable");
  assert.equal(result.displayTitle, "Arrival 2016 1080p");
});
