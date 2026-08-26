import assert from "node:assert/strict";
import test from "node:test";
import {
  DiscoverSitemapsResponse,
  ScrapeSitemapResponse,
} from "@workspace/api-zod";
import {
  getNextSitemapOffset,
  getSitemapId,
  getUniqueSitemapEntries,
  getUniqueSitemapUrls,
  isUnsafeIpAddress,
  isValidSitemapId,
  parseExternalUrl,
  persistSitemapCandidates,
  resolvePublicDestination,
} from "./sitemap-import";

test("rejects private and embedded IPv6 source destinations", () => {
  for (const source of [
    "http://127.0.0.1/sitemap.xml",
    "http://[::1]/sitemap.xml",
    "http://[fc00::1]/sitemap.xml",
    "http://[0:0:0:0:0:ffff:7f00:1]/sitemap.xml",
  ]) {
    assert.throws(() => parseExternalUrl(source), /not allowed/);
  }

  assert.equal(isUnsafeIpAddress("::ffff:10.0.0.1"), true);
  assert.equal(isUnsafeIpAddress("0:0:0:0:0:ffff:c0a8:0101"), true);
  assert.equal(isUnsafeIpAddress("2001:4860:4860::8888"), false);
});

test("rejects private DNS destinations and private redirect targets", async () => {
  await assert.rejects(
    resolvePublicDestination(
      new URL("https://redirect.example/sitemap.xml"),
      async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "192.168.1.20", family: 4 },
      ],
    ),
    /non-public address/,
  );

  assert.throws(
    () =>
      parseExternalUrl(
        new URL(
          "http://[::ffff:127.0.0.1]/private.xml",
          "https://public.example",
        ).toString(),
      ),
    /not allowed/,
  );
});

test("requires a server-issued sitemap signature", () => {
  const url = "https://public.example/wp-sitemap-posts-1.xml";
  const signature = getSitemapId(url, "test-secret");

  assert.equal(isValidSitemapId(url, signature, "test-secret"), true);
  assert.equal(isValidSitemapId(url, "", "test-secret"), false);
  assert.equal(
    isValidSitemapId(url, `${signature}tampered`, "test-secret"),
    false,
  );
  assert.equal(
    isValidSitemapId(`${url}?changed=1`, signature, "test-secret"),
    false,
  );
});

test("deduplicates repeated sitemap locations after URL resolution", () => {
  const urls = getUniqueSitemapUrls(
    [
      "<urlset>",
      "<url><loc>/posts/one</loc></url>",
      "<url><loc>https://public.example/posts/one</loc></url>",
      "<url><loc>/posts/two</loc></url>",
      "</urlset>",
    ].join(""),
    new URL("https://public.example/sitemap.xml"),
  );

  assert.deepEqual(urls, [
    "https://public.example/posts/one",
    "https://public.example/posts/two",
  ]);
});

test("preserves each sitemap location with its valid lastmod timestamp", () => {
  const entries = getUniqueSitemapEntries(
    [
      "<urlset>",
      "<url><loc>/posts/new</loc><lastmod>2026-08-26T18:58:56+00:00</lastmod></url>",
      "<url><loc>/posts/old</loc><lastmod>2026-08-25</lastmod></url>",
      "<url><loc>/posts/invalid</loc><lastmod>not-a-date</lastmod></url>",
      "</urlset>",
    ].join(""),
    new URL("https://public.example/sitemap.xml"),
  );

  assert.equal(entries.length, 3);
  assert.equal(entries[0].url, "https://public.example/posts/new");
  assert.equal(
    entries[0].lastmod?.toISOString(),
    "2026-08-26T18:58:56.000Z",
  );
  assert.equal(entries[1].lastmod?.toISOString(), "2026-08-25T00:00:00.000Z");
  assert.equal(entries[2].lastmod, null);
});

test("uses sitemap lastmod for persistence and falls back for missing dates", async () => {
  const publishedDates: Date[] = [];
  const insert = async (
    candidate: { publishedAt?: Date | null },
    publishedAt: Date,
  ) => {
    publishedDates.push(publishedAt);
    if (candidate.publishedAt) {
      assert.equal(
        candidate.publishedAt.toISOString(),
        publishedAt.toISOString(),
      );
    }
    return true;
  };
  const sourceDate = new Date("2026-08-26T18:58:56.000Z");

  await persistSitemapCandidates(
    [
      {
        url: "https://public.example/posts/new",
        title: "New",
        thumbnailUrl: "https://public.example/images/new.jpg",
        publishedAt: sourceDate,
      },
      {
        url: "https://public.example/posts/without-date",
        title: "Without Date",
        thumbnailUrl: "https://public.example/images/without-date.jpg",
        publishedAt: null,
      },
    ],
    { offset: 0, importTimestamp: sourceDate.getTime(), insert },
  );

  assert.equal(publishedDates[0].toISOString(), sourceDate.toISOString());
  assert.equal(
    publishedDates[1].toISOString(),
    "2026-08-26T18:58:55.000Z",
  );
});

test("concurrent batches count one insert for each source URL", async () => {
  const storedUrls = new Set<string>();
  const candidate = {
    url: "https://public.example/posts/one",
    title: "One",
    thumbnailUrl: "https://public.example/images/one.jpg",
  };
  const insert = async (value: typeof candidate) => {
    await Promise.resolve();
    if (storedUrls.has(value.url)) return false;
    storedUrls.add(value.url);
    return true;
  };

  const [first, second] = await Promise.all([
    persistSitemapCandidates([candidate], { offset: 0, insert }),
    persistSitemapCandidates([candidate], { offset: 0, insert }),
  ]);

  assert.deepEqual(first.imported + second.imported, 1);
  assert.deepEqual(first.skipped + second.skipped, 1);
  assert.equal(storedUrls.size, 1);
});

test("keeps discovery and batch progress contracts stable", () => {
  const discovery = DiscoverSitemapsResponse.parse({
    sourceUrl: "https://public.example/",
    sitemapUrl: "https://public.example/sitemap.xml",
    sitemaps: [
      {
        id: "signed-id",
        url: "https://public.example/wp-sitemap-posts-1.xml",
        postCount: 25,
      },
    ],
  });
  const result = ScrapeSitemapResponse.parse({
    sitemapUrl: discovery.sitemaps[0].url,
    offset: 25,
    processed: 25,
    total: 60,
    imported: 24,
    skipped: 0,
    failed: 1,
    nextOffset: 50,
  });

  assert.equal(result.nextOffset, getNextSitemapOffset(25, 25, 60));
  assert.equal(getNextSitemapOffset(50, 10, 60), null);
  assert.deepEqual(Object.keys(result).sort(), [
    "failed",
    "imported",
    "nextOffset",
    "offset",
    "processed",
    "sitemapUrl",
    "skipped",
    "total",
  ]);
});
