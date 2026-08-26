import { useListPosts, type Post } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, PlayCircle } from "lucide-react";
import { Link } from "wouter";

interface PostGridProps {
  posts?: Post[];
  isLoading: boolean;
  title?: string;
  emptyMessage?: string;
}

export function PostGrid({ posts, isLoading, title, emptyMessage = "No posts found." }: PostGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        {title && <h2 className="text-2xl font-bold text-white" style={{ fontFamily: '"Open Sans", sans-serif' }}>{title}</h2>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden border-0 shadow-sm bg-black">
              <Skeleton className="w-full aspect-[2/3]" />
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-24 bg-white rounded-2xl border border-dashed shadow-sm">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <PlayCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Nothing here yet</h3>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {title && <h2 className="text-2xl font-bold text-white" style={{ fontFamily: '"Open Sans", sans-serif' }}>{title}</h2>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {posts.map((post) => (
          <Link key={post.id} href={`/post/${post.slug}`} className="group block h-full">
            <Card className="h-full overflow-hidden border-0 shadow-sm bg-black transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5 flex flex-col group">
              <div className="relative aspect-[2/3] overflow-hidden bg-gray-100">
                {post.thumbnailUrl ? (
                  <img 
                    src={post.thumbnailUrl} 
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <PlayCircle className="w-12 h-12" />
                  </div>
                )}
                <div className="absolute top-3 left-3 flex gap-2">
                  <Badge className="bg-black/60 backdrop-blur-md text-white border-0 hover:bg-black/80 font-medium">
                    {post.category.name}
                  </Badge>
                </div>
              </div>
              
              <CardContent className="p-4 flex flex-col flex-1">
                <h3 className="font-display font-bold text-lg leading-tight text-white group-hover:text-primary transition-colors line-clamp-2 mb-2">
                  {post.title}
                </h3>
                <p className="text-sm text-gray-300 line-clamp-2 mb-4 flex-1">
                  {post.excerpt}
                </p>
                <div className="flex items-center text-xs text-gray-400 font-medium mt-auto">
                  <Calendar className="w-3 h-3 mr-1.5" />
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  })}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
