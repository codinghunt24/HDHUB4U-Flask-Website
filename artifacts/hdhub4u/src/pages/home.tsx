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
      {search && (
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Search Results</h1>
          <p className="text-muted-foreground">Showing results for "{search}"</p>
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
