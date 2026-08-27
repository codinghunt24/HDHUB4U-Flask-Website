import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const SITEMAP_BATCH_SIZE = 25;

type LookupAddress = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

const lookupAllAddresses: LookupAll = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

const parseIpv6 = (address: string): number[] | null => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const [withoutZone] = normalized.split("%", 1);
  const pieces = withoutZone.split("::");
  if (pieces.length > 2) return null;

  const parsePart = (part: string) => {
    if (!part) return [];
    const values = part.split(":");
    const groups: number[] = [];
    for (const value of values) {
      if (value.includes(".")) {
        const octets = value.split(".").map(Number);
        if (
          octets.length !== 4 ||
          octets.some(
            (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
          )
        ) {
          return null;
        }
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
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
    ...(pieces.length === 2
      ? Array.from({ length: 8 - left.length - right.length }, () => 0)
      : []),
    ...right,
  ];
};

const isUnsafeIpv4Address = (address: string) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
};

export const isUnsafeIpAddress = (address: string) => {
  const family = isIP(address);
  if (family === 4) return isUnsafeIpv4Address(address);
  if (family !== 6) return true;

  const groups = parseIpv6(address);
  if (!groups) return true;

  const first = groups[0];
  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIpv4Mapped) {
    const embeddedIpv4 = [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join(".");
    return isUnsafeIpv4Address(embeddedIpv4);
  }

  return (
    groups.every((group) => group === 0) ||
    groups.slice(0, 7).every((group) => group === 0) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (groups[0] === 0x2001 && groups[1] === 0x0db8) ||
    (groups[0] === 0x2001 && groups[1] === 0)
  );
};

export const parseExternalUrl = (value: string) => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    (isIP(hostname) > 0 && isUnsafeIpAddress(hostname))
  ) {
    throw new Error("This source URL is not allowed");
  }
  return url;
};

export const resolvePublicDestination = async (
  url: URL,
  resolve: LookupAll = lookupAllAddresses,
) => {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolve(hostname);
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isUnsafeIpAddress(address))
  ) {
    throw new Error("This source resolves to a non-public address");
  }
  return addresses[0];
};

export const getSitemapId = (
  url: string,
  secret = process.env.SESSION_SECRET ?? "hdhub4u-development-secret",
) => createHmac("sha256", secret).update(url).digest("base64url");

export const isValidSitemapId = (
  url: string,
  id: string,
  secret = process.env.SESSION_SECRET ?? "hdhub4u-development-secret",
) => {
  const expected = Buffer.from(getSitemapId(url, secret));
  const provided = Buffer.from(id);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
};

export const extractXmlLocations = (
  xml: string,
  clean = (value: string) => value.trim(),
) =>
  [...xml.matchAll(/<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc>/gi)]
    .map((match) => clean(match[1]))
    .filter(Boolean);

const parseSitemapDate = (
  value: string | undefined,
  clean: (value: string) => string,
) => {
  if (!value) return null;
  const date = new Date(clean(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export type SitemapUrlEntry = {
  url: string;
  lastmod: Date | null;
};

export const getUniqueSitemapEntries = (
  xml: string,
  baseUrl: URL,
  clean: (value: string) => string = (value) => value.trim(),
) => {
  const urlBlocks = [
    ...xml.matchAll(
      /<(?:[\w.-]+:)?url\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?url>/gi,
    ),
  ].map((match) => match[1]);
  const entries = new Map<string, SitemapUrlEntry>();

  for (const block of urlBlocks) {
    const location = block.match(
      /<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc>/i,
    )?.[1];
    if (!location) continue;
    try {
      const url = new URL(clean(location), baseUrl).toString();
      if (!entries.has(url)) {
        entries.set(url, {
          url,
          lastmod: parseSitemapDate(
            block.match(
              /<(?:[\w.-]+:)?lastmod\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?lastmod>/i,
            )?.[1],
            clean,
          ),
        });
      }
    } catch {
      // Ignore malformed sitemap locations and continue with valid entries.
    }
  }

  if (urlBlocks.length === 0) {
    for (const location of extractXmlLocations(xml, clean)) {
      try {
        const url = new URL(location, baseUrl).toString();
        if (!entries.has(url)) entries.set(url, { url, lastmod: null });
      } catch {
        // Ignore malformed sitemap locations and continue with valid entries.
      }
    }
  }

  return [...entries.values()];
};

export const getUniqueSitemapUrls = (
  xml: string,
  baseUrl: URL,
  clean?: (value: string) => string,
) => getUniqueSitemapEntries(xml, baseUrl, clean).map((entry) => entry.url);

export const getNextSitemapOffset = (
  offset: number,
  processed: number,
  total: number,
) => (offset + processed < total ? offset + processed : null);

export type SitemapCandidate = {
  url: string;
  title: string;
  thumbnailUrl: string;
  publishedAt?: Date | null;
  sourceTitle?: string | null;
  detectedTitle?: string | null;
  titleMatchStatus?: "matched" | "review" | "unmatched" | "unavailable";
  titleMatchConfidence?: number | null;
  titleMatchType?: "movie" | "tv" | "unknown" | null;
  titleMatchYear?: number | null;
};

export const persistSitemapCandidates = async (
  candidates: SitemapCandidate[],
  options: {
    offset: number;
    importTimestamp?: number;
    insert: (
      candidate: SitemapCandidate,
      publishedAt: Date,
      candidateIndex: number,
    ) => Promise<boolean>;
  },
) => {
  let imported = 0;
  let skipped = 0;
  const importTimestamp = options.importTimestamp ?? Date.now();
  for (const [candidateIndex, candidate] of candidates.entries()) {
    const sourcePublishedAt =
      candidate.publishedAt ??
      new Date(importTimestamp - (options.offset + candidateIndex) * 1000);
    if (await options.insert(candidate, sourcePublishedAt, candidateIndex)) {
      imported += 1;
    } else skipped += 1;
  }
  return { imported, skipped };
};
