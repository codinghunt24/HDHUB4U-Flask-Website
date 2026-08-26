import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetAdminSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Tags, CheckCircle2, AlertCircle, Clock } from "lucide-react";

export default function AdminDashboard() {
  const { data: summary, isLoading } = useGetAdminSummary();

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your site content and health.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <SummaryCard 
          title="Published Posts" 
          value={summary?.publishedPosts} 
          icon={CheckCircle2} 
          loading={isLoading} 
          trend="Live on site"
          color="text-emerald-500"
          bg="bg-emerald-50"
        />
        <SummaryCard 
          title="Draft Posts" 
          value={summary?.draftPosts} 
          icon={AlertCircle} 
          loading={isLoading} 
          trend="Needs review"
          color="text-amber-500"
          bg="bg-amber-50"
        />
        <SummaryCard 
          title="Categories" 
          value={summary?.categories} 
          icon={Tags} 
          loading={isLoading} 
          trend="Active tags"
          color="text-blue-500"
          bg="bg-blue-50"
        />
        <SummaryCard 
          title="Last Import" 
          value={summary?.lastImportAt ? new Date(summary.lastImportAt).toLocaleDateString() : "Never"} 
          icon={Clock} 
          loading={isLoading} 
          trend="URL fetcher"
          color="text-purple-500"
          bg="bg-purple-50"
        />
      </div>
    </AdminLayout>
  );
}

function SummaryCard({ title, value, icon: Icon, loading, trend, color, bg }: any) {
  return (
    <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg}`}>
            <Icon className={`w-6 h-6 ${color}`} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-20 mb-1" />
          ) : (
            <h3 className="text-3xl font-display font-bold text-gray-900 mb-1">
              {value}
            </h3>
          )}
          <p className="text-xs text-gray-400 font-medium">{trend}</p>
        </div>
      </CardContent>
    </Card>
  );
}
