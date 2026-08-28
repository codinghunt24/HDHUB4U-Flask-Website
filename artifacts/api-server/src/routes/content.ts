import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Router, type IRouter, type Request } from "express";
import {
  AdminLoginBody,
  AdminLoginResponse,
  AdminLogoutResponse,
  BackfillAdminPostMediaBody,
  BackfillAdminPostMediaResponse,
  DiscoverSitemapsBody,
  DiscoverSitemapsResponse,
  EnrichAdminTmdbPostsBody,
  EnrichAdminTmdbPostsResponse,
  RefreshAdminPostSourceImagesBody,
  RefreshAdminPostSourceImagesResponse,
  GetAdminSessionResponse,
  GetAdminSettingsResponse,
  GetAdminTmdbApiKeyResponse,
  GetAdminSitemapResponse,
  GetAdminSummaryResponse,
  GetPostParams,
  GetPostResponse,
  GetPublicSettingsResponse,
  ImportPostsBody,
  ImportPostsResponse,
  ListAdminPostsQueryParams,
  ListAdminPostsResponse,
  ListCategoriesResponse,
  ListPostsQueryParams,
  ListPostsResponse,
  ScrapeSitemapBody,
  ScrapeSitemapResponse,
  UpdateAdminPostBody,
  UpdateAdminPostParams,
  UpdateAdminPostResponse,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
  DeleteAdminTmdbApiKeyResponse,
  DeleteAllAdminPostsResponse,
  SaveAdminTmdbApiKeyBody,
  SaveAdminTmdbApiKeyResponse,
} from "@workspace/api-zod";
import {
  adminSessionsTable,
  categoriesTable,
  db,
  importRunsTable,
  postsTable,
  settingsTable,
} from "@workspace/db";
import {
  getPrimaryTmdbGenre,
  normalizeCategorySlug,
} from "@workspace/db/tmdb-category";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  max,
  or,
  sql,
} from "drizzle-orm";
import {
  SITEMAP_BATCH_SIZE,
  SOURCE_IMAGE_LIMIT,
  extractSourceImageUrls,
  createPinnedLookup,
  extractXmlLocations,
  getNextSitemapOffset,
  getSitemapId,
  getUniqueSitemapEntries,
  isValidSitemapId,
  parseExternalUrl,
  persistSitemapCandidates,
  resolvePublicDestination,
  validatePublicSourceImageUrls,
  type SitemapCandidate,
} from "../lib/sitemap-import";
import { getCandidateResolutionUpdate } from "../lib/tmdb-import-update";
import {
  getImportedTitleUpdate,
  parseScrapedTitle,
  type ParsedScrapedTitle,
} from "../lib/seo-title";
import {
  buildImportedExcerpt,
  cleanImportedExcerpt,
  containsBlockedImportTerms,
  replaceVisitorTerms,
} from "../lib/imported-content";
import {
  decryptTmdbApiKey,
  encryptTmdbApiKey,
  maskTmdbApiKey,
} from "../lib/tmdb-api-key";
import {
  createTmdbTitleResolver,
  type ResolvedTitle,
} from "../lib/tmdb-title-resolver";
import {
  buildEditorialSummary,
  fetchTmdbCatalogMetadata,
  type TmdbCatalogMetadata,
} from "../lib/tmdb-metadata";
import { buildEditorialReview } from "../lib/editorial-review";
import {
  getPublicMediaUrl,
  isMediaAssetId,
  MediaAssetNotFoundError,
  openMediaAsset,
  persistMediaAsset,
} from "../lib/media-storage";
import {
  getAdminAdSettings,
  getPublicAdSettings,
} from "../lib/adsterra-settings";

const router: IRouter = Router();
const SESSION_COOKIE = "hdhub4u_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_CATEGORY = {
  name: "Latest",
  slug: "latest",
} as const;
type TmdbEnrichmentStatus =
  | "pending"
  | "ready"
  | "review"
  | "unmatched"
  | "unavailable"
  | "failed";

const getOrCreateDefaultCategory = async () => {
  const [existing] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, DEFAULT_CATEGORY.slug))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(categoriesTable)
    .values(DEFAULT_CATEGORY)
    .onConflictDoNothing({ target: categoriesTable.slug });

  const [created] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, DEFAULT_CATEGORY.slug))
    .limit(1);
  return created;
};

const getOrCreateCategoryByName = async (
  name: string,
  fallback: typeof categoriesTable.$inferSelect | null = null,
) => {
  const normalizedName = name.trim();
  const slug = normalizeCategorySlug(normalizedName);
  if (!normalizedName || !slug) return fallback;

  const [existing] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, slug))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(categoriesTable)
    .values({ name: normalizedName, slug })
    .onConflictDoNothing({ target: categoriesTable.slug });

  const [created] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, slug))
    .limit(1);
  return created ?? fallback;
};

const getCategoryForTmdbCandidate = async (
  candidate: Pick<SitemapCandidate, "tmdbMetadata" | "tmdbEnrichmentStatus">,
  fallback: typeof categoriesTable.$inferSelect | null = null,
) => {
  if (candidate.tmdbEnrichmentStatus !== "ready") return fallback;
  const genre = getPrimaryTmdbGenre(candidate.tmdbMetadata);
  return genre ? getOrCreateCategoryByName(genre, fallback) : fallback;
};

const cleanText = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || `post-${Date.now()}`;

const IMPORT_USER_AGENT =
  "HDHUB4U Authorized Content Importer/1.0 (+https://hdhub4u.tech)";
const PAGE_FETCH_CONCURRENCY = 5;
const SITEMAP_FETCH_CONCURRENCY = 4;
const MAX_SOURCE_REDIRECTS = 5;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_SOURCE_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const requestSource = async (
  url: URL,
  destination: { address: string; family: number },
  maxBytes: number,
) =>
  new Promise<{
    statusCode: number;
    location: string | null;
    contentType: string | null;
    body: Buffer;
  }>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": IMPORT_USER_AGENT,
          "accept-encoding": "identity",
        },
        lookup: createPinnedLookup(destination),
      },
      (response) => {
        const contentLength = Number(response.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          request.destroy(new Error("Source response is too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxBytes) {
            request.destroy(new Error("Source response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const locationHeader = response.headers.location;
          resolve({
            statusCode: response.statusCode ?? 0,
            location:
              typeof locationHeader === "string" ? locationHeader : null,
            contentType:
              typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : null,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.setTimeout(12000, () => {
      request.destroy(new Error("Source request timed out"));
    });
    request.on("error", reject);
    request.end();
  });

const requestSourceText = async (
  url: URL,
  destination: { address: string; family: number },
) => {
  const response = await requestSource(url, destination, MAX_SOURCE_BYTES);
  return { ...response, body: response.body.toString("utf8") };
};

const fetchSourceText = async (url: URL) => {
  let currentUrl = url;
  for (
    let redirectCount = 0;
    redirectCount <= MAX_SOURCE_REDIRECTS;
    redirectCount += 1
  ) {
    const destination = await resolvePublicDestination(currentUrl);
    const response = await requestSourceText(currentUrl, destination);
    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.location;
      if (!location || redirectCount === MAX_SOURCE_REDIRECTS) {
        throw new Error("Source redirected too many times");
      }
      currentUrl = parseExternalUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Source returned ${response.statusCode}`);
    }
    return response.body;
  }
  throw new Error("Source redirected too many times");
};

const fetchSourceImage = async (url: URL) => {
  let currentUrl = url;
  for (
    let redirectCount = 0;
    redirectCount <= MAX_SOURCE_REDIRECTS;
    redirectCount += 1
  ) {
    const destination = await resolvePublicDestination(currentUrl);
    const response = await requestSource(
      currentUrl,
      destination,
      MAX_SOURCE_IMAGE_BYTES,
    );
    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (!response.location || redirectCount === MAX_SOURCE_REDIRECTS) {
        throw new Error("Source redirected too many times");
      }
      currentUrl = parseExternalUrl(
        new URL(response.location, currentUrl).toString(),
      );
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Source returned ${response.statusCode}`);
    }
    const contentType = response.contentType?.split(";")[0]?.toLowerCase();
    if (!contentType || !ALLOWED_SOURCE_IMAGE_TYPES.has(contentType)) {
      throw new Error("Source did not return an allowed image type");
    }
    return { body: response.body, contentType };
  }
  throw new Error("Source redirected too many times");
};

const persistRemoteImage = async (url: string, maxWidth = 1600) => {
  try {
    const image = await fetchSourceImage(parseExternalUrl(url));
    return (await persistMediaAsset(image.body, maxWidth)).objectPath;
  } catch {
    // Source media is optional. Never retain a remote fallback when an image
    // cannot be safely fetched, decoded, compressed, and stored.
    return null;
  }
};

const persistRemoteImageList = async (urls: string[]) => {
  const stored: string[] = [];
  for (const url of urls) {
    const objectPath = await persistRemoteImage(url);
    if (objectPath) stored.push(objectPath);
  }
  return [...new Set(stored)].slice(0, SOURCE_IMAGE_LIMIT);
};

const persistTmdbMediaAssets = async (
  metadata: TmdbCatalogMetadata,
): Promise<TmdbCatalogMetadata> => {
  const [posterUrl, backdropUrl] = await Promise.all([
    metadata.posterUrl ? persistRemoteImage(metadata.posterUrl, 720) : null,
    metadata.backdropUrl ? persistRemoteImage(metadata.backdropUrl, 1600) : null,
  ]);
  const cast = await Promise.all(
    metadata.cast.map(async (member) => ({
      ...member,
      profileUrl: member.profileUrl
        ? await persistRemoteImage(member.profileUrl, 360)
        : null,
    })),
  );
  const related = await Promise.all(
    metadata.related.map(async (item) => ({
      ...item,
      posterUrl: item.posterUrl
        ? await persistRemoteImage(item.posterUrl, 480)
        : null,
    })),
  );
  return { ...metadata, posterUrl, backdropUrl, cast, related };
};

const isRemoteImageUrl = (value: unknown): value is string =>
  typeof value === "string" && /^https?:\/\//i.test(value);

const backfillImageReference = async (value: unknown, maxWidth: number) =>
  isRemoteImageUrl(value) ? (await persistRemoteImage(value, maxWidth)) ?? value : value;

const hasRemoteTmdbMedia = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object") return false;
  const record = metadata as Record<string, unknown>;
  return (
    isRemoteImageUrl(record.posterUrl) ||
    isRemoteImageUrl(record.backdropUrl) ||
    (Array.isArray(record.cast) &&
      record.cast.some(
        (member) =>
          member &&
          typeof member === "object" &&
          isRemoteImageUrl((member as Record<string, unknown>).profileUrl),
      )) ||
    (Array.isArray(record.related) &&
      record.related.some(
        (item) =>
          item &&
          typeof item === "object" &&
          isRemoteImageUrl((item as Record<string, unknown>).posterUrl),
      ))
  );
};

const backfillTmdbMedia = async (metadata: Record<string, unknown>) => ({
  ...metadata,
  posterUrl: await backfillImageReference(metadata.posterUrl, 720),
  backdropUrl: await backfillImageReference(metadata.backdropUrl, 1600),
  cast: Array.isArray(metadata.cast)
    ? await Promise.all(
        metadata.cast.map(async (member) =>
          member && typeof member === "object"
            ? {
                ...(member as Record<string, unknown>),
                profileUrl: await backfillImageReference(
                  (member as Record<string, unknown>).profileUrl,
                  360,
                ),
              }
            : member,
        ),
      )
    : [],
  related: Array.isArray(metadata.related)
    ? await Promise.all(
        metadata.related.map(async (item) =>
          item && typeof item === "object"
            ? {
                ...(item as Record<string, unknown>),
                posterUrl: await backfillImageReference(
                  (item as Record<string, unknown>).posterUrl,
                  480,
                ),
              }
            : item,
        ),
      )
    : [],
});

const discoverSitemapRoot = async (sourceUrl: URL) => {
  const candidates = /\.xml$/i.test(sourceUrl.pathname)
    ? [sourceUrl]
    : [
        new URL("/sitemap.xml", sourceUrl.origin),
        new URL("/sitemap_index.xml", sourceUrl.origin),
      ];
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return {
        url: candidate,
        xml: await fetchSourceText(candidate),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Could not find a sitemap");
};

const getPostSitemapEntries = async (sourceUrl: URL) => {
  const root = await discoverSitemapRoot(sourceUrl);
  const rootLocations = extractXmlLocations(root.xml, cleanText);
  const childUrls = /<sitemapindex\b/i.test(root.xml)
    ? [
        ...new Set(
          rootLocations
            .map((location) => {
              try {
                const url = new URL(location, root.url);
                return url.hostname === sourceUrl.hostname &&
                  /\.xml$/i.test(url.pathname) &&
                  !/(?:sitemap-misc|(?:category|page|authors?|archives?|tags?)-sitemap)/i.test(
                    url.pathname,
                  )
                  ? url.toString()
                  : null;
              } catch {
                return null;
              }
            })
            .filter((url): url is string => Boolean(url)),
        ),
      ].map((url) => new URL(url))
    : /<urlset\b/i.test(root.xml)
      ? [root.url]
      : [];

  if (childUrls.length === 0) {
    throw new Error("No post sitemaps were found at this source");
  }

  const entries: Array<{ id: string; url: string; postCount: number }> = [];
  for (
    let index = 0;
    index < childUrls.length;
    index += SITEMAP_FETCH_CONCURRENCY
  ) {
    const batch = childUrls.slice(index, index + SITEMAP_FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (childUrl) => {
        const xml =
          childUrl.toString() === root.url.toString()
            ? root.xml
            : await fetchSourceText(childUrl);
        if (!/<urlset\b/i.test(xml)) return null;
        const postCount = new Set(extractXmlLocations(xml)).size;
        return postCount > 0
          ? {
              id: getSitemapId(childUrl.toString()),
              url: childUrl.toString(),
              postCount,
            }
          : null;
      }),
    );
    for (const entry of results) {
      if (entry) entries.push(entry);
    }
  }

  if (entries.length === 0) {
    throw new Error("The discovered sitemaps do not contain posts");
  }
  return { rootUrl: root.url.toString(), entries };
};

const getHtmlAttribute = (tag: string, attribute: string) => {
  const match = tag.match(
    new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"),
  );
  return match?.[1] ?? null;
};

const getMetaContent = (html: string, key: string) => {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = getHtmlAttribute(tag, "property");
    const name = getHtmlAttribute(tag, "name");
    if (property?.toLowerCase() === key || name?.toLowerCase() === key) {
      return getHtmlAttribute(tag, "content");
    }
  }
  return null;
};

const getConfiguredTmdbApiKey = async () => {
  const [settings] = await db
    .select({ tmdbApiKeyEncrypted: settingsTable.tmdbApiKeyEncrypted })
    .from(settingsTable)
    .limit(1);
  if (!settings?.tmdbApiKeyEncrypted) return null;
  try {
    return decryptTmdbApiKey(settings.tmdbApiKeyEncrypted);
  } catch {
    return null;
  }
};

const getResolvedTitleFields = (
  parsedTitle: ParsedScrapedTitle,
  resolution: ResolvedTitle,
): {
  title: string;
  sourceTitle: string;
  detectedTitle: string;
  titleMatchStatus: ResolvedTitle["status"];
  titleMatchConfidence: number;
  titleMatchType: "movie" | "tv" | null;
  titleMatchYear: number | null;
  tmdbId: number | null;
  tmdbMediaType: "movie" | "tv" | null;
  tmdbEnrichmentStatus: TmdbEnrichmentStatus;
} => ({
  title: resolution.displayTitle,
  sourceTitle: parsedTitle.sourceTitle,
  detectedTitle: resolution.detectedTitle,
  titleMatchStatus: resolution.status,
  titleMatchConfidence: Math.round(resolution.confidence * 100),
  titleMatchType:
    resolution.mediaType === "unknown" ? null : resolution.mediaType,
  titleMatchYear: resolution.year,
  tmdbId: resolution.tmdbId,
  tmdbMediaType:
    resolution.tmdbId && resolution.mediaType !== "unknown"
      ? resolution.mediaType
      : null,
  tmdbEnrichmentStatus:
    (resolution.status === "matched" ? "pending" : resolution.status) as TmdbEnrichmentStatus,
});

const resolvePostTmdb = async (
  parsedTitle: ParsedScrapedTitle,
  resolveTitle: (parsedTitle: ParsedScrapedTitle) => Promise<ResolvedTitle>,
  apiKey: string | null,
) => {
  const resolution = await resolveTitle(parsedTitle);
  const fields = getResolvedTitleFields(parsedTitle, resolution);
  if (
    !apiKey ||
    resolution.status !== "matched" ||
    !resolution.tmdbId ||
    (resolution.mediaType !== "movie" && resolution.mediaType !== "tv")
  ) {
    return { ...fields, tmdbMetadata: null, tmdbEnrichedAt: null };
  }
  try {
    const metadata = await fetchTmdbCatalogMetadata(
      resolution.tmdbId,
      resolution.mediaType,
      apiKey,
    );
    const persistedMetadata = await persistTmdbMediaAssets(metadata);
    return {
      ...fields,
      tmdbId: persistedMetadata.id,
      tmdbMediaType: persistedMetadata.mediaType,
      tmdbMetadata: persistedMetadata as unknown as Record<string, unknown>,
      tmdbEnrichmentStatus: "ready" as const,
      tmdbEnrichedAt: new Date(),
    };
  } catch {
    return {
      ...fields,
      tmdbEnrichmentStatus: "failed" as const,
      tmdbMetadata: null,
      tmdbEnrichedAt: null,
    };
  }
};

const getTmdbPersistenceFields = (candidate: SitemapCandidate) => ({
  tmdbId: candidate.tmdbId ?? null,
  tmdbMediaType: candidate.tmdbMediaType ?? null,
  tmdbMetadata: candidate.tmdbMetadata ?? null,
  tmdbEnrichmentStatus: candidate.tmdbEnrichmentStatus ?? "pending",
  tmdbEnrichedAt: candidate.tmdbEnrichedAt ?? null,
});

const getValidExternalImageUrl = (value: string | null, baseUrl: URL) => {
  if (!value) return null;
  try {
    return parseExternalUrl(new URL(value, baseUrl).toString()).toString();
  } catch {
    return null;
  }
};

const parsePostPage = async (
  url: URL,
  resolveTitle: (parsedTitle: ParsedScrapedTitle) => Promise<ResolvedTitle>,
  apiKey: string | null,
) => {
  const html = await fetchSourceText(url);
  const sourceTitle = cleanText(
    getMetaContent(html, "og:title") ??
      getMetaContent(html, "twitter:title") ??
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      "",
  );
  const image =
    getMetaContent(html, "og:image") ??
    getMetaContent(html, "twitter:image") ??
    html.match(
      /<img\b[^>]*(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/i,
    )?.[1] ??
    null;
  const remoteSourceImageUrls = await validatePublicSourceImageUrls(
    extractSourceImageUrls(html, url),
  );
  const sourceImageUrls = await persistRemoteImageList(remoteSourceImageUrls);
  const remoteThumbnailUrl = getValidExternalImageUrl(image, url);
  const thumbnailUrl =
    (remoteThumbnailUrl
      ? await persistRemoteImage(remoteThumbnailUrl, 720)
      : null) ??
    sourceImageUrls[0] ??
    "";
  const lastPathSegment =
    url.pathname.split("/").filter(Boolean).pop() ?? "Imported post";
  const fallbackTitle = (() => {
    try {
      return decodeURIComponent(lastPathSegment);
    } catch {
      return lastPathSegment;
    }
  })()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ");
  const parsedTitle = parseScrapedTitle(
    sourceTitle || cleanText(fallbackTitle),
    url,
  );
  return {
    ...(await resolvePostTmdb(parsedTitle, resolveTitle, apiKey)),
    thumbnailUrl,
    sourceImageUrls,
  };
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const getCookie = (req: Request, name: string) => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

const getAdminSession = async (req: Request) => {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const [session] = await db
    .select()
    .from(adminSessionsTable)
    .where(eq(adminSessionsTable.tokenHash, hashToken(token)));
  if (!session || session.expiresAt <= new Date()) return null;
  return session;
};

const requireAdmin = async (req: Request) => {
  return getAdminSession(req);
};

const categoryShape = (
  row: { id: number; name: string; slug: string },
  postCount = 0,
) => ({ ...row, postCount });

const normalizeTmdbMetadata = (metadata: Record<string, unknown>) => {
  const normalized = {
    ...metadata,
    overview: typeof metadata.overview === "string" ? metadata.overview : null,
    language: typeof metadata.language === "string" ? metadata.language : null,
    genres: Array.isArray(metadata.genres) ? metadata.genres : [],
    keywords: Array.isArray(metadata.keywords) ? metadata.keywords : [],
    posterUrl: getPublicMediaUrl(metadata.posterUrl),
    backdropUrl: getPublicMediaUrl(metadata.backdropUrl),
    cast: Array.isArray(metadata.cast)
    ? metadata.cast.map((member) =>
        member && typeof member === "object"
          ? {
              ...(member as Record<string, unknown>),
              profileUrl: getPublicMediaUrl(
                (member as Record<string, unknown>).profileUrl,
              ),
            }
          : member,
      )
      : [],
    related: Array.isArray(metadata.related)
    ? metadata.related.map((item) =>
        item && typeof item === "object"
          ? {
              ...(item as Record<string, unknown>),
              posterUrl: getPublicMediaUrl(
                (item as Record<string, unknown>).posterUrl,
              ),
            }
          : item,
      )
      : [],
  };
  const reviewFacts = normalized as unknown as TmdbCatalogMetadata;
  return {
    ...normalized,
    editorialSummary: buildEditorialSummary(reviewFacts),
    review: buildEditorialReview(reviewFacts),
  };
};

const postShape = (row: {
  id: number;
  title: string;
  titleSource: string;
  sourceTitle: string | null;
  detectedTitle: string | null;
  titleMatchStatus: string;
  titleMatchConfidence: number | null;
  titleMatchType: string | null;
  titleMatchYear: number | null;
  tmdbId: number | null;
  tmdbMediaType: string | null;
  tmdbMetadata: Record<string, unknown> | null;
  tmdbEnrichmentStatus: string;
  slug: string;
  thumbnailUrl: string;
  sourceImageUrls: string[] | null;
  excerpt: string;
  sourceUrl: string | null;
  sourceDomain: string;
  published: boolean;
  publishedAt: Date;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  categoryPostCount: number;
}) => {
  const publicTitle = replaceVisitorTerms(row.title);
  return {
    id: row.id,
    title: publicTitle,
    slug: row.slug,
    thumbnailUrl: getPublicMediaUrl(row.thumbnailUrl) ?? "/editorial-streaming.jpg",
    sourceImageUrls: (row.sourceImageUrls ?? []).flatMap((sourceImageUrl) => {
      const url = getPublicMediaUrl(sourceImageUrl);
      return url ? [url] : [];
    }),
    excerpt: cleanImportedExcerpt(row.excerpt, publicTitle),
    sourceUrl: row.sourceUrl,
    category: categoryShape(
      {
        id: row.categoryId,
        name: row.categoryName,
        slug: row.categorySlug,
      },
      Number(row.categoryPostCount),
    ),
    publishedAt: row.publishedAt,
    ...(row.tmdbMetadata ? { tmdb: normalizeTmdbMetadata(row.tmdbMetadata) } : {}),
  };
};

const adminPostShape = (
  row: Parameters<typeof postShape>[0] & {
    sourceDomain: string;
    published: boolean;
  },
) => ({
  ...postShape(row),
  status: row.published ? "published" : "draft",
  sourceDomain: row.sourceDomain,
  titleSource: row.titleSource,
  sourceTitle: row.sourceTitle,
  detectedTitle: row.detectedTitle,
  titleMatchStatus: row.titleMatchStatus,
  titleMatchConfidence: row.titleMatchConfidence,
  titleMatchType: row.titleMatchType,
  titleMatchYear: row.titleMatchYear,
  tmdbId: row.tmdbId,
  tmdbMediaType: row.tmdbMediaType,
  tmdbEnrichmentStatus: row.tmdbEnrichmentStatus,
});

const postSelection = {
  id: postsTable.id,
  title: postsTable.title,
  titleSource: postsTable.titleSource,
  sourceTitle: postsTable.sourceTitle,
  detectedTitle: postsTable.detectedTitle,
  titleMatchStatus: postsTable.titleMatchStatus,
  titleMatchConfidence: postsTable.titleMatchConfidence,
  titleMatchType: postsTable.titleMatchType,
  titleMatchYear: postsTable.titleMatchYear,
  tmdbId: postsTable.tmdbId,
  tmdbMediaType: postsTable.tmdbMediaType,
  tmdbMetadata: postsTable.tmdbMetadata,
  tmdbEnrichmentStatus: postsTable.tmdbEnrichmentStatus,
  slug: postsTable.slug,
  thumbnailUrl: postsTable.thumbnailUrl,
  sourceImageUrls: postsTable.sourceImageUrls,
  sourceImagesRefreshedAt: postsTable.sourceImagesRefreshedAt,
  excerpt: postsTable.excerpt,
  sourceUrl: postsTable.sourceUrl,
  sourceDomain: postsTable.sourceDomain,
  published: postsTable.published,
  publishedAt: postsTable.publishedAt,
  categoryId: categoriesTable.id,
  categoryName: categoriesTable.name,
  categorySlug: categoriesTable.slug,
  categoryPostCount: sql<number>`count(*) over (partition by ${categoriesTable.id})`,
};

router.get("/posts", async (req, res): Promise<void> => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const page = Math.max(1, Number(parsed.data.page ?? 1));
  const limit = Math.min(50, Math.max(1, Number(parsed.data.limit ?? 50)));
  const filters = [eq(postsTable.published, true)];
  if (parsed.data.category) {
    filters.push(eq(categoriesTable.slug, parsed.data.category));
  }
  if (parsed.data.search) {
    filters.push(
      or(
        ilike(postsTable.title, `%${parsed.data.search}%`),
        ilike(postsTable.excerpt, `%${parsed.data.search}%`),
      )!,
    );
  }

  const where = and(...filters);
  const [totalRow] = await db
    .select({ total: count() })
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(where);
  const rows = await db
    .select(postSelection)
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(where)
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const total = Number(totalRow?.total ?? 0);
  res.json(
    ListPostsResponse.parse({
      items: rows.map(postShape),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }),
  );
});

router.get("/posts/:slug", async (req, res): Promise<void> => {
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select(postSelection)
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(
      and(
        eq(postsTable.slug, params.data.slug),
        eq(postsTable.published, true),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(GetPostResponse.parse(postShape(row)));
});

router.get("/media/:assetId", async (req, res): Promise<void> => {
  if (!isMediaAssetId(req.params.assetId)) {
    res.status(400).json({ error: "Invalid media asset request" });
    return;
  }
  try {
    const asset = await openMediaAsset(req.params.assetId);
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": asset.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    if (asset.contentLength) res.set("Content-Length", asset.contentLength);
    asset.file.createReadStream()
      .on("error", (error) => {
        req.log.error({ err: error, assetId: req.params.assetId }, "Media asset stream failed");
        if (!res.headersSent) res.status(500).json({ error: "Media asset is unavailable" });
        else res.destroy(error);
      })
      .pipe(res);
  } catch (error) {
    if (error instanceof MediaAssetNotFoundError) {
      res.status(404).json({ error: "Media asset not found" });
      return;
    }
    req.log.error({ err: error, assetId: req.params.assetId }, "Media asset lookup failed");
    res.status(500).json({ error: "Media asset is unavailable" });
  }
});

router.get("/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      postCount: count(postsTable.id),
    })
    .from(categoriesTable)
    .leftJoin(
      postsTable,
      and(
        eq(postsTable.categoryId, categoriesTable.id),
        eq(postsTable.published, true),
      ),
    )
    .groupBy(categoriesTable.id)
    .orderBy(categoriesTable.name);
  res.json(
    ListCategoriesResponse.parse(
      rows.map((row) => ({ ...row, postCount: Number(row.postCount) })),
    ),
  );
});

router.get("/settings/public", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable).limit(1);
  res.json(
    GetPublicSettingsResponse.parse({
      siteName: settings?.siteName ?? "HDHUB4U",
      siteDescription:
        settings?.siteDescription ??
        "Latest entertainment updates and curated editorial posts.",
      analyticsId: settings?.analyticsId ?? null,
      ...getPublicAdSettings(settings),
    }),
  );
});

router.get("/admin/session", async (req, res): Promise<void> => {
  const session = await getAdminSession(req);
  res.json(
    GetAdminSessionResponse.parse({
      authenticated: Boolean(session),
      email: session?.email ?? null,
    }),
  );
});

router.post("/admin/login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const expectedEmail =
    process.env.ADMIN_EMAIL ??
    (process.env.NODE_ENV === "development" ? "admin@hdhub4u.tech" : undefined);
  const expectedPassword =
    process.env.ADMIN_PASSWORD ??
    (process.env.NODE_ENV === "development" ? "hdhub4u-demo" : undefined);
  if (!expectedEmail || !expectedPassword) {
    res.status(503).json({ error: "Admin credentials are not configured" });
    return;
  }
  const provided = Buffer.from(parsed.data.password);
  const expected = Buffer.from(expectedPassword);
  const passwordMatches =
    provided.length === expected.length && timingSafeEqual(provided, expected);
  if (
    parsed.data.email.toLowerCase() !== expectedEmail.toLowerCase() ||
    !passwordMatches
  ) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = randomBytes(32).toString("base64url");
  await db.insert(adminSessionsTable).values({
    tokenHash: hashToken(token),
    email: expectedEmail,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
  res.json(
    AdminLoginResponse.parse({ authenticated: true, email: expectedEmail }),
  );
});

router.post("/admin/logout", async (req, res): Promise<void> => {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) {
    await db
      .delete(adminSessionsTable)
      .where(eq(adminSessionsTable.tokenHash, hashToken(token)));
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json(AdminLogoutResponse.parse({ success: true }));
});

router.get("/admin/summary", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [published] = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.published, true));
  const [drafts] = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.published, false));
  const [categories] = await db
    .select({ count: count() })
    .from(categoriesTable);
  const [lastImport] = await db
    .select({ createdAt: max(importRunsTable.createdAt) })
    .from(importRunsTable);
  res.json(
    GetAdminSummaryResponse.parse({
      publishedPosts: Number(published?.count ?? 0),
      draftPosts: Number(drafts?.count ?? 0),
      categories: Number(categories?.count ?? 0),
      lastImportAt: lastImport?.createdAt ?? null,
    }),
  );
});

router.get("/admin/posts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = ListAdminPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [];
  if (parsed.data.status && parsed.data.status !== "all") {
    filters.push(eq(postsTable.published, parsed.data.status === "published"));
  }
  if (parsed.data.search) {
    filters.push(ilike(postsTable.title, `%${parsed.data.search}%`));
  }
  const rows = await db
    .select(postSelection)
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(postsTable.createdAt));
  res.json(
    ListAdminPostsResponse.parse(
      rows.map((row) => ({
        ...adminPostShape(row),
      })),
    ),
  );
});

router.delete("/admin/posts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const deletedRows = await db
    .delete(postsTable)
    .returning({ id: postsTable.id });

  res.json(
    DeleteAllAdminPostsResponse.parse({
      success: true,
      deletedCount: deletedRows.length,
    }),
  );
});

router.patch("/admin/posts/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateAdminPostParams.safeParse(req.params);
  const body = UpdateAdminPostBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res
      .status(400)
      .json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const update: {
    title?: string;
    titleSource?: string;
    published?: boolean;
    categoryId?: number;
  } = {};
  if (body.data.title !== undefined) {
    update.title = body.data.title;
    update.titleSource = "manual";
  }
  if (body.data.status !== undefined) {
    update.published = body.data.status === "published";
  }
  if (body.data.categoryId != null) {
    update.categoryId = body.data.categoryId;
  }
  await db
    .update(postsTable)
    .set(update)
    .where(eq(postsTable.id, Number(params.data.id)));
  const [row] = await db
    .select(postSelection)
    .from(postsTable)
    .innerJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(eq(postsTable.id, Number(params.data.id)));
  if (!row) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(
    UpdateAdminPostResponse.parse({
      ...adminPostShape(row),
    }),
  );
});

router.post("/admin/tmdb/enrich", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = EnrichAdminTmdbPostsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const apiKey = await getConfiguredTmdbApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "TMDB API key is not configured" });
    return;
  }

  const limit = Math.min(25, Math.max(1, Math.floor(parsed.data.limit ?? 10)));
  const candidates = await db
    .select({
      id: postsTable.id,
      title: postsTable.title,
      titleSource: postsTable.titleSource,
      sourceTitle: postsTable.sourceTitle,
      sourceUrl: postsTable.sourceUrl,
      titleMatchStatus: postsTable.titleMatchStatus,
    })
    .from(postsTable)
    .where(
      parsed.data.includeReviewed
        ? or(
            eq(postsTable.tmdbEnrichmentStatus, "pending"),
            eq(postsTable.tmdbEnrichmentStatus, "failed"),
            eq(postsTable.tmdbEnrichmentStatus, "unavailable"),
            eq(postsTable.tmdbEnrichmentStatus, "review"),
          )
        : or(
            eq(postsTable.tmdbEnrichmentStatus, "pending"),
            eq(postsTable.tmdbEnrichmentStatus, "failed"),
            eq(postsTable.tmdbEnrichmentStatus, "unavailable"),
          ),
    )
    .orderBy(
      sql`case when ${postsTable.tmdbEnrichmentStatus} = 'pending' then 0 else 1 end`,
      desc(postsTable.publishedAt),
    )
    .limit(limit);
  const resolveTitle = createTmdbTitleResolver(apiKey, limit);
  const results = {
    attempted: 0,
    enriched: 0,
    review: 0,
    unmatched: 0,
    unavailable: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    results.attempted += 1;
    try {
      const fields = await resolvePostTmdb(
        parseScrapedTitle(
          candidate.sourceTitle ?? candidate.title,
          candidate.sourceUrl ?? undefined,
        ),
        resolveTitle,
        apiKey,
      );
      const { title, ...matchFields } = fields;
      const tmdbCategory =
        fields.tmdbEnrichmentStatus === "ready"
          ? await getCategoryForTmdbCandidate(fields)
          : null;
      const attemptedAt =
        fields.tmdbEnrichmentStatus === "ready" ? fields.tmdbEnrichedAt : new Date();
      await db
        .update(postsTable)
        .set({
          ...matchFields,
          tmdbEnrichedAt: attemptedAt,
          ...(tmdbCategory ? { categoryId: tmdbCategory.id } : {}),
          ...(candidate.titleSource === "auto" ? { title } : {}),
        })
        .where(eq(postsTable.id, candidate.id));

      if (fields.tmdbEnrichmentStatus === "ready") results.enriched += 1;
      else if (fields.tmdbEnrichmentStatus === "review") results.review += 1;
      else if (fields.tmdbEnrichmentStatus === "unmatched") results.unmatched += 1;
      else if (fields.tmdbEnrichmentStatus === "unavailable") {
        results.unavailable += 1;
      } else {
        results.failed += 1;
      }
    } catch (error) {
      req.log.warn(
        { err: error, postId: candidate.id },
        "TMDB enrichment failed for post",
      );
      await db
        .update(postsTable)
        .set({ tmdbEnrichmentStatus: "failed", tmdbEnrichedAt: new Date() })
        .where(eq(postsTable.id, candidate.id));
      results.failed += 1;
    }
  }

  res.json(EnrichAdminTmdbPostsResponse.parse(results));
});

router.post(
  "/admin/posts/source-images/refresh",
  async (req, res): Promise<void> => {
    if (!(await requireAdmin(req))) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = RefreshAdminPostSourceImagesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const limit = Math.min(25, Math.max(1, Math.floor(parsed.data.limit ?? 10)));
    const candidates = await db
      .select({
        id: postsTable.id,
        sourceUrl: postsTable.sourceUrl,
      })
      .from(postsTable)
      .where(sql`${postsTable.sourceUrl} IS NOT NULL`)
      .orderBy(
        sql`case when ${postsTable.sourceImagesRefreshedAt} is null then 0 else 1 end`,
        asc(postsTable.sourceImagesRefreshedAt),
        desc(postsTable.publishedAt),
      )
      .limit(limit);
    const results = { attempted: 0, refreshed: 0, failed: 0 };

    for (const candidate of candidates) {
      if (!candidate.sourceUrl) continue;
      results.attempted += 1;
      const refreshedAt = new Date();
      try {
        const sourceUrl = parseExternalUrl(candidate.sourceUrl);
        const html = await fetchSourceText(sourceUrl);
        const remoteImageUrls = await validatePublicSourceImageUrls(
          extractSourceImageUrls(html, sourceUrl),
        );
        await db
          .update(postsTable)
          .set({
            sourceImageUrls: await persistRemoteImageList(remoteImageUrls),
            sourceImagesRefreshedAt: refreshedAt,
          })
          .where(eq(postsTable.id, candidate.id));
        results.refreshed += 1;
      } catch (error) {
        req.log.warn(
          { err: error, postId: candidate.id },
          "Source image refresh failed for post",
        );
        // Record the attempt so one unavailable source cannot block the rest
        // of the backfill queue indefinitely.
        await db
          .update(postsTable)
          .set({ sourceImagesRefreshedAt: refreshedAt })
          .where(eq(postsTable.id, candidate.id));
        results.failed += 1;
      }
    }

    res.json(RefreshAdminPostSourceImagesResponse.parse(results));
  },
);

router.post(
  "/admin/posts/media/backfill",
  async (req, res): Promise<void> => {
    if (!(await requireAdmin(req))) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = BackfillAdminPostMediaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const limit = Math.min(10, Math.max(1, Math.floor(parsed.data.limit ?? 5)));
    const candidates = await db
      .select({
        id: postsTable.id,
        thumbnailUrl: postsTable.thumbnailUrl,
        sourceImageUrls: postsTable.sourceImageUrls,
        tmdbMetadata: postsTable.tmdbMetadata,
      })
      .from(postsTable)
      .where(sql`(
        ${postsTable.thumbnailUrl} ~* '^https?://' OR
        coalesce(${postsTable.sourceImageUrls}::text, '') ~* 'https?://' OR
        (${postsTable.tmdbMetadata}->>'posterUrl') ~* '^https?://' OR
        (${postsTable.tmdbMetadata}->>'backdropUrl') ~* '^https?://' OR
        jsonb_path_exists(${postsTable.tmdbMetadata}, '$.cast[*].profileUrl ? (@ like_regex "^https?://")') OR
        jsonb_path_exists(${postsTable.tmdbMetadata}, '$.related[*].posterUrl ? (@ like_regex "^https?://")')
      )`)
      .orderBy(asc(postsTable.updatedAt), desc(postsTable.publishedAt))
      .limit(limit);
    const results = { attempted: 0, migrated: 0, remaining: 0 };

    for (const candidate of candidates) {
      results.attempted += 1;
      const sourceImages = Array.isArray(candidate.sourceImageUrls)
        ? candidate.sourceImageUrls
        : [];
      const sourceImageUrls = await Promise.all(
        sourceImages.map((value) => backfillImageReference(value, 1600)),
      );
      const tmdbMetadata =
        candidate.tmdbMetadata && typeof candidate.tmdbMetadata === "object"
          ? await backfillTmdbMedia(candidate.tmdbMetadata as Record<string, unknown>)
          : candidate.tmdbMetadata;
      const thumbnailUrl = await backfillImageReference(candidate.thumbnailUrl, 720);
      const stillRemote =
        isRemoteImageUrl(thumbnailUrl) ||
        sourceImageUrls.some(isRemoteImageUrl) ||
        hasRemoteTmdbMedia(tmdbMetadata);

      await db
        .update(postsTable)
        .set({
          thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : "",
          sourceImageUrls: sourceImageUrls.filter(
            (value): value is string => typeof value === "string",
          ),
          tmdbMetadata:
            tmdbMetadata && typeof tmdbMetadata === "object"
              ? (tmdbMetadata as Record<string, unknown>)
              : null,
        })
        .where(eq(postsTable.id, candidate.id));
      if (stillRemote) results.remaining += 1;
      else results.migrated += 1;
    }

    res.json(BackfillAdminPostMediaResponse.parse(results));
  },
);

router.post("/admin/sitemaps/discover", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = DiscoverSitemapsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let sourceUrl: URL;
  try {
    sourceUrl = parseExternalUrl(parsed.data.url);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "Please enter a valid URL",
    });
    return;
  }

  try {
    const discovered = await getPostSitemapEntries(sourceUrl);
    res.json(
      DiscoverSitemapsResponse.parse({
        sourceUrl: sourceUrl.toString(),
        sitemapUrl: discovered.rootUrl,
        sitemaps: discovered.entries,
      }),
    );
  } catch (error) {
    req.log.warn(
      { err: error, hostname: sourceUrl.hostname },
      "Sitemap discovery failed",
    );
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Could not discover source sitemaps",
    });
  }
});

router.post("/admin/sitemaps/scrape", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = ScrapeSitemapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let sitemapUrl: URL;
  try {
    sitemapUrl = parseExternalUrl(parsed.data.sitemapUrl);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Please enter a valid sitemap URL",
    });
    return;
  }
  if (
    !isValidSitemapId(sitemapUrl.toString(), parsed.data.sitemapId) ||
    !/\.xml$/i.test(sitemapUrl.pathname)
  ) {
    res
      .status(400)
      .json({ error: "This sitemap was not discovered by the server" });
    return;
  }
  const offset = Math.max(0, Math.floor(parsed.data.offset));

  try {
    const tmdbApiKey = await getConfiguredTmdbApiKey();
    const resolveTitle = createTmdbTitleResolver(tmdbApiKey);
    const sitemapXml = await fetchSourceText(sitemapUrl);
    const sitemapEntries = getUniqueSitemapEntries(
      sitemapXml,
      sitemapUrl,
      cleanText,
    );
    const batchEntries = sitemapEntries.slice(
      offset,
      offset + SITEMAP_BATCH_SIZE,
    );
    const candidates: SitemapCandidate[] = [];
    let failed = 0;

    for (
      let index = 0;
      index < batchEntries.length;
      index += PAGE_FETCH_CONCURRENCY
    ) {
      const batch = batchEntries.slice(
        index,
        index + PAGE_FETCH_CONCURRENCY,
      );
      const results = await Promise.all(
        batch.map(async (entry) => {
          try {
            const parsedPostUrl = parseExternalUrl(entry.url);
            return {
              url: entry.url,
              publishedAt: entry.lastmod,
               ...(await parsePostPage(
                 parsedPostUrl,
                 resolveTitle,
                 tmdbApiKey,
               )),
            };
          } catch (error) {
            req.log.warn(
              { err: error, postUrl: entry.url },
              "Sitemap post fetch failed",
            );
            return null;
          }
        }),
      );
      for (const result of results) {
        if (result) candidates.push(result);
        else failed += 1;
      }
    }

    const defaultCategory = await getOrCreateDefaultCategory();
    if (!defaultCategory) {
      res.status(500).json({ error: "Default category is missing" });
      return;
    }

    const { imported, skipped } = await persistSitemapCandidates(candidates, {
      offset,
      insert: async (candidate, sourcePublishedAt, candidateIndex) => {
        if (
          containsBlockedImportTerms(
            candidate.sourceTitle ?? candidate.title,
            candidate.url,
            candidate.thumbnailUrl,
          )
        ) {
          return false;
        }
        const insertCategory = (await getCategoryForTmdbCandidate(
          candidate,
          defaultCategory,
        )) ?? defaultCategory;
        const [created] = await db
          .insert(postsTable)
          .values({
            title: candidate.title,
            titleSource: "auto",
            sourceTitle: candidate.sourceTitle ?? null,
            detectedTitle: candidate.detectedTitle ?? null,
            titleMatchStatus: candidate.titleMatchStatus ?? "unmatched",
            titleMatchConfidence: candidate.titleMatchConfidence ?? null,
            titleMatchType:
              candidate.titleMatchType === "unknown"
                ? null
                : candidate.titleMatchType ?? null,
            titleMatchYear: candidate.titleMatchYear ?? null,
            ...getTmdbPersistenceFields(candidate),
            slug: `${slugify(candidate.title)}-${Date.now().toString(36)}-${offset + candidateIndex}`,
            thumbnailUrl: candidate.thumbnailUrl,
            sourceImageUrls: candidate.sourceImageUrls ?? [],
            excerpt: buildImportedExcerpt(candidate.title),
            sourceUrl: candidate.url,
            sourceDomain: sitemapUrl.hostname,
            categoryId: insertCategory.id,
            published: true,
            publishedAt: sourcePublishedAt,
          })
          .onConflictDoNothing({ target: postsTable.sourceUrl })
          .returning({ id: postsTable.id });
        if (created) return true;
        const [existing] = await db
          .select({
            titleSource: postsTable.titleSource,
            sourceTitle: postsTable.sourceTitle,
            tmdbEnrichmentStatus: postsTable.tmdbEnrichmentStatus,
          })
          .from(postsTable)
          .where(eq(postsTable.sourceUrl, candidate.url));
        const duplicateUpdate: {
          publishedAt?: Date;
          title?: string;
          sourceTitle?: string | null;
          detectedTitle?: string | null;
          titleMatchStatus?: string;
          titleMatchConfidence?: number | null;
          titleMatchType?: string | null;
          titleMatchYear?: number | null;
          tmdbId?: number | null;
          tmdbMediaType?: string | null;
          tmdbMetadata?: Record<string, unknown> | null;
          tmdbEnrichmentStatus?: string;
          tmdbEnrichedAt?: Date | null;
          sourceImageUrls?: string[];
          categoryId?: number;
        } = {};
        if (candidate.publishedAt) {
          duplicateUpdate.publishedAt = sourcePublishedAt;
        }
        if (existing?.titleSource === "auto") {
          Object.assign(
            duplicateUpdate,
            getImportedTitleUpdate(existing.titleSource, candidate.title),
          );
        }
        Object.assign(
          duplicateUpdate,
          getCandidateResolutionUpdate(
            candidate,
            existing?.tmdbEnrichmentStatus,
          ),
        );
        if (!existing?.sourceTitle && candidate.sourceTitle) {
          duplicateUpdate.sourceTitle = candidate.sourceTitle;
        }
        if (candidate.sourceImageUrls?.length) {
          duplicateUpdate.sourceImageUrls = candidate.sourceImageUrls;
        }
        const tmdbCategory = await getCategoryForTmdbCandidate(candidate);
        if (tmdbCategory) duplicateUpdate.categoryId = tmdbCategory.id;
        if (Object.keys(duplicateUpdate).length > 0) {
          await db
            .update(postsTable)
            .set(duplicateUpdate)
            .where(eq(postsTable.sourceUrl, candidate.url));
        }
        return false;
      },
    });

    await db
      .insert(importRunsTable)
      .values({ sourceUrl: sitemapUrl.toString(), imported, skipped });

    const processed = batchEntries.length;
    const nextOffset = getNextSitemapOffset(
      offset,
      processed,
      sitemapEntries.length,
    );
    res.json(
      ScrapeSitemapResponse.parse({
        sitemapUrl: sitemapUrl.toString(),
        offset,
        processed,
        total: sitemapEntries.length,
        imported,
        skipped,
        failed,
        nextOffset,
      }),
    );
  } catch (error) {
    req.log.warn(
      { err: error, sitemapUrl: sitemapUrl.toString() },
      "Sitemap scrape failed",
    );
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "Could not scrape sitemap",
    });
  }
});

router.post("/admin/import", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = ImportPostsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let source: URL;
  try {
    source = parseExternalUrl(parsed.data.url);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "Please enter a valid URL",
    });
    return;
  }
  const hostname = source.hostname.toLowerCase();
  let html: string;
  try {
    html = await fetchSourceText(source);
  } catch (error) {
    req.log.warn({ err: error, hostname }, "Authorized import fetch failed");
    res.status(400).json({ error: "Could not fetch the source URL" });
    return;
  }

  const defaultCategory = await getOrCreateDefaultCategory();
  if (!defaultCategory) {
    res.status(500).json({ error: "Default category is missing" });
    return;
  }

  const articleBlocks = html.match(/<article\b[\s\S]*?<\/article>/gi) ?? [];
  const thumbBlocks =
    html.match(
      /<li\b[^>]*class=["'][^"']*\bthumb\b[^"']*["'][\s\S]*?<\/li>/gi,
    ) ?? [];
  const postDivBlocks =
    html.match(
      /<div\b[^>]*class=["'][^"']*\bpost\b[^"']*["'][\s\S]*?<\/div>/gi,
    ) ?? [];
  const blocks = (
    articleBlocks.length > 0
      ? articleBlocks
      : thumbBlocks.length > 0
        ? thumbBlocks
        : postDivBlocks
  ).slice(0, 80);
  const parsedCandidates = blocks
    .map((block) => {
      const linkMatches = [
        ...block.matchAll(
          /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        ),
      ];
      const headingMatch = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
      const paragraphMatch = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
      const imageMatch = block.match(
        /<img\b[^>]*(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/i,
      );
      const titledLink = linkMatches.find((match) =>
        /<(?:h[1-4]|p)\b/i.test(match[2]),
      );
      const link = titledLink ?? linkMatches[0];
      const title = cleanText(
        headingMatch?.[1] ?? paragraphMatch?.[1] ?? titledLink?.[2] ?? "",
      );
      if (!link?.[1] || title.length < 4) return null;
      try {
        const candidateUrl = new URL(link[1], source).toString();
        const parsedTitle = parseScrapedTitle(title, candidateUrl);
        return {
          parsedTitle,
          url: candidateUrl,
          thumbnailUrl: imageMatch?.[1]
            ? new URL(imageMatch[1], source).toString()
            : "/editorial-streaming.jpg",
        };
      } catch {
        return null;
      }
    })
    .filter(
      (
        candidate,
      ): candidate is {
        parsedTitle: ParsedScrapedTitle;
        url: string;
        thumbnailUrl: string;
      } =>
        Boolean(candidate),
    );
  const tmdbApiKey = await getConfiguredTmdbApiKey();
  const resolveTitle = createTmdbTitleResolver(tmdbApiKey);
  const candidates: SitemapCandidate[] = [];
  for (
    let index = 0;
    index < parsedCandidates.length;
    index += PAGE_FETCH_CONCURRENCY
  ) {
    const resolvedBatch = await Promise.all(
      parsedCandidates
        .slice(index, index + PAGE_FETCH_CONCURRENCY)
        .map(async (candidate) => {
          try {
            return {
              url: candidate.url,
              ...(await parsePostPage(
                parseExternalUrl(candidate.url),
                resolveTitle,
                tmdbApiKey,
              )),
            };
          } catch (error) {
            req.log.warn(
              { err: error, postUrl: candidate.url },
              "Direct import post fetch failed",
            );
            return {
              url: candidate.url,
              thumbnailUrl:
                (await persistRemoteImage(
                  getValidExternalImageUrl(candidate.thumbnailUrl, source) ?? "",
                  720,
                )) ?? "",
              sourceImageUrls: [],
              ...(await resolvePostTmdb(
                candidate.parsedTitle,
                resolveTitle,
                tmdbApiKey,
              )),
            };
          }
        }),
    );
    candidates.push(...resolvedBatch);
  }

  let imported = 0;
  let skipped = 0;
  const importedRows = [];
  const importTimestamp = Date.now();
  for (const [candidateIndex, candidate] of candidates.entries()) {
    if (
      containsBlockedImportTerms(
        candidate.sourceTitle ?? candidate.title,
        candidate.url,
        candidate.thumbnailUrl,
      )
    ) {
      skipped += 1;
      continue;
    }
    // The source listing is newest-first. Preserve that order in our catalog
    // even when all items are imported during the same request.
    const sourcePublishedAt = new Date(importTimestamp - candidateIndex * 1000);
    const [existing] = await db
      .select({
        id: postsTable.id,
        titleSource: postsTable.titleSource,
        sourceTitle: postsTable.sourceTitle,
          tmdbEnrichmentStatus: postsTable.tmdbEnrichmentStatus,
      })
      .from(postsTable)
      .where(eq(postsTable.sourceUrl, candidate.url));
    if (existing) {
      const category = await getCategoryForTmdbCandidate(candidate);
      await db
        .update(postsTable)
        .set({
          publishedAt: sourcePublishedAt,
          ...getImportedTitleUpdate(existing.titleSource, candidate.title),
          ...getCandidateResolutionUpdate(
            candidate,
            existing.tmdbEnrichmentStatus,
          ),
          ...(candidate.sourceImageUrls?.length
            ? { sourceImageUrls: candidate.sourceImageUrls }
            : {}),
          ...(!existing.sourceTitle && candidate.sourceTitle
            ? { sourceTitle: candidate.sourceTitle }
            : {}),
          ...(category ? { categoryId: category.id } : {}),
        })
        .where(eq(postsTable.id, existing.id));
      skipped += 1;
      continue;
    }
    const insertCategory = (await getCategoryForTmdbCandidate(
      candidate,
      defaultCategory,
    )) ?? defaultCategory;
    const uniqueSlug = `${slugify(candidate.title)}-${Date.now().toString(36)}-${imported}`;
    const [created] = await db
      .insert(postsTable)
      .values({
        title: candidate.title,
        titleSource: "auto",
        sourceTitle: candidate.sourceTitle ?? null,
        detectedTitle: candidate.detectedTitle ?? null,
        titleMatchStatus: candidate.titleMatchStatus ?? "unmatched",
        titleMatchConfidence: candidate.titleMatchConfidence ?? null,
        titleMatchType:
          candidate.titleMatchType === "unknown"
            ? null
            : candidate.titleMatchType ?? null,
        titleMatchYear: candidate.titleMatchYear ?? null,
        ...getTmdbPersistenceFields(candidate),
        slug: uniqueSlug,
        thumbnailUrl: candidate.thumbnailUrl,
        sourceImageUrls: candidate.sourceImageUrls ?? [],
        excerpt: buildImportedExcerpt(candidate.title),
        sourceUrl: candidate.url,
        sourceDomain: hostname,
        categoryId: insertCategory.id,
        published: true,
        publishedAt: sourcePublishedAt,
      })
      .returning();
    if (created) {
      imported += 1;
      const [row] = await db
        .select(postSelection)
        .from(postsTable)
        .innerJoin(
          categoriesTable,
          eq(postsTable.categoryId, categoriesTable.id),
        )
        .where(eq(postsTable.id, created.id));
      if (row) {
        importedRows.push(adminPostShape(row));
      }
    }
  }
  await db
    .insert(importRunsTable)
    .values({ sourceUrl: source.toString(), imported, skipped });
  res.json(
    ImportPostsResponse.parse({
      sourceUrl: source.toString(),
      imported,
      skipped,
      items: importedRows,
    }),
  );
});

router.get("/admin/settings", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [settings] = await db.select().from(settingsTable).limit(1);
  res.json(
    GetAdminSettingsResponse.parse({
      siteName: settings?.siteName ?? "HDHUB4U",
      siteDescription: settings?.siteDescription ?? "",
      analyticsId: settings?.analyticsId ?? null,
      contactEmail: settings?.contactEmail ?? "contact@hdhub4u.tech",
      ...getAdminAdSettings(settings),
    }),
  );
});

router.patch("/admin/settings", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [settings] = await db
    .insert(settingsTable)
    .values({ id: 1, ...parsed.data })
    .onConflictDoUpdate({ target: settingsTable.id, set: parsed.data })
    .returning();
  res.json(UpdateAdminSettingsResponse.parse(settings));
});

router.get("/admin/tmdb-key", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [settings] = await db
    .select({ tmdbApiKeyEncrypted: settingsTable.tmdbApiKeyEncrypted })
    .from(settingsTable)
    .limit(1);
  const apiKey = settings?.tmdbApiKeyEncrypted
    ? decryptTmdbApiKey(settings.tmdbApiKeyEncrypted)
    : null;

  res.json(
    GetAdminTmdbApiKeyResponse.parse({
      configured: Boolean(apiKey),
      maskedKey: apiKey ? maskTmdbApiKey(apiKey) : null,
    }),
  );
});

router.put("/admin/tmdb-key", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = SaveAdminTmdbApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const apiKey = parsed.data.apiKey.trim();
  if (!apiKey) {
    res.status(400).json({ error: "TMDB API key cannot be blank" });
    return;
  }

  const encryptedApiKey = encryptTmdbApiKey(apiKey);
  await db
    .insert(settingsTable)
    .values({
      id: 1,
      tmdbApiKeyEncrypted: encryptedApiKey,
    })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { tmdbApiKeyEncrypted: encryptedApiKey },
    });

  res.json(
    SaveAdminTmdbApiKeyResponse.parse({
      configured: true,
      maskedKey: maskTmdbApiKey(apiKey),
    }),
  );
});

router.delete("/admin/tmdb-key", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  await db
    .insert(settingsTable)
    .values({ id: 1, tmdbApiKeyEncrypted: null })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { tmdbApiKeyEncrypted: null },
    });

  res.json(DeleteAdminTmdbApiKeyResponse.parse({ success: true }));
});

router.get("/admin/sitemap", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [published] = await db
    .select({ count: count(), lastGeneratedAt: max(postsTable.updatedAt) })
    .from(postsTable)
    .where(eq(postsTable.published, true));
  res.json(
    GetAdminSitemapResponse.parse({
      url: "https://hdhub4u.tech/sitemap.xml",
      indexedUrls: Number(published?.count ?? 0) + 6,
      lastGeneratedAt: published?.lastGeneratedAt ?? null,
    }),
  );
});

export default router;
