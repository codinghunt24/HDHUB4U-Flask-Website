import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetAdminSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminAnalytics() {
  const { data: settings } = useGetAdminSettings();

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Analytics</h1>
        <p className="text-muted-foreground">Traffic and visitor insights integration.</p>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl max-w-2xl bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Google Analytics Integration
          </CardTitle>
          <CardDescription>
            View your site traffic directly in the Google Analytics dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings?.analyticsId ? (
            <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100 flex flex-col items-start gap-4">
              <div>
                <p className="font-semibold text-emerald-900 mb-1">Analytics Active</p>
                <p className="text-emerald-700 text-sm">Tracking ID: <code className="bg-white px-2 py-0.5 rounded ml-1">{settings.analyticsId}</code></p>
              </div>
              <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="border-emerald-200 text-emerald-800 hover:bg-emerald-100">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open GA Dashboard
                </Button>
              </a>
            </div>
          ) : (
            <div className="p-6 bg-gray-50 rounded-xl border flex flex-col items-start gap-4">
              <div>
                <p className="font-semibold text-gray-900 mb-1">Analytics Not Configured</p>
                <p className="text-gray-500 text-sm">You have not set up a Google Analytics tracking ID.</p>
              </div>
              <a href="/admin/settings">
                <Button variant="outline">
                  Configure in Settings
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
