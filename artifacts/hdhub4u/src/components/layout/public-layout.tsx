import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MonitorPlay, Film, ChevronDown } from "lucide-react";
import { useRef, useState, FormEvent } from "react";
import { useGetPublicSettings, useListCategories } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PublicCategory = {
  id: number;
  name: string;
  slug: string;
};

function AllCategoriesMenu({ categories }: { categories: PublicCategory[] }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keepOpen = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };

  const closeSoon = () => {
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 160);
  };

  return (
    <div
      className="relative"
      onMouseEnter={keepOpen}
      onMouseLeave={closeSoon}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="whitespace-nowrap rounded-full px-4 text-sm text-white hover:bg-white/10 hover:text-white"
            aria-label="Show all categories"
          >
            All
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="max-h-[min(70vh,28rem)] min-w-52"
          onMouseEnter={keepOpen}
          onMouseLeave={closeSoon}
        >
          <DropdownMenuItem asChild>
            <Link href="/" className="cursor-pointer font-medium">
              All posts
            </Link>
          </DropdownMenuItem>
          {categories.map((cat) => (
            <DropdownMenuItem key={cat.id} asChild>
              <Link href={`/category/${cat.slug}`} className="cursor-pointer">
                {cat.name}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const { data: settings } = useGetPublicSettings();
  const { data: categories } = useListCategories();
  const menuCategories = categories ?? [];
  const visibleCategories = menuCategories.slice(0, 6);

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
      <header className="bg-[#141414] border-b border-white/10 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center rotate-3 shadow-sm border border-primary-border">
              <Film className="w-6 h-6 -rotate-3" />
            </div>
            <span className="font-display font-bold text-2xl tracking-tight text-white hidden sm:block">
              {settings?.siteName || "HDHUB4U"}
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar">
            {visibleCategories.map((cat) => (
              <Link key={cat.id} href={`/category/${cat.slug}`}>
                <Button variant="ghost" size="default" className="whitespace-nowrap rounded-full px-4 text-sm text-white hover:bg-white/10 hover:text-white">
                  {cat.name}
                </Button>
              </Link>
            ))}
            <AllCategoriesMenu categories={menuCategories} />
          </nav>

          <form onSubmit={handleSearch} className="w-full max-w-xs ml-auto relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 group-focus-within:text-white transition-colors" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..." 
              className="w-full pl-9 h-9 rounded-full border-white/15 bg-white/10 text-white placeholder:text-white/55 shadow-none backdrop-blur-sm focus-visible:border-white/30 focus-visible:bg-white/15 focus-visible:ring-white/20"
              data-testid="input-search-global"
            />
          </form>

          </div>

          <nav aria-label="Mobile navigation" className="flex md:hidden items-center gap-1 overflow-x-auto pt-2 no-scrollbar">
              {visibleCategories.map((cat) => (
                <Link key={cat.id} href={`/category/${cat.slug}`}>
                  <Button variant="ghost" size="default" className="whitespace-nowrap rounded-full px-4 text-sm text-white hover:bg-white/10 hover:text-white">
                    {cat.name}
                  </Button>
                </Link>
              ))}
              <AllCategoriesMenu categories={menuCategories} />
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full bg-background">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#141414] border-t border-white/10 py-12 mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 opacity-80">
              <Film className="w-5 h-5 text-primary" />
              <span className="font-display font-bold text-lg text-white">
                {settings?.siteName || "HDHUB4U"}
              </span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-gray-300 font-medium">
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
