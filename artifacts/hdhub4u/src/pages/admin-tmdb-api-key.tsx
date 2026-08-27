import {
  useDeleteAdminTmdbApiKey,
  useGetAdminTmdbApiKey,
  useSaveAdminTmdbApiKey,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function AdminTmdbApiKey() {
  const { data: status, isLoading } = useGetAdminTmdbApiKey();
  const saveKey = useSaveAdminTmdbApiKey();
  const deleteKey = useDeleteAdminTmdbApiKey();
  const [apiKey, setApiKey] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/tmdb-key"] });

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      toast({
        variant: "destructive",
        title: "API key is required",
        description: "Enter a TMDB API key before saving.",
      });
      return;
    }

    saveKey.mutate(
      { data: { apiKey: trimmedKey } },
      {
        onSuccess: () => {
          setApiKey("");
          invalidateStatus();
          toast({
            title: status?.configured ? "API key replaced" : "API key saved",
            description: "The TMDB API key is stored securely on the server.",
          });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Could not save API key",
            description: getErrorMessage(error, "Please try again."),
          });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteKey.mutate(undefined, {
      onSuccess: () => {
        setDeleteOpen(false);
        invalidateStatus();
        toast({
          title: "API key deleted",
          description: "The TMDB API key has been removed.",
        });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Could not delete API key",
          description: getErrorMessage(error, "Please try again."),
        });
      },
    });
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <KeyRound className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-display font-bold text-gray-900">TMDB API Key</h1>
        </div>
        <p className="text-muted-foreground">
          Manage the server-side credential used for future TMDB features.
        </p>
      </div>

      <div className="grid gap-6 max-w-3xl">
        <Card className="border-0 shadow-sm rounded-2xl">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Connection status</CardTitle>
                <CardDescription className="mt-1">
                  Your full key is never returned to the browser or shown here.
                </CardDescription>
              </div>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant={status?.configured ? "default" : "outline"}>
                  {status?.configured ? "Configured" : "Not configured"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">Encrypted server storage</p>
                <p className="text-sm text-muted-foreground break-all">
                  {status?.configured
                    ? `Stored key: ${status.maskedKey}`
                    : "No TMDB API key is currently stored."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle>{status?.configured ? "Replace API key" : "Add API key"}</CardTitle>
            <CardDescription>
              Paste a new TMDB API key below. Saving a new value replaces the existing key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="tmdb-api-key">TMDB API key</Label>
                <Input
                  id="tmdb-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Enter your TMDB API key"
                  autoComplete="new-password"
                  disabled={saveKey.isPending}
                  data-testid="input-tmdb-api-key"
                />
                <p className="text-xs text-muted-foreground">
                  The key is transmitted only to this server over your authenticated admin session.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                {status?.configured && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                    disabled={deleteKey.isPending || saveKey.isPending}
                    data-testid="button-delete-tmdb-key"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete key
                  </Button>
                )}
                <Button type="submit" disabled={saveKey.isPending || deleteKey.isPending}>
                  {saveKey.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {saveKey.isPending ? "Saving..." : status?.configured ? "Replace key" : "Save key"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete TMDB API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the encrypted key from the server. Any future TMDB features will stop working until you save another key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteKey.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              disabled={deleteKey.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteKey.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}