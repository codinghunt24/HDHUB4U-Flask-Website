import {
  type SitemapDiscoveryResult,
  type SitemapEntry,
  useDiscoverSitemaps,
  useImportPosts,
  useScrapeSitemap,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCode2,
  Loader2,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const importSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

type ScrapeStatus = "idle" | "scraping" | "complete" | "error";

type ScrapeState = {
  status: ScrapeStatus;
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  error?: string;
};

const initialScrapeState = (total: number): ScrapeState => ({
  status: "idle",
  processed: 0,
  total,
  imported: 0,
  skipped: 0,
  failed: 0,
});

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export default function AdminFetch() {
  const discoverSitemaps = useDiscoverSitemaps();
  const scrapeSitemap = useScrapeSitemap();
  const importPosts = useImportPosts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [discovery, setDiscovery] =
    useState<SitemapDiscoveryResult | null>(null);
  const [scrapeStates, setScrapeStates] = useState<Record<string, ScrapeState>>(
    {},
  );
  const [activeSitemapId, setActiveSitemapId] = useState<string | null>(null);
  const [catalogUrl, setCatalogUrl] = useState("");
  const [catalogResult, setCatalogResult] = useState<{
    sourceUrl: string;
    imported: number;
    skipped: number;
    items: Array<{
      id: number;
      title: string;
      detectedTitle: string | null;
      titleMatchStatus: "matched" | "review" | "unmatched" | "unavailable";
      titleMatchConfidence: number | null;
    }>;
  } | null>(null);

  const form = useForm<z.infer<typeof importSchema>>({
    resolver: zodResolver(importSchema),
    defaultValues: { url: "" },
  });

  const onSubmit = (values: z.infer<typeof importSchema>) => {
    setDiscovery(null);
    setScrapeStates({});
    discoverSitemaps.mutate(
      { data: values },
      {
        onSuccess: (result) => {
          setDiscovery(result);
          setScrapeStates(
            Object.fromEntries(
              result.sitemaps.map((sitemap) => [
                sitemap.id,
                initialScrapeState(sitemap.postCount),
              ]),
            ),
          );
          toast({
            title: "Sitemaps discovered",
            description: `Found ${result.sitemaps.length} post sitemaps with ${result.sitemaps
              .reduce((sum, sitemap) => sum + sitemap.postCount, 0)
              .toLocaleString()} posts.`,
          });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Discovery failed",
            description: getErrorMessage(
              error,
              "Could not discover post sitemaps at this URL.",
            ),
          });
        },
      },
    );
  };

  const updateScrapeState = (
    sitemapId: string,
    update: Partial<ScrapeState>,
  ) => {
    setScrapeStates((current) => ({
      ...current,
      [sitemapId]: {
        ...(current[sitemapId] ?? initialScrapeState(0)),
        ...update,
      },
    }));
  };

  const scrapeAllPosts = async (sitemap: SitemapEntry) => {
    setActiveSitemapId(sitemap.id);
    updateScrapeState(sitemap.id, {
      status: "scraping",
      processed: 0,
      total: sitemap.postCount,
      imported: 0,
      skipped: 0,
      failed: 0,
      error: undefined,
    });

    let offset = 0;
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    try {
      while (true) {
        const result = await scrapeSitemap.mutateAsync({
          data: { sitemapId: sitemap.id, sitemapUrl: sitemap.url, offset },
        });
        imported += result.imported;
        skipped += result.skipped;
        failed += result.failed;
        const processed = Math.min(
          result.total,
          result.nextOffset ?? result.offset + result.processed,
        );
        updateScrapeState(sitemap.id, {
          status: "scraping",
          processed,
          total: result.total,
          imported,
          skipped,
          failed,
        });
        if (result.nextOffset === null) break;
        if (result.nextOffset <= offset) {
          throw new Error("The source did not advance to the next batch.");
        }
        offset = result.nextOffset;
      }

      updateScrapeState(sitemap.id, { status: "complete" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Sitemap import complete",
        description: `Published ${imported.toLocaleString()} new posts and skipped ${skipped.toLocaleString()} duplicates.`,
      });
    } catch (error) {
      const message = getErrorMessage(
        error,
        "The sitemap import stopped before it could finish.",
      );
      updateScrapeState(sitemap.id, { status: "error", error: message });
      toast({
        variant: "destructive",
        title: "Sitemap import failed",
        description: message,
      });
    } finally {
      setActiveSitemapId(null);
    }
  };

  const importCatalogPage = async () => {
    try {
      new URL(catalogUrl);
    } catch {
      toast({
        variant: "destructive",
        title: "Invalid catalog URL",
        description: "Enter a complete public URL before importing.",
      });
      return;
    }
    setCatalogResult(null);
    try {
      const result = await importPosts.mutateAsync({ data: { url: catalogUrl } });
      setCatalogResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Catalog import complete",
        description: `Published ${result.imported} new posts and skipped ${result.skipped} duplicates.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Catalog import failed",
        description: getErrorMessage(
          error,
          "The source catalog page could not be imported.",
        ),
      });
    }
  };

  const totalDiscoveredPosts =
    discovery?.sitemaps.reduce(
      (sum, sitemap) => sum + sitemap.postCount,
      0,
    ) ?? 0;

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-display font-bold text-gray-900">
          Sitemap Importer
        </h1>
        <p className="text-muted-foreground">
          Discover and import posts from authorized source sitemaps.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Source URL</CardTitle>
              <CardDescription>
                Enter a website homepage, sitemap index, or post sitemap URL.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authorized source URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/"
                            {...field}
                            className="h-11"
                          />
                        </FormControl>
                        <FormDescription>
                          Discovery only lists post sitemaps. Nothing is
                          published until you click a sitemap&apos;s Scrap
                          button.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    size="lg"
                    disabled={
                      discoverSitemaps.isPending || activeSitemapId !== null
                    }
                    className="w-full md:w-auto"
                    data-testid="button-discover-sitemaps"
                  >
                    {discoverSitemaps.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-4 w-4" />
                    )}
                    {discoverSitemaps.isPending
                      ? "Discovering..."
                      : "Fetch Sitemaps"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {discovery && (
            <Card className="overflow-hidden rounded-2xl border-0 shadow-sm">
              <CardHeader className="border-b bg-gray-50/70">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileCode2 className="h-5 w-5 text-primary" />
                      Discovered Sitemaps
                    </CardTitle>
                    <CardDescription className="mt-2 break-all">
                      Index: {discovery.sitemapUrl}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="w-fit">
                    {discovery.sitemaps.length} sitemaps ·{" "}
                    {totalDiscoveredPosts.toLocaleString()} posts
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sitemap</TableHead>
                      <TableHead className="w-28 text-right">Posts</TableHead>
                      <TableHead className="w-44">Status</TableHead>
                      <TableHead className="w-36 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discovery.sitemaps.map((sitemap, index) => {
                      const state =
                        scrapeStates[sitemap.id] ??
                        initialScrapeState(sitemap.postCount);
                      const progress =
                        state.total > 0
                          ? Math.round((state.processed / state.total) * 100)
                          : 0;
                      const isActive = activeSitemapId === sitemap.id;
                      return (
                        <TableRow key={sitemap.id}>
                          <TableCell className="min-w-64">
                            <p className="font-medium text-gray-900">
                              Post Sitemap {index + 1}
                            </p>
                            <p className="mt-1 max-w-md break-all text-xs text-muted-foreground">
                              {sitemap.url}
                            </p>
                            {(state.status === "scraping" ||
                              state.status === "complete" ||
                              state.status === "error") && (
                              <div className="mt-3 space-y-1.5">
                                <Progress value={progress} className="h-1.5" />
                                <p className="text-xs text-muted-foreground">
                                  {state.processed.toLocaleString()} /{" "}
                                  {state.total.toLocaleString()} processed ·{" "}
                                  {state.imported.toLocaleString()} new ·{" "}
                                  {state.skipped.toLocaleString()} skipped
                                  {state.failed > 0
                                    ? ` · ${state.failed.toLocaleString()} failed`
                                    : ""}
                                </p>
                                {state.error && (
                                  <p className="text-xs text-destructive">
                                    {state.error}
                                  </p>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {sitemap.postCount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {state.status === "scraping" && (
                              <Badge variant="secondary">
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                Importing {progress}%
                              </Badge>
                            )}
                            {state.status === "complete" && (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                                <CheckCircle2 className="mr-1.5 h-3 w-3" />
                                Complete
                              </Badge>
                            )}
                            {state.status === "error" && (
                              <Badge variant="destructive">Stopped</Badge>
                            )}
                            {state.status === "idle" && (
                              <Badge variant="outline">Ready</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => scrapeAllPosts(sitemap)}
                              disabled={activeSitemapId !== null}
                              data-testid={`button-scrape-sitemap-${index}`}
                            >
                              {isActive ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              {isActive
                                ? "Scraping..."
                                : state.status === "complete"
                                  ? "Scrap Again"
                                  : "Scrap"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {discovery && discovery.sitemaps.length === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No post sitemaps found</AlertTitle>
              <AlertDescription>
                The source sitemap did not contain any post sitemap entries.
              </AlertDescription>
            </Alert>
          )}

          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Quick Catalog Import</CardTitle>
              <CardDescription>
                Import up to 80 posts directly from a supported listing page,
                without using its sitemap.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="url"
                  value={catalogUrl}
                  onChange={(event) => setCatalogUrl(event.target.value)}
                  placeholder="https://example.com/catalog/"
                  className="h-11 flex-1"
                  aria-label="Catalog page URL"
                />
                <Button
                  type="button"
                  size="lg"
                  onClick={importCatalogPage}
                  disabled={importPosts.isPending || !catalogUrl.trim()}
                  data-testid="button-import-catalog"
                >
                  {importPosts.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {importPosts.isPending ? "Importing..." : "Scrap Catalog"}
                </Button>
              </div>
              {catalogResult && (
                <div className="space-y-4">
                  <Alert className="border-emerald-200 bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertTitle className="text-emerald-800">
                      Catalog Import Complete
                    </AlertTitle>
                    <AlertDescription className="text-emerald-700">
                      Processed <strong>{catalogResult.sourceUrl}</strong>.
                      Published {catalogResult.imported} new posts and skipped{" "}
                      {catalogResult.skipped} existing posts.
                    </AlertDescription>
                  </Alert>
                  {catalogResult.items.length > 0 && (
                    <div className="overflow-hidden rounded-xl border">
                      <div className="border-b bg-muted/40 px-4 py-3">
                        <h3 className="text-sm font-semibold">Detected titles</h3>
                        <p className="text-xs text-muted-foreground">
                          Review uncertain names before publishing changes.
                        </p>
                      </div>
                      <div className="divide-y">
                        {catalogResult.items.slice(0, 10).map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {item.title}
                              </p>
                              {item.detectedTitle &&
                                item.detectedTitle !== item.title && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    Suggested: {item.detectedTitle}
                                  </p>
                                )}
                            </div>
                            <Badge
                              variant={
                                item.titleMatchStatus === "unmatched"
                                  ? "destructive"
                                  : "outline"
                              }
                              className="w-fit shrink-0"
                            >
                              {item.titleMatchStatus === "matched"
                                ? `TMDB matched ${item.titleMatchConfidence ?? 0}%`
                                : item.titleMatchStatus === "review"
                                  ? `Review ${item.titleMatchConfidence ?? 0}%`
                                  : item.titleMatchStatus === "unavailable"
                                    ? "TMDB unavailable"
                                    : "No confident match"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="rounded-2xl border-0 bg-gray-50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-primary" />
                Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-600">
              <p>
                <strong>Authorized sources:</strong> Only import content from
                domains you have permission to process.
              </p>
              <p>
                <strong>Published state:</strong> Newly scraped sitemap posts
                are published immediately and become visible on the public
                site.
              </p>
              <p>
                <strong>Duplicate protection:</strong> Existing source URLs are
                skipped automatically, even if you scrape the same sitemap
                multiple times.
              </p>
              <p>
                <strong>Safe batches:</strong> Large sitemaps are processed in
                small batches. Keep this page open until the selected sitemap
                reaches Complete.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}