import {
  useListAdminPosts,
  useUpdateAdminPost,
  useEnrichAdminTmdbPosts,
  useRefreshAdminPostSourceImages,
  useBackfillAdminPostMedia,
  useDeleteAllAdminPosts,
  getListAdminPostsQueryKey,
} from "@workspace/api-client-react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Check, X, ExternalLink, Globe, Pencil, Sparkles, RefreshCcw, Trash2, Images } from "lucide-react";
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
  const enrichMutation = useEnrichAdminTmdbPosts();
  const refreshSourceImages = useRefreshAdminPostSourceImages();
  const backfillMedia = useBackfillAdminPostMedia();
  const deleteAllPosts = useDeleteAllAdminPosts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editingPost, setEditingPost] = useState<EditablePost | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [cleanOpen, setCleanOpen] = useState(false);
  const [cleanConfirmation, setCleanConfirmation] = useState("");

  const handleStatusChange = (id: number, status: 'published' | 'draft') => {
    updatePost.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: "Post updated", description: `Status changed to ${status}.` });
        queryClient.invalidateQueries({ queryKey: getListAdminPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/summary"] });
      }
    });
  };

  const handleEnrich = () => {
    enrichMutation.mutate({ data: { limit: 10, includeReviewed: false } }, {
      onSuccess: (res) => {
        toast({ 
          title: "Enrichment complete", 
          description: `Attempted: ${res.attempted} | Enriched: ${res.enriched} | Failed: ${res.failed} | Unmatched: ${res.unmatched}` 
        });
        queryClient.invalidateQueries({ queryKey: getListAdminPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      },
      onError: () => {
        toast({
          title: "Enrichment failed",
          description: "An error occurred while contacting TMDB.",
          variant: "destructive",
        });
      }
    });
  };

  const handleRefreshSourceImages = () => {
    refreshSourceImages.mutate(
      { data: { limit: 10 } },
      {
        onSuccess: (result) => {
          toast({
            title: "Source screenshots refreshed",
            description: `Attempted: ${result.attempted} | Refreshed: ${result.refreshed} | Failed: ${result.failed}`,
          });
          queryClient.invalidateQueries({ queryKey: getListAdminPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        },
        onError: () => {
          toast({
            title: "Source screenshot refresh failed",
            description: "The selected sources could not be refreshed. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleBackfillMedia = () => {
    backfillMedia.mutate(
      { data: { limit: 5 } },
      {
        onSuccess: (result) => {
          toast({
            title: "Image migration complete",
            description: `Attempted: ${result.attempted} | Stored: ${result.migrated} | Remaining: ${result.remaining}`,
          });
          queryClient.invalidateQueries({ queryKey: getListAdminPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        },
        onError: () => {
          toast({
            title: "Image migration paused",
            description: "Some images could not be moved safely. Try the next batch later.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const openTitleEditor = (post: EditablePost) => {
    setEditingPost(post);
    setEditedTitle(post.detectedTitle || post.title);
  };

  const handleCleanAllPosts = () => {
    if (cleanConfirmation !== "DELETE ALL POSTS") return;
    deleteAllPosts.mutate(undefined, {
      onSuccess: (res) => {
        setCleanOpen(false);
        setCleanConfirmation("");
        queryClient.invalidateQueries({ queryKey: getListAdminPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/summary"] });
        toast({
          title: "All posts deleted",
          description: `${res.deletedCount} post${res.deletedCount === 1 ? "" : "s"} permanently removed.`,
        });
      },
      onError: (error) => {
        toast({
          title: "Could not delete posts",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      },
    });
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
          queryClient.invalidateQueries({ queryKey: getListAdminPostsQueryKey() });
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
          Matched {post.titleMatchConfidence ?? 0}%
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Posts Moderation</h1>
          <p className="text-muted-foreground">Review detected names, enrich with TMDB, and manage visibility.</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Button 
            onClick={handleEnrich} 
            disabled={enrichMutation.isPending || refreshSourceImages.isPending || backfillMedia.isPending || deleteAllPosts.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            {enrichMutation.isPending ? (
              <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Enrich via TMDB
          </Button>
          <Button
            variant="outline"
            onClick={handleRefreshSourceImages}
            disabled={enrichMutation.isPending || refreshSourceImages.isPending || backfillMedia.isPending || deleteAllPosts.isPending || isLoading || !posts?.length}
          >
            {refreshSourceImages.isPending ? (
              <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Images className="w-4 h-4 mr-2" />
            )}
            Refresh screenshots
          </Button>
          <Button
            variant="outline"
            onClick={handleBackfillMedia}
            disabled={enrichMutation.isPending || refreshSourceImages.isPending || backfillMedia.isPending || deleteAllPosts.isPending || isLoading || !posts?.length}
          >
            {backfillMedia.isPending ? (
              <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Images className="w-4 h-4 mr-2" />
            )}
            Move legacy images
          </Button>
          <Button
            variant="destructive"
            onClick={() => setCleanOpen(true)}
            disabled={deleteAllPosts.isPending || enrichMutation.isPending || refreshSourceImages.isPending || backfillMedia.isPending || isLoading || !posts?.length}
            data-testid="button-clean-all-posts"
          >
            {deleteAllPosts.isPending ? (
              <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Clean all posts
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow>
              <TableHead>Title detection</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>TMDB</TableHead>
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
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : posts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No posts found. Use the Import tool to fetch content.
                </TableCell>
              </TableRow>
            ) : (
              posts?.map((post) => (
                <TableRow key={post.id} className="group">
                  <TableCell className="max-w-[380px]">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{post.title}</span>
                        {matchBadge(post)}
                      </div>
                      {post.detectedTitle && post.detectedTitle !== post.title && (
                        <p className="text-xs text-amber-700 dark:text-amber-500">
                          Suggested: {post.detectedTitle}
                          {post.titleMatchYear ? ` (${post.titleMatchYear})` : ""}
                          {post.titleMatchType ? ` · ${post.titleMatchType === "tv" ? "TV" : "Movie"}` : ""}
                        </p>
                      )}
                      {post.sourceTitle && (
                        <p className="truncate text-xs text-muted-foreground" title={post.sourceTitle}>
                          Original: {post.sourceTitle}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">{post.category.name}</Badge>
                  </TableCell>
                  <TableCell>
                    {post.tmdbEnrichmentStatus === 'ready' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-0 flex items-center gap-1 w-fit dark:bg-emerald-900/30 dark:text-emerald-400">
                        <Check className="w-3 h-3" /> Enriched
                      </Badge>
                    ) : post.tmdbEnrichmentStatus === 'pending' ? (
                      <Badge variant="outline" className="text-slate-500 bg-slate-50 border-slate-200 flex items-center gap-1 w-fit dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                        <RefreshCcw className="w-3 h-3" /> Pending
                      </Badge>
                    ) : post.tmdbEnrichmentStatus === 'review' ? (
                      <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 flex items-center gap-1 w-fit dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400">
                        Review
                      </Badge>
                    ) : post.tmdbEnrichmentStatus === 'unmatched' ? (
                      <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200 flex items-center gap-1 w-fit dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-400">
                        Unmatched
                      </Badge>
                    ) : post.tmdbEnrichmentStatus === 'failed' ? (
                      <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200 flex items-center gap-1 w-fit dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
                        Failed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500 flex items-center gap-1 w-fit dark:text-slate-400">
                        Unavailable
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-muted-foreground text-sm">
                      <Globe className="w-3 h-3 mr-1.5" />
                      {post.sourceDomain}
                    </div>
                  </TableCell>
                  <TableCell>
                    {post.status === 'published' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 font-medium dark:bg-emerald-900/30 dark:text-emerald-400">Published</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 font-medium dark:bg-amber-900/30 dark:text-amber-400">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openTitleEditor(post)}
                        aria-label={`Edit title for ${post.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {post.sourceUrl && (
                        <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                      {post.status === 'draft' ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                          onClick={() => handleStatusChange(post.id, 'published')}
                          disabled={updatePost.isPending}
                        >
                          <Check className="w-4 h-4 mr-1" /> Publish
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/30"
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
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Original scraped title</p>
                <p className="text-sm text-foreground">{editingPost.sourceTitle}</p>
              </div>
            )}
            {editingPost?.detectedTitle && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Detected name</p>
                <p className="mt-1 text-sm font-medium text-foreground">{editingPost.detectedTitle}</p>
              </div>
            )}
            <div>
              <label htmlFor="reviewed-title" className="mb-2 block text-sm font-medium text-foreground">
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

      <AlertDialog
        open={cleanOpen}
        onOpenChange={(open) => {
          if (!deleteAllPosts.isPending) {
            setCleanOpen(open);
            if (!open) setCleanConfirmation("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all posts permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove every post, including published posts, drafts, imported content, and TMDB metadata. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor="clean-posts-confirmation" className="text-sm font-medium text-foreground">
              Type DELETE ALL POSTS to continue
            </label>
            <Input
              id="clean-posts-confirmation"
              value={cleanConfirmation}
              onChange={(event) => setCleanConfirmation(event.target.value)}
              placeholder="DELETE ALL POSTS"
              autoComplete="off"
              disabled={deleteAllPosts.isPending}
              data-testid="input-clean-all-posts-confirmation"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAllPosts.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleCleanAllPosts();
              }}
              disabled={deleteAllPosts.isPending || cleanConfirmation !== "DELETE ALL POSTS"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-clean-all-posts"
            >
              {deleteAllPosts.isPending && <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
