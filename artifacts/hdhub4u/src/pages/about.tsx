import { PublicLayout } from "@/components/layout/public-layout";

export default function AboutPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto py-12 prose prose-lg prose-invert prose-headings:font-display prose-headings:font-bold prose-primary">
        <h1>About Us</h1>
        <p>
          Welcome to our editorial catalog. We are dedicated to providing the latest, most accurate updates and listings for entertainment content.
        </p>
        <p>
          Our platform aggregates metadata, structured information, and reviews to help you discover the perfect content to see. We operate as an informational catalog and metadata index.
        </p>
        <h2>Our Mission</h2>
        <p>
          To create the fastest, cleanest, and most user-friendly interface for discovering regional and international entertainment updates.
        </p>
      </div>
    </PublicLayout>
  );
}
