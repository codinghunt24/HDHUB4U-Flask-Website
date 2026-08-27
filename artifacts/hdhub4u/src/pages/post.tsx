import { getGetPostQueryKey, useGetPost } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, PlayCircle, ExternalLink, ChevronLeft, Star, Clock, Film, Quote } from "lucide-react";
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

const formatCurrency = (value: number | null) =>
  value == null || value <= 0
    ? "Not reported"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);

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

    document.title = pageTitle;
    setMetaTag("name", "description", description);
    setMetaTag("property", "og:title", pageTitle);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:url", canonicalUrl);
    setMetaTag("property", "og:type", "article");
    setMetaTag("name", "twitter:title", pageTitle);
    setMetaTag("name", "twitter:description", description);
    if (imageUrl) {
      setMetaTag("property", "og:image", imageUrl);
      setMetaTag("name", "twitter:image", imageUrl);
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
      image: imageUrl || undefined,
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
      <PublicLayout>
        <div className="max-w-6xl mx-auto px-4 py-12 space-y-12 animate-pulse">
          <Skeleton className="h-10 w-32 rounded-full" />
          <div className="flex flex-col md:flex-row gap-12">
            <Skeleton className="w-full md:w-[300px] aspect-[2/3] rounded-xl shrink-0" />
            <div className="flex-1 space-y-6">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (isError || !post) {
    return (
      <PublicLayout>
        <div className="text-center py-24 bg-card rounded-2xl border border-dashed border-border shadow-sm max-w-2xl mx-auto my-12">
          <h2 className="text-2xl font-bold text-foreground mb-2">Post not found</h2>
          <p className="text-muted-foreground mb-6">The post you are looking for does not exist or has been removed.</p>
          <Link href="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const t = post.tmdb;

  if (t) {
    return (
      <PublicLayout>
        <article className="pb-24">
          {/* Hero Backdrop */}
          {t.backdropUrl ? (
            <div className="relative w-full h-[50vh] min-h-[400px] bg-black overflow-hidden">
              <img 
                src={t.backdropUrl} 
                alt={t.title} 
                className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
            </div>
          ) : (
            <div className="w-full h-32 bg-secondary" />
          )}

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
            <Link href="/">
              <Button variant="ghost" size="sm" className="mb-6 -ml-3 text-foreground hover:bg-black/5 dark:hover:bg-white/10 backdrop-blur-sm">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back to Catalog
              </Button>
            </Link>

            <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-start">
              {/* Left Column - Poster & Primary Actions */}
              <div className="w-full md:w-[300px] shrink-0 space-y-6">
                <div className="rounded-xl overflow-hidden shadow-2xl border border-border/50 bg-card aspect-[2/3] relative">
                  {t.posterUrl ? (
                    <img src={t.posterUrl} alt={t.title} className="w-full h-full object-cover" />
                  ) : post.thumbnailUrl ? (
                    <img src={post.thumbnailUrl} alt={post.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-muted">
                      <Film className="w-16 h-16 mb-4 opacity-20" />
                    </div>
                  )}
                </div>
                
                {t.trailerUrl && (
                  <div className="space-y-3">
                    <a href={t.trailerUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
                      <Button size="lg" className="w-full font-bold shadow-lg shadow-primary/20 bg-primary text-primary-foreground hover:bg-primary/90">
                        <PlayCircle className="w-5 h-5 mr-2" />
                        View Official Trailer
                      </Button>
                    </a>
                  </div>
                )}

                <div className="p-5 rounded-xl bg-card border border-border space-y-4 text-sm shadow-sm">
                  {t.rating != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Rating</span>
                      <div className="flex items-center font-medium text-foreground">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500 mr-1.5" />
                        {t.rating.toFixed(1)} <span className="text-muted-foreground font-normal ml-1">({t.voteCount})</span>
                      </div>
                    </div>
                  )}
                  {t.runtime != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Runtime</span>
                      <div className="flex items-center font-medium text-foreground">
                        <Clock className="w-4 h-4 mr-1.5 opacity-70" />
                        {t.runtime} min
                      </div>
                    </div>
                  )}
                  {t.releaseDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Release</span>
                      <div className="flex items-center font-medium text-foreground">
                        <Calendar className="w-4 h-4 mr-1.5 opacity-70" />
                        {new Date(t.releaseDate).getFullYear()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column - Info */}
              <div className="flex-1 space-y-8 pt-4 md:pt-16">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/category/${post.category.slug}`}>
                      <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-0 cursor-pointer">
                        {post.category.name}
                      </Badge>
                    </Link>
                    <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-0">
                      {t.mediaType === 'movie' ? 'Movie' : 'Series'}
                    </Badge>
                    {t.genres.map(g => (
                      <Badge key={g} variant="outline" className="text-muted-foreground border-border">
                        {g}
                      </Badge>
                    ))}
                  </div>
                  
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground leading-tight">
                    {post.title}
                    {t.year && <span className="text-muted-foreground font-normal ml-3">({t.year})</span>}
                  </h1>
                  
                  {t.tagline && (
                    <p className="text-xl md:text-2xl font-serif italic text-muted-foreground">
                      "{t.tagline}"
                    </p>
                  )}
                </div>

                <div className="prose prose-lg prose-slate dark:prose-invert max-w-none">
                  <h3 className="font-display font-semibold text-2xl mb-4">Editorial Summary</h3>
                  <p className="text-lg leading-relaxed text-foreground/90 font-serif drop-cap">
                    {t.editorialSummary}
                  </p>
                </div>

                {t.director && (
                  <div className="pt-6 border-t border-border">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Director</h4>
                    <p className="text-lg font-medium text-foreground">{t.director}</p>
                  </div>
                )}

                {t.cast && t.cast.length > 0 && (
                  <div className="pt-6 border-t border-border">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Top Cast</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {t.cast.slice(0, 6).map((actor, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          {actor.profileUrl ? (
                            <img src={actor.profileUrl} alt={actor.name} className="w-12 h-12 rounded-full object-cover bg-muted" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium text-xs">
                              {actor.name.charAt(0)}
                            </div>
                          )}
                          <div className="text-sm">
                            <p className="font-medium text-foreground">{actor.name}</p>
                            {actor.character && <p className="text-muted-foreground truncate max-w-[120px]" title={actor.character}>{actor.character}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(t.revenue != null || t.budget != null || t.keywords.length > 0) && (
                  <section className="pt-6 border-t border-border">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Catalog facts</h4>
                    {t.mediaType === "movie" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-border bg-card px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</p>
                          <p className="mt-1 font-semibold text-foreground">{formatCurrency(t.revenue)}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-card px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Budget</p>
                          <p className="mt-1 font-semibold text-foreground">{formatCurrency(t.budget)}</p>
                        </div>
                      </div>
                    )}
                    {t.keywords.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {t.keywords.map((keyword) => (
                          <span key={keyword} className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {t.related.length > 0 && (
                  <section className="pt-6 border-t border-border">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">More to explore</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {t.related.map((item) => (
                        <a
                          key={`${item.mediaType}-${item.id}`}
                          href={`https://www.themoviedb.org/${item.mediaType}/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group overflow-hidden rounded-xl border border-border bg-card transition-transform hover:-translate-y-1"
                        >
                          <div className="aspect-[2/3] bg-secondary">
                            {item.posterUrl && (
                              <img src={item.posterUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            )}
                          </div>
                          <div className="p-3">
                            <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
                            {item.year && <p className="mt-1 text-xs text-muted-foreground">{item.year}</p>}
                          </div>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                <div className="pt-6">
                  <div className="p-6 rounded-2xl bg-card border border-border shadow-sm relative overflow-hidden group">
                    <Quote className="absolute -top-2 -right-2 w-24 h-24 text-primary/5 -rotate-12 group-hover:scale-110 transition-transform duration-500" />
                    <h4 className="font-display font-semibold text-lg mb-2 relative z-10 text-foreground">Editorial catalog note</h4>
                    <p className="text-muted-foreground leading-relaxed text-sm relative z-10">
                      {post.excerpt}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-8 border-t border-border">
                  {t.imdbId && (
                    <a href={`https://www.imdb.com/title/${t.imdbId}`} target="_blank" rel="noopener noreferrer" className="flex items-center hover:text-primary transition-colors">
                      <ExternalLink className="w-3 h-3 mr-1" /> IMDB
                    </a>
                  )}
                  {t.tmdbUrl && (
                    <a href={t.tmdbUrl} target="_blank" rel="noopener noreferrer" className="flex items-center hover:text-primary transition-colors">
                      <ExternalLink className="w-3 h-3 mr-1" /> TMDB
                    </a>
                  )}
                  <span className="ml-auto opacity-50">{t.attribution}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </PublicLayout>
    );
  }

  // Fallback for posts without TMDB metadata
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-6 -ml-3 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Catalog
          </Button>
        </Link>

        <div className="mb-10 space-y-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <Link href={`/category/${post.category.slug}`}>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0 text-sm py-1 px-3">
                {post.category.name}
              </Badge>
            </Link>
            <div className="flex items-center text-sm text-muted-foreground font-medium">
              <Calendar className="w-4 h-4 mr-1.5" />
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
              })}
            </div>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-tight max-w-3xl mx-auto">
            {post.title}
          </h1>
        </div>

        <div className="relative w-full max-w-[320px] mx-auto aspect-[2/3] rounded-2xl overflow-hidden bg-card shadow-2xl mb-12 border border-border">
          {post.thumbnailUrl ? (
            <img 
              src={post.thumbnailUrl} 
              alt={post.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-muted">
              <Film className="w-16 h-16 mb-4 opacity-20" />
              <span className="font-medium">No media available</span>
            </div>
          )}
        </div>

        <div className="prose prose-lg max-w-2xl mx-auto prose-slate dark:prose-invert">
          <p className="lead text-xl md:text-2xl text-foreground font-serif !leading-relaxed text-center mb-12">
            {post.excerpt}
          </p>

          <div className="mt-12 p-8 bg-card rounded-2xl border border-border shadow-sm">
            <h3 className="text-lg font-bold text-foreground m-0 mb-1 font-display">Catalog entry awaiting enrichment</h3>
            <p className="text-muted-foreground text-sm m-0">
              This editorial listing will show verified cast, ratings, and reference links when a confident TMDB match is available.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
