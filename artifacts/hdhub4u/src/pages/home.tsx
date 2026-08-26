import { useListPosts } from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { PostGrid } from "@/components/post-grid";
import { PostPagination } from "@/components/post-pagination";

export default function Home() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const search = searchParams.get("search") || undefined;
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const [, setLocation] = useLocation();
  
  const { data, isLoading } = useListPosts({ search, page, limit: 50 });

  const changePage = (nextPage: number) => {
    const nextParams = new URLSearchParams();
    if (search) nextParams.set("search", search);
    if (nextPage > 1) nextParams.set("page", String(nextPage));
    const query = nextParams.toString();
    setLocation(query ? `/?${query}` : "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <PublicLayout>
      {search && (
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-white mb-2">Search Results</h1>
          <p className="text-gray-300">Showing results for "{search}"</p>
        </div>
      )}

      <PostGrid 
        posts={data?.items} 
        isLoading={isLoading} 
        title={search ? undefined : "Latest Releases"}
        emptyMessage={search ? "No posts matched your search." : "No posts published yet."}
      />

      {data && (
        <PostPagination
          page={data.page}
          totalPages={data.totalPages}
          onPageChange={changePage}
        />
      )}
    </PublicLayout>
  );
}
