// src/lib/seo-title.test.ts
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
var getImportedTitleUpdate = (titleSource, normalizedTitle) => titleSource === "auto" ? { title: normalizedTitle } : {};

// src/lib/seo-title.test.ts
test("keeps verified release details while removing promotional noise", () => {
  assert.equal(
    normalizeScrapedTitle(
      "TOXIC (2026) V2 HQ-HDTC [Hindi-Kannada-Tamil-Telugu] 1080p 720p 480p | Full Movie Download | HDHUB4U",
      "https://new5.hdhub4u.cl/toxic-2026-hindi-line-v2-hdtc-full-movie/"
    ),
    "Toxic (2026) V2 HQ-HDTC Hindi-Kannada-Tamil-Telugu 1080p 720p 480p Get"
  );
});
test("preserves series, season, episode, language, and quality facts", () => {
  assert.equal(
    normalizeScrapedTitle(
      "REACHER S04E03 Hindi Dual Audio 1080p WEB-DL HEVC",
      "https://public.example/reacher-s04e03-hindi-dual-audio/"
    ),
    "Reacher S04E03 Hindi Dual Audio 1080p WEB-DL HEVC"
  );
});
test("decodes entities and removes duplicate adjacent words", () => {
  assert.equal(
    normalizeScrapedTitle(
      "Movie Movie &amp; Stories | Watch Online",
      "https://public.example/movie-stories/"
    ),
    "Movie & Stories See Online"
  );
});
test("uses a readable URL fallback without inventing metadata", () => {
  assert.equal(
    normalizeScrapedTitle(
      "HDHUB4U | Download",
      "https://new5.hdhub4u.cl/a-quiet-place-day-one/"
    ),
    "a quiet place day one"
  );
});
test("bounds unusually long titles at a word boundary", () => {
  const title = normalizeScrapedTitle(
    `Example Film 2026 Hindi ${"Extended Release Detail ".repeat(10)}`,
    "https://public.example/example-film/"
  );
  assert.ok(title.length <= 120);
  assert.equal(title.endsWith(" "), false);
});
test("protects existing editorial titles and refreshes only auto titles", () => {
  assert.deepEqual(
    getImportedTitleUpdate("manual", "Normalized Source Title"),
    {}
  );
  assert.deepEqual(
    getImportedTitleUpdate("auto", "Normalized Source Title"),
    { title: "Normalized Source Title" }
  );
});
test("extracts only the movie name and year from release noise", () => {
  assert.deepEqual(
    parseScrapedTitle(
      "TOXIC (2026) V2 HQ-HDTC [Hindi-Kannada-Tamil-Telugu] 1080p 720p 480p | Full Movie Download | HDHUB4U",
      "https://new5.hdhub4u.cl/toxic-2026-hindi-line-v2-hdtc-full-movie/"
    ),
    {
      sourceTitle: "TOXIC (2026) V2 HQ-HDTC [Hindi-Kannada-Tamil-Telugu] 1080p 720p 480p | Full Movie Download | HDHUB4U",
      normalizedTitle: "Toxic (2026) V2 HQ-HDTC Hindi-Kannada-Tamil-Telugu 1080p 720p 480p Get",
      candidateTitle: "Toxic",
      year: 2026,
      mediaType: "movie",
      season: null,
      episode: null
    }
  );
});
test("extracts a series name and season episode markers", () => {
  const parsed = parseScrapedTitle(
    "REACHER S04E03 Hindi Dual Audio 1080p WEB-DL HEVC"
  );
  assert.equal(parsed.candidateTitle, "Reacher");
  assert.equal(parsed.mediaType, "tv");
  assert.equal(parsed.season, 4);
  assert.equal(parsed.episode, 3);
});
test("recognizes episode-only and complete-series releases as TV", () => {
  const episodeOnly = parseScrapedTitle(
    "Reacher Episode 3 Hindi 1080p WEB-DL"
  );
  assert.equal(episodeOnly.candidateTitle, "Reacher");
  assert.equal(episodeOnly.mediaType, "tv");
  assert.equal(episodeOnly.episode, 3);
  const completeSeries = parseScrapedTitle(
    "Panchayat Complete Web Series Hindi 1080p"
  );
  assert.equal(completeSeries.candidateTitle, "Panchayat");
  assert.equal(completeSeries.mediaType, "tv");
});
test("keeps media type unknown when the release title has no reliable marker", () => {
  const parsed = parseScrapedTitle("Dune 2021 Hindi 1080p");
  assert.equal(parsed.mediaType, "unknown");
  assert.equal(parsed.candidateTitle, "Dune");
});
test("does not strip language words when they are part of a movie name", () => {
  assert.equal(
    parseScrapedTitle("Hindi Medium (2017) Hindi 1080p WEB-DL").candidateTitle,
    "Hindi Medium"
  );
  assert.equal(
    parseScrapedTitle("English Vinglish (2012) Hindi 720p").candidateTitle,
    "English Vinglish"
  );
  assert.equal(
    parseScrapedTitle("The English Patient (1996) English 1080p").candidateTitle,
    "The English Patient"
  );
  assert.equal(
    parseScrapedTitle("The Hindi Teacher Hindi 1080p").candidateTitle,
    "The Hindi Teacher"
  );
});
test("strips a language suffix only when release metadata confirms it", () => {
  assert.equal(
    parseScrapedTitle("Arrival Hindi Dual Audio 1080p").candidateTitle,
    "Arrival"
  );
  assert.equal(
    parseScrapedTitle("Kantara Hindi-Kannada-Tamil 1080p WEB-DL").candidateTitle,
    "Kantara"
  );
});
