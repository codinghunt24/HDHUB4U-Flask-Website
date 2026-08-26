import { useListPosts, useListCategories } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { PostGrid } from "@/components/post-grid";
import { Button } from "@/components/ui/button";
import { Tags } from "lucide-react";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: categories } = useListCategories();
  const { data, isLoading } = useListPosts({ category: slug, limit: 12 });

  const categoryName = categories?.find(c => c.slug === slug)?.name || slug;

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
