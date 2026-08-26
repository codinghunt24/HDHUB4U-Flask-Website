import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PostPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PostPagination({
  page,
  totalPages,
  onPageChange,
}: PostPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Posts pagination"
      className="mt-10 flex items-center justify-center gap-3"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="border-white/20 bg-[#141414] text-white hover:bg-white/10 hover:text-white"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Previous
      </Button>

      <span className="text-sm text-gray-300" aria-live="polite">
        Page {page} of {totalPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="border-white/20 bg-[#141414] text-white hover:bg-white/10 hover:text-white"
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </nav>
  );
}