import { useListAdminPosts, useUpdateAdminPost } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, ExternalLink, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminPosts() {
  const { data: posts, isLoading } = useListAdminPosts({ status: 'all' });
  const updatePost = useUpdateAdminPost();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleStatusChange = (id: number, status: 'published' | 'draft') => {
    updatePost.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: "Post updated", description: `Status changed to ${status}.` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/summary"] });
      }
    });
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Posts Moderation</h1>
          <p className="text-muted-foreground">Manage visibility of imported content.</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : posts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                  No posts found. Use the Import tool to fetch content.
                </TableCell>
              </TableRow>
            ) : (
              posts?.map((post) => (
                <TableRow key={post.id} className="group">
                  <TableCell className="font-medium text-gray-900 max-w-[300px] truncate">
                    {post.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">{post.category.name}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-gray-500 text-sm">
                      <Globe className="w-3 h-3 mr-1.5" />
                      {post.sourceDomain}
                    </div>
                  </TableCell>
                  <TableCell>
                    {post.status === 'published' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 font-medium">Published</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 font-medium">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {post.sourceUrl && (
                        <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-900">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                      {post.status === 'draft' ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                          onClick={() => handleStatusChange(post.id, 'published')}
                          disabled={updatePost.isPending}
                        >
                          <Check className="w-4 h-4 mr-1" /> Publish
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                          onClick={() => handleStatusChange(post.id, 'draft')}
                          disabled={updatePost.isPending}
                        >
                          <X className="w-4 h-4 mr-1" /> Unpublish
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </AdminLayout>
  );
}
