import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, Download, Tags, Settings, Activity, Map, LogOut } from "lucide-react";
import { useGetAdminSession, useAdminLogout } from "@workspace/api-client-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/posts", label: "Posts", icon: FileText },
  { href: "/admin/fetch", label: "Import URL", icon: Download },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/analytics", label: "Analytics", icon: Activity },
  { href: "/admin/sitemap", label: "Sitemap", icon: Map },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: session, isLoading } = useGetAdminSession();
  const logout = useAdminLogout();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && (!session || !session.authenticated) && location !== "/admin") {
      setLocation("/admin");
    }
  }, [session, isLoading, location, setLocation]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/admin");
      }
    });
  };

  // Login page has no sidebar
  if (location === "/admin" && (!session || !session.authenticated)) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">{children}</div>;
  }

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col fixed inset-y-0 z-10">
        <div className="h-16 flex items-center px-6 border-b">
          <span className="font-display font-bold text-xl text-gray-900 tracking-tight">
            Control Room
          </span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link key={item.href} href={item.href}>
                <div className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }
                `}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
            onClick={handleLogout}
            data-testid="button-admin-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pl-64">
        <div className="max-w-5xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
