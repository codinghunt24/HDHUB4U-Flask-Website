import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { type LookupFunction } from "node:net";
import { Router, type IRouter, type Request } from "express";
import {
  AdminLoginBody,
  AdminLoginResponse,
  AdminLogoutResponse,
  DiscoverSitemapsBody,
  DiscoverSitemapsResponse,
  GetAdminSessionResponse,
  GetAdminSettingsResponse,
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
} from "@workspace/api-zod";
import {
  adminSessionsTable,
  categoriesTable,
  db,
  importRunsTable,
  postsTable,
  settingsTable,
} from "@workspace/db";
import { and, count, desc, eq, ilike, max, or, sql } from "drizzle-orm";
import {
  SITEMAP_BATCH_SIZE,
  extractXmlLocations,
  getNextSitemapOffset,
  getSitemapId,
  getUniqueSitemapUrls,
  isValidSitemapId,
  parseExternalUrl,
  persistSitemapCandidates,
  resolvePublicDestination,
} from "../lib/sitemap-import";

const router: IRouter = Router();
const SESSION_COOKIE = "hdhub4u_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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

const requestSourceText = async (
  url: URL,
  destination: { address: string; family: number },
) =>
  new Promise<{
    statusCode: number;
    location: string | null;
    body: string;
  }>((resolve, reject) => {
    const boundLookup: LookupFunction = (_hostname, options, callback) => {
      if (typeof options === "object" && options.all) {
        callback(null, [destination]);
        return;
      }
      callback(null, destination.address, destination.family);
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": IMPORT_USER_AGENT,
          "accept-encoding": "identity",
        },
        lookup: boundLookup,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_SOURCE_BYTES) {
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
            body: Buffer.concat(chunks).toString("utf8"),
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

const parsePostPage = async (url: URL) => {
  const html = await fetchSourceText(url);
  const title = cleanText(
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
  return {
    title: (title || cleanText(fallbackTitle)).slice(0, 220),
    thumbnailUrl: image
      ? new URL(image, url).toString()
      : "/editorial-streaming.jpg",
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

const postShape = (row: {
  id: number;
  title: string;
  slug: string;
  thumbnailUrl: string;
  excerpt: string;
  sourceUrl: string | null;
  sourceDomain: string;
  published: boolean;
  publishedAt: Date;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  categoryPostCount: number;
}) => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  thumbnailUrl: row.thumbnailUrl,
  excerpt: row.excerpt,
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
});

const postSelection = {
  id: postsTable.id,
  title: postsTable.title,
  slug: postsTable.slug,
  thumbnailUrl: postsTable.thumbnailUrl,
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
        ...postShape(row),
        status: row.published ? "published" : "draft",
        sourceDomain: row.sourceDomain,
      })),
    ),
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
    published?: boolean;
    categoryId?: number;
  } = {};
  if (body.data.title !== undefined) update.title = body.data.title;
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
      ...postShape(row),
      status: row.published ? "published" : "draft",
      sourceDomain: row.sourceDomain,
    }),
  );
});

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
    const sitemapXml = await fetchSourceText(sitemapUrl);
    const postUrls = getUniqueSitemapUrls(sitemapXml, sitemapUrl, cleanText);
    const batchUrls = postUrls.slice(offset, offset + SITEMAP_BATCH_SIZE);
    const candidates: Array<{
      url: string;
      title: string;
      thumbnailUrl: string;
    }> = [];
    let failed = 0;

    for (
      let index = 0;
      index < batchUrls.length;
      index += PAGE_FETCH_CONCURRENCY
    ) {
      const batch = batchUrls.slice(index, index + PAGE_FETCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (postUrl) => {
          try {
            const parsedPostUrl = parseExternalUrl(postUrl);
            return {
              url: postUrl,
              ...(await parsePostPage(parsedPostUrl)),
            };
          } catch (error) {
            req.log.warn({ err: error, postUrl }, "Sitemap post fetch failed");
            return null;
          }
        }),
      );
      for (const result of results) {
        if (result) candidates.push(result);
        else failed += 1;
      }
    }

    const [defaultCategory] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, "latest"));
    if (!defaultCategory) {
      res.status(500).json({ error: "Default category is missing" });
      return;
    }

    const { imported, skipped } = await persistSitemapCandidates(candidates, {
      offset,
      insert: async (candidate, sourcePublishedAt, candidateIndex) => {
        const [created] = await db
          .insert(postsTable)
          .values({
            title: candidate.title,
            slug: `${slugify(candidate.title)}-${Date.now().toString(36)}-${offset + candidateIndex}`,
            thumbnailUrl: candidate.thumbnailUrl,
            excerpt: `Imported listing from ${sitemapUrl.hostname}. Review and edit before republishing.`,
            sourceUrl: candidate.url,
            sourceDomain: sitemapUrl.hostname,
            categoryId: defaultCategory.id,
            published: true,
            publishedAt: sourcePublishedAt,
          })
          .onConflictDoNothing({ target: postsTable.sourceUrl })
          .returning({ id: postsTable.id });
        return Boolean(created);
      },
    });

    await db
      .insert(importRunsTable)
      .values({ sourceUrl: sitemapUrl.toString(), imported, skipped });

    const processed = batchUrls.length;
    const nextOffset = getNextSitemapOffset(offset, processed, postUrls.length);
    res.json(
      ScrapeSitemapResponse.parse({
        sitemapUrl: sitemapUrl.toString(),
        offset,
        processed,
        total: postUrls.length,
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

  const [defaultCategory] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, "latest"));
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
  const candidates = blocks
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
        return {
          title: title.slice(0, 220),
          url: new URL(link[1], source).toString(),
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
      ): candidate is { title: string; url: string; thumbnailUrl: string } =>
        Boolean(candidate),
    );

  let imported = 0;
  let skipped = 0;
  const importedRows = [];
  const importTimestamp = Date.now();
  for (const [candidateIndex, candidate] of candidates.entries()) {
    // The source listing is newest-first. Preserve that order in our catalog
    // even when all items are imported during the same request.
    const sourcePublishedAt = new Date(importTimestamp - candidateIndex * 1000);
    const [existing] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(eq(postsTable.sourceUrl, candidate.url));
    if (existing) {
      await db
        .update(postsTable)
        .set({ publishedAt: sourcePublishedAt })
        .where(eq(postsTable.id, existing.id));
      skipped += 1;
      continue;
    }
    const uniqueSlug = `${slugify(candidate.title)}-${Date.now().toString(36)}-${imported}`;
    const [created] = await db
      .insert(postsTable)
      .values({
        title: candidate.title,
        slug: uniqueSlug,
        thumbnailUrl: candidate.thumbnailUrl,
        excerpt: `Imported listing from ${hostname}. Review and edit before republishing.`,
        sourceUrl: candidate.url,
        sourceDomain: hostname,
        categoryId: defaultCategory.id,
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
        importedRows.push({
          ...postShape(row),
          status: row.published ? "published" : "draft",
          sourceDomain: row.sourceDomain,
        });
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
