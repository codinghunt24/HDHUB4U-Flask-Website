import { useImportPosts } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const importSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

export default function AdminFetch() {
  const importPosts = useImportPosts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);

  const form = useForm<z.infer<typeof importSchema>>({
    resolver: zodResolver(importSchema),
    defaultValues: { url: "" },
  });

  const onSubmit = (values: z.infer<typeof importSchema>) => {
    setResult(null);
    importPosts.mutate({ data: values }, {
      onSuccess: (res) => {
        setResult(res);
        toast({ title: "Import complete", description: `Imported ${res.imported} new items.` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/summary"] });
        form.reset();
      },
      onError: () => {
        toast({ variant: "destructive", title: "Import failed", description: "Failed to scrap URL. Ensure it is a valid source." });
      }
    });
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Import Content</h1>
        <p className="text-muted-foreground">Scrap and ingest content from authorized sources.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-sm rounded-2xl">
            <CardHeader>
              <CardTitle>Source URL</CardTitle>
              <CardDescription>Enter the full URL of the catalog page you want to import.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Catalog URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com/movies/2023" {...field} className="h-11" />
                        </FormControl>
                        <FormDescription>
                          The system will extract titles, thumbnails, categories, and direct links.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    size="lg"
                    disabled={importPosts.isPending}
                    className="w-full md:w-auto"
                    data-testid="button-import-scrap"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {importPosts.isPending ? "Scraping..." : "Scrap & Import"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {result && (
            <Alert className="bg-emerald-50 border-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-800">Import Successful</AlertTitle>
              <AlertDescription className="text-emerald-700">
                Processed <strong>{result.sourceUrl}</strong>.
                Found and imported {result.imported} new items. Skipped {result.skipped} existing items.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <Card className="border-0 shadow-sm rounded-2xl bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="w-4 h-4 text-primary" />
                Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-4">
              <p>
                <strong>Supported Sources:</strong> Ensure you are importing from authorized domains. Unknown structures will be rejected.
              </p>
              <p>
                <strong>Draft State:</strong> All newly imported content is placed in <strong>Draft</strong> state by default. They will not appear on the public site until you review and publish them in Moderation.
              </p>
              <p>
                <strong>Duplicates:</strong> The system automatically detects existing slugs and source URLs to prevent duplicate entries.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
