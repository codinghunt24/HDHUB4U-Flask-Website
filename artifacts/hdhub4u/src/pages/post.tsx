import { getGetPostQueryKey, useGetPost } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, PlayCircle, ExternalLink, Star, Clock, Film, Quote, Globe, Users, Clapperboard, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const setMetaTag = (
  attribute: "name" | "property",
  key: string,
  content: string,
) => {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
};

const ImageFallback = ({ src, alt, fallback, className, fit = "cover", width, height }: { src: string | null | undefined, alt: string, fallback?: React.ReactNode, className?: string, fit?: "cover" | "contain", width?: number, height?: number }) => {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className={`flex items-center justify-center w-full h-full bg-zinc-900 ${className || ''}`}>
        {fallback || <ImageIcon className="w-8 h-8 text-zinc-700" />}
      </div>
    );
  }
  return <img src={src} alt={alt} width={width} height={height} className={`w-full ${fit === "cover" ? "h-full object-cover" : "h-full object-contain"} ${className || ''}`} onError={() => setError(true)} loading="lazy" />;
};

export default function PostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading, isError } = useGetPost(slug || "", {
    query: { enabled: !!slug, queryKey: getGetPostQueryKey(slug || "") }
  });

  useEffect(() => {
    if (!post) return;
    const metadata = post.tmdb;
    const pageTitle = metadata
      ? `${post.title}${metadata.year ? ` (${metadata.year})` : ""} — Cast, Rating & Details | HDHUB4U`
      : `${post.title} | HDHUB4U`;
    const description = metadata?.editorialSummary ?? post.excerpt;
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    const imageUrl = metadata?.backdropUrl ?? metadata?.posterUrl ?? post.thumbnailUrl;
    const socialImageUrl = imageUrl
      ? new URL(imageUrl, window.location.origin).toString()
      : null;

    document.title = pageTitle;
    setMetaTag("name", "description", description);
    setMetaTag("property", "og:title", pageTitle);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:url", canonicalUrl);
    setMetaTag("property", "og:type", "article");
    setMetaTag("name", "twitter:title", pageTitle);
    setMetaTag("name", "twitter:description", description);
    if (socialImageUrl) {
      setMetaTag("property", "og:image", socialImageUrl);
      setMetaTag("name", "twitter:image", socialImageUrl);
    }

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const schemaId = "post-structured-data";
    document.getElementById(schemaId)?.remove();
    const structuredData = {
      "@context": "https://schema.org",
      "@type": metadata?.mediaType === "tv" ? "TVSeries" : "Movie",
      name: post.title,
      description,
      url: canonicalUrl,
       image: socialImageUrl || undefined,
      dateCreated: metadata?.releaseDate ?? undefined,
      genre: metadata?.genres.length ? metadata.genres : undefined,
      aggregateRating:
        metadata?.rating != null && metadata.voteCount != null && metadata.voteCount > 0
          ? {
              "@type": "AggregateRating",
              ratingValue: metadata.rating,
              ratingCount: metadata.voteCount,
              bestRating: 10,
            }
          : undefined,
      director: metadata?.director
        ? { "@type": "Person", name: metadata.director }
        : undefined,
      actor: metadata?.cast.map((member) => ({
        "@type": "Person",
        name: member.name,
      })),
      duration: metadata?.runtime != null ? `PT${metadata.runtime}M` : undefined,
    };
    const script = document.createElement("script");
    script.id = schemaId;
    script.type = "application/ld+json";
    script.text = JSON.stringify(structuredData);
    document.head.appendChild(script);

    return () => {
      document.getElementById(schemaId)?.remove();
    };
  }, [post]);

  if (isLoading) {
    return (
      <PublicLayout fullBleed>
        <div className="dark bg-black min-h-screen pb-24 pt-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <Skeleton className="h-10 w-32 rounded-full bg-zinc-800" />
            <div className="flex flex-col items-center gap-8">
              <Skeleton className="h-12 w-3/4 max-w-lg bg-zinc-800" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 bg-zinc-800" />
                <Skeleton className="h-6 w-24 bg-zinc-800" />
              </div>
              <Skeleton className="w-full max-w-[320px] aspect-[2/3] rounded-xl bg-zinc-800" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 py-8 border-y border-zinc-800">
              <Skeleton className="h-16 w-full bg-zinc-800" />
              <Skeleton className="h-16 w-full bg-zinc-800" />
              <Skeleton className="h-16 w-full bg-zinc-800" />
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (isError || !post) {
    return (
      <PublicLayout fullBleed>
        <div className="dark bg-black min-h-screen flex items-center justify-center p-4">
          <div className="text-center py-24 bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-800 max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">Entry not found</h2>
            <p className="text-zinc-500 mb-6">The catalog entry you are looking for does not exist or has been removed.</p>
            <Link href="/">
              <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800">Return to Catalog</Button>
            </Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const t = post.tmdb;
  const sourceImageUrls = post.sourceImageUrls;
  const language = t?.language;
  const categoryLabels = [post.category.name, ...(t?.genres ?? [])].filter(
    (label, index, labels) =>
      labels.findIndex(
        (candidate) => candidate.toLowerCase() === label.toLowerCase(),
      ) === index,
  );

  return (
    <PublicLayout fullBleed>
      <div className="dark bg-black text-zinc-300 min-h-screen pb-24 selection:bg-primary selection:text-primary-foreground">
        <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 md:pt-12">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-tight mb-6">
              {post.title}
              {t?.year && <span className="text-zinc-500 font-normal ml-3">({t.year})</span>}
            </h1>

            {/* Category labels */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
              {categoryLabels.map((label) =>
                label === post.category.name ? (
                  <Link key={label} href={`/category/${post.category.slug}`}>
                    <Badge className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-0 cursor-pointer text-sm py-1 px-3 transition-colors">
                      {label}
                    </Badge>
                  </Link>
                ) : (
                  <Badge
                    key={label}
                    variant="outline"
                    className="text-zinc-400 border-zinc-800 text-sm py-1 px-3"
                  >
                    {label}
                  </Badge>
                ),
              )}
              {!t && (
                <Badge variant="outline" className="text-zinc-400 border-zinc-800 text-sm py-1 px-3 flex items-center">
                  <Calendar className="w-3 h-3 mr-1.5" />
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  })}
                </Badge>
              )}
            </div>
          </div>

          {/* Centered poster and source screenshots */}
          <div className="flex justify-center mb-7">
            <div className="w-full max-w-[320px] aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl relative">
              <ImageFallback
                src={t?.posterUrl || post.thumbnailUrl}
                alt={post.title}
                fallback={<Film className="w-16 h-16 opacity-20 text-zinc-500" />}
              />
            </div>
          </div>

          {sourceImageUrls && sourceImageUrls.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-4 font-semibold flex items-center">
                <ImageIcon className="w-4 h-4 mr-2" /> Screenshots
              </h2>
              <div className="space-y-4">
                {sourceImageUrls.map((sourceImageUrl, i) => (
                  <div key={sourceImageUrl} className="w-full max-w-[510px] h-[210px] mx-auto bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700/80 hover:border-zinc-500 transition-colors">
                    <ImageFallback src={sourceImageUrl} alt={`Screenshot ${i + 1}`} fit="contain" width={510} height={210} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {t && (
            <div className="space-y-3 mb-10">
              {(t.rating != null || t.runtime != null || t.releaseDate) && (
                <section className="rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-4 py-4">
                  <h2 className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3 font-semibold">Release facts</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-4">
              {t.rating != null && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1.5 font-semibold flex items-center">
                    <Star className="w-3.5 h-3.5 mr-1.5" /> Rating
                  </div>
                  <div className="text-lg font-medium text-zinc-100">
                    {t.rating.toFixed(1)} <span className="text-sm text-zinc-500 font-normal ml-1">({t.voteCount})</span>
                  </div>
                </div>
              )}
              {t.runtime != null && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1.5 font-semibold flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1.5" /> Runtime
                  </div>
                  <div className="text-lg font-medium text-zinc-100">
                    {t.runtime} min
                  </div>
                </div>
              )}
              {t.releaseDate && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1.5 font-semibold flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1.5" /> Release
                  </div>
                  <div className="text-lg font-medium text-zinc-100">
                    {new Date(t.releaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
              )}
                  </div>
                </section>
              )}
              {(t.director || language || (t.cast && t.cast.length > 0)) && (
                <section className="rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-4 py-4">
                  <h2 className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3 font-semibold">Credits & language</h2>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              {t.director && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1.5 font-semibold flex items-center">
                    <Clapperboard className="w-3.5 h-3.5 mr-1.5" /> Director
                  </div>
                  <div className="text-lg font-medium text-zinc-100">
                    {t.director}
                  </div>
                </div>
              )}
                  {language && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1.5 font-semibold flex items-center">
                        <Globe className="w-3.5 h-3.5 mr-1.5" /> Language
                      </div>
                      <div className="text-lg font-medium text-zinc-100">
                        {language}
                      </div>
                    </div>
                  )}
                  </div>
                  {t.cast && t.cast.length > 0 && (
                    <div className="pt-4 mt-4 border-t border-zinc-800">
                      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3 font-semibold flex items-center">
                    <Users className="w-3.5 h-3.5 mr-1.5" /> Cast
                  </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-3">
                    {t.cast.slice(0, 6).map((actor, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        {actor.profileUrl ? (
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900 border border-zinc-800">
                              <ImageFallback
                                src={actor.profileUrl}
                                alt={actor.name}
                                fallback={<span className="text-xs font-medium text-zinc-500">{actor.name.charAt(0)}</span>}
                              />
                            </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-500">
                            {actor.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-sm font-medium text-zinc-300">{actor.name}</span>
                      </div>
                    ))}
                  </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* Editorial Summary */}
          <div className="mb-16">
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-6 font-semibold flex items-center">
              <Quote className="w-4 h-4 mr-2" /> Editorial Summary
            </h3>
            <p className="text-lg md:text-xl leading-relaxed text-zinc-300 font-serif">
              {t?.editorialSummary || post.excerpt}
            </p>
          </div>

          {!t && (
            <div className="mb-16 p-8 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
              <h3 className="text-base font-bold text-zinc-200 mb-2 font-display">Catalog entry awaiting enrichment</h3>
              <p className="text-zinc-400 text-sm">
                This editorial listing will show verified cast, ratings, and reference links when a confident TMDB match is available.
              </p>
            </div>
          )}

          {/* Official Trailer */}
          {t?.trailerUrl && (
            <div className="mb-16">
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-6 font-semibold flex items-center">
                <PlayCircle className="w-4 h-4 mr-2" /> Official Trailer
              </h3>
              <a href={t.trailerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center bg-white text-black px-6 py-3 rounded-full font-medium hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5">
                Watch on YouTube <ExternalLink className="w-4 h-4 ml-2 opacity-70" />
              </a>
            </div>
          )}

          {/* Related Entries */}
          {t?.related && t.related.length > 0 && (
            <div className="mb-12 pt-12 border-t border-zinc-800/50">
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-8 font-semibold">
                Related Entries
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {t.related.map(item => (
                  <a
                    key={`${item.mediaType}-${item.id}`}
                    href={`https://www.themoviedb.org/${item.mediaType}/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="aspect-[2/3] bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800/50 mb-3 relative">
                      {item.posterUrl ? (
                        <ImageFallback
                          src={item.posterUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                          <Film className="w-8 h-8 opacity-20" />
                        </div>
                      )}
                    </div>
                    <h4 className="font-medium text-sm text-zinc-300 group-hover:text-white line-clamp-1 transition-colors">{item.title}</h4>
                    {item.year && <p className="text-xs text-zinc-500 mt-1">{item.year}</p>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Attribution */}
          <div className="pt-8 border-t border-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-6">
              {t?.imdbId && (
                <a href={`https://www.imdb.com/title/${t.imdbId}`} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors flex items-center">
                  IMDb <ExternalLink className="w-3 h-3 ml-1.5 opacity-70" />
                </a>
              )}
              {t?.tmdbUrl && (
                <a href={t.tmdbUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors flex items-center">
                  TMDB <ExternalLink className="w-3 h-3 ml-1.5 opacity-70" />
                </a>
              )}
            </div>
            <p className="text-zinc-600">{t?.attribution || "Catalog entry awaiting enrichment"}</p>
          </div>
        </article>
      </div>
    </PublicLayout>
  );
}
