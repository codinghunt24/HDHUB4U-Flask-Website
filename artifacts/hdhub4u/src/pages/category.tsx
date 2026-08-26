import { useListPosts, useListCategories } from "@workspace/api-client-react";
import { useLocation, useParams, useSearch } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { PostGrid } from "@/components/post-grid";
import { PostPagination } from "@/components/post-pagination";
import { Tags } from "lucide-react";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const [, setLocation] = useLocation();
  const { data: categories } = useListCategories();
  const { data, isLoading } = useListPosts({ category: slug, page, limit: 50 });

  const categoryName = categories?.find(c => c.slug === slug)?.name || slug;
  const changePage = (nextPage: number) => {
    setLocation(nextPage > 1 ? `/category/${slug}?page=${nextPage}` : `/category/${slug}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <PublicLayout>
      <div className="mb-8 flex items-center gap-3 pb-6 border-b">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
          <Tags className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold text-white capitalize">{categoryName}</h1>
          <p className="text-gray-300">Browsing all posts in this category</p>
        </div>
      </div>

      <PostGrid 
        posts={data?.items} 
        isLoading={isLoading} 
        emptyMessage={`No posts found in ${categoryName}.`}
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
