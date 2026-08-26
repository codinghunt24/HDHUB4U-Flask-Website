import { PublicLayout } from "@/components/layout/public-layout";

export default function PolicyPage({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto py-12 prose prose-lg prose-invert prose-headings:font-display prose-headings:font-bold prose-primary">
        <h1>{title}</h1>
        {children}
      </div>
    </PublicLayout>
  );
}
