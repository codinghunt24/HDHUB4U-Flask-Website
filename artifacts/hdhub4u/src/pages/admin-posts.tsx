import { useListAdminPosts, useUpdateAdminPost } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, ExternalLink, Globe, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type EditablePost = {
  id: number;
  title: string;
  sourceTitle: string | null;
  detectedTitle: string | null;
};

export default function AdminPosts() {
  const { data: posts, isLoading } = useListAdminPosts({ status: 'all' });
  const updatePost = useUpdateAdminPost();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPost, setEditingPost] = useState<EditablePost | null>(null);
  const [editedTitle, setEditedTitle] = useState("");

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

  const openTitleEditor = (post: EditablePost) => {
    setEditingPost(post);
    setEditedTitle(post.detectedTitle || post.title);
  };

  const saveTitle = () => {
    if (!editingPost || editedTitle.trim().length < 2) return;
    updatePost.mutate(
      { id: editingPost.id, data: { title: editedTitle.trim() } },
      {
        onSuccess: () => {
          toast({
            title: "Title saved",
            description: "This manual title will not be overwritten by imports.",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/posts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
          setEditingPost(null);
        },
        onError: () => {
          toast({
            title: "Title could not be saved",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const matchBadge = (post: NonNullable<typeof posts>[number]) => {
    if (post.titleSource === "manual") {
      return <Badge variant="outline" className="border-slate-200 text-slate-600">Manual</Badge>;
    }
    if (post.titleMatchStatus === "matched") {
      return (
        <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          TMDB matched {post.titleMatchConfidence ?? 0}%
        </Badge>
      );
    }
    if (post.titleMatchStatus === "review") {
      return (
        <Badge className="border-0 bg-orange-100 text-orange-700 hover:bg-orange-100">
          Review {post.titleMatchConfidence ?? 0}%
        </Badge>
      );
    }
    if (post.titleMatchStatus === "unavailable") {
      return <Badge variant="outline" className="text-slate-500">TMDB unavailable</Badge>;
    }
    return <Badge variant="outline" className="text-rose-600">No confident match</Badge>;
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Posts Moderation</h1>
          <p className="text-muted-foreground">Review detected names, correct uncertain matches, and manage visibility.</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Title detection</TableHead>
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
                  <TableCell className="max-w-[420px]">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{post.title}</span>
                        {matchBadge(post)}
                      </div>
                      {post.detectedTitle && post.detectedTitle !== post.title && (
                        <p className="text-xs text-orange-700">
                          Suggested: {post.detectedTitle}
                          {post.titleMatchYear ? ` (${post.titleMatchYear})` : ""}
                          {post.titleMatchType ? ` · ${post.titleMatchType === "tv" ? "TV" : "Movie"}` : ""}
                        </p>
                      )}
                      {post.sourceTitle && (
                        <p className="truncate text-xs text-gray-400" title={post.sourceTitle}>
                          Original: {post.sourceTitle}
                        </p>
                      )}
                    </div>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-gray-900"
                        onClick={() => openTitleEditor(post)}
                        aria-label={`Edit title for ${post.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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

      <Dialog
        open={Boolean(editingPost)}
        onOpenChange={(open) => {
          if (!open && !updatePost.isPending) setEditingPost(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review movie or series name</DialogTitle>
            <DialogDescription>
              Save the detected name or correct it. A saved manual title stays authoritative during future imports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingPost?.sourceTitle && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Original scraped title</p>
                <p className="text-sm text-slate-700">{editingPost.sourceTitle}</p>
              </div>
            )}
            {editingPost?.detectedTitle && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Detected name</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{editingPost.detectedTitle}</p>
              </div>
            )}
            <div>
              <label htmlFor="reviewed-title" className="mb-2 block text-sm font-medium text-slate-800">
                Final public title
              </label>
              <Input
                id="reviewed-title"
                value={editedTitle}
                onChange={(event) => setEditedTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveTitle();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPost(null)}
              disabled={updatePost.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={saveTitle}
              disabled={updatePost.isPending || editedTitle.trim().length < 2}
            >
              {updatePost.isPending ? "Saving..." : "Save manual title"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
