import { getGetPostQueryKey, useGetPost } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, PlayCircle, ExternalLink, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading, isError } = useGetPost(slug || "", {
    query: { enabled: !!slug, queryKey: getGetPostQueryKey(slug || "") }
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto space-y-8 animate-pulse">
          <Skeleton className="h-10 w-32 rounded-full" />
          <div className="space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
          </div>
          <Skeleton className="w-full aspect-[16/9] rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (isError || !post) {
    return (
      <PublicLayout>
        <div className="text-center py-24 bg-white rounded-2xl border border-dashed shadow-sm max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Post not found</h2>
          <p className="text-gray-500 mb-6">The post you are looking for does not exist or has been removed.</p>
          <Link href="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-6 -ml-3 text-muted-foreground hover:text-gray-900">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Catalog
          </Button>
        </Link>

        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-3">
            <Link href={`/category/${post.category.slug}`}>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0 text-sm py-1 px-3">
                {post.category.name}
              </Badge>
            </Link>
            <div className="flex items-center text-sm text-gray-500 font-medium">
              <Calendar className="w-4 h-4 mr-1.5" />
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
              })}
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-display font-bold text-gray-900 leading-tight">
            {post.title}
          </h1>
        </div>

        <div className="relative aspect-[16/9] rounded-3xl overflow-hidden bg-gray-100 shadow-xl mb-12 border border-black/5">
          {post.thumbnailUrl ? (
            <img 
              src={post.thumbnailUrl} 
              alt={post.title}
              width={1280}
              height={720}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
              <PlayCircle className="w-20 h-20 mb-4" />
              <span className="font-medium text-lg">No media available</span>
            </div>
          )}
        </div>

        <div className="prose prose-lg max-w-none prose-p:text-gray-600 prose-headings:font-display prose-headings:font-bold">
          <p className="lead text-xl md:text-2xl text-gray-800 font-medium !leading-relaxed">
            {post.excerpt}
          </p>

          <div className="mt-12 p-8 bg-gray-50 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 m-0 mb-1">Watch or Download</h3>
              <p className="text-gray-500 text-sm m-0">Available from authorized source</p>
            </div>
            {post.sourceUrl ? (
              <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                <Button size="lg" className="w-full font-bold shadow-lg shadow-primary/20">
                  <ExternalLink className="w-5 h-5 mr-2" />
                  Visit Source
                </Button>
              </a>
            ) : (
              <Button size="lg" disabled className="w-full sm:w-auto">
                Source Not Available
              </Button>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
