import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MonitorPlay, Film } from "lucide-react";
import { useState, FormEvent } from "react";
import { useGetPublicSettings, useListCategories } from "@workspace/api-client-react";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const { data: settings } = useGetPublicSettings();
  const { data: categories } = useListCategories();
  const menuCategorySlugs = [
    "bollywood",
    "hollywood",
    "hindi-dubbed",
    "south-hindi",
    "web-series",
  ];
  const menuCategories = menuCategorySlugs
    .map((slug) => categories?.find((category) => category.slug === slug))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/?search=${encodeURIComponent(search.trim())}`);
    } else {
      setLocation(`/`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center rotate-3 shadow-sm border border-primary-border">
              <Film className="w-6 h-6 -rotate-3" />
            </div>
            <span className="font-display font-bold text-2xl tracking-tight text-gray-900 hidden sm:block">
              {settings?.siteName || "HDHUB4U"}
            </span>
          </Link>

          <form onSubmit={handleSearch} className="flex-1 max-w-lg relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..." 
              className="w-full pl-9 bg-gray-50 focus-visible:bg-white rounded-full border-gray-200 shadow-none h-11"
              data-testid="input-search-global"
            />
          </form>
        </div>

        {/* Categories Bar */}
        <div className="border-t border-black bg-black">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-1 overflow-x-auto py-2 no-scrollbar">
              <Link href="/">
                <Button variant="ghost" size="sm" className="whitespace-nowrap rounded-full text-white hover:bg-white/10 hover:text-white">
                  All
                </Button>
              </Link>
              {menuCategories.map((cat) => (
                <Link key={cat.id} href={`/category/${cat.slug}`}>
                  <Button variant="ghost" size="sm" className="whitespace-nowrap rounded-full text-white hover:bg-white/10 hover:text-white">
                    {cat.name}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-12 mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 opacity-80">
              <Film className="w-5 h-5 text-primary" />
              <span className="font-display font-bold text-lg text-gray-900">
                {settings?.siteName || "HDHUB4U"}
              </span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground font-medium">
              <Link href="/about" className="hover:text-primary transition-colors">About</Link>
              <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
              <Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link href="/disclaimer" className="hover:text-primary transition-colors">Disclaimer</Link>
            </div>
          </div>
          <div className="mt-8 text-center text-sm text-gray-400">
            &copy; {new Date().getFullYear()} {settings?.siteName || "HDHUB4U"}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
