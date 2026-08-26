import { useListPosts } from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { PostGrid } from "@/components/post-grid";
import { Button } from "@/components/ui/button";

export default function Home() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const search = searchParams.get("search") || undefined;
  
  const { data, isLoading } = useListPosts({ search, limit: 12 });

  return (
    <PublicLayout>
      {search ? (
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Search Results</h1>
          <p className="text-muted-foreground">Showing results for "{search}"</p>
        </div>
      ) : (
        <div className="mb-12 text-center py-16 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl border border-primary/10">
          <h1 className="text-4xl md:text-5xl font-display font-extrabold text-gray-900 mb-4 tracking-tight">
            Latest <span className="text-primary">Entertainment</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto px-4">
            Browse the newest editorial catalog of trending movies, shows, and entertainment updates.
          </p>
        </div>
      )}

      <PostGrid 
        posts={data?.items} 
        isLoading={isLoading} 
        title={search ? undefined : "Latest Releases"}
        emptyMessage={search ? "No posts matched your search." : "No posts published yet."}
      />

      {data && data.totalPages > 1 && (
        <div className="mt-12 flex justify-center">
          <Button variant="outline" size="lg" className="font-medium rounded-full px-8">
            Load More
          </Button>
        </div>
      )}
    </PublicLayout>
  );
}
