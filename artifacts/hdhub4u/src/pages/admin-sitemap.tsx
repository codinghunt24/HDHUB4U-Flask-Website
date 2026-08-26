import { useGetAdminSitemap } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Map, Link as LinkIcon, Calendar, CheckCircle2 } from "lucide-react";

export default function AdminSitemap() {
  const { data: sitemap, isLoading } = useGetAdminSitemap();

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Sitemap Health</h1>
        <p className="text-muted-foreground">Monitor search engine crawlability and index size.</p>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl max-w-2xl bg-white overflow-hidden">
        <CardHeader className="bg-gray-50/50 border-b">
          <CardTitle className="flex items-center gap-2">
            <Map className="w-5 h-5 text-primary" />
            Sitemap Status
          </CardTitle>
          <CardDescription>Automatically generated to include all published posts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ) : sitemap ? (
            <div className="divide-y">
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <LinkIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Sitemap URL</p>
                    <a href={sitemap.url} target="_blank" rel="noopener noreferrer" className="text-gray-900 font-medium hover:text-primary transition-colors flex items-center gap-1">
                      {sitemap.url}
                    </a>
                  </div>
                </div>
              </div>
              
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Indexed URLs</p>
                    <p className="text-xl font-display font-bold text-gray-900">{sitemap.indexedUrls}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Last Generated</p>
                    <p className="text-gray-900 font-medium">
                      {sitemap.lastGeneratedAt ? new Date(sitemap.lastGeneratedAt).toLocaleString() : "Never"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              Sitemap data unavailable.
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
