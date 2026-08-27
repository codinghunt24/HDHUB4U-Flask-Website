import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const appMigrationsTable = pgTable("app_migrations", {
  name: text("name").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const categoriesTable = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("categories_slug_unique").on(table.slug)],
);

export const postsTable = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    titleSource: text("title_source").notNull().default("manual"),
    sourceTitle: text("source_title"),
    detectedTitle: text("detected_title"),
    titleMatchStatus: text("title_match_status")
      .notNull()
      .default("unmatched"),
    titleMatchConfidence: integer("title_match_confidence"),
    titleMatchType: text("title_match_type"),
    titleMatchYear: integer("title_match_year"),
    tmdbId: integer("tmdb_id"),
    tmdbMediaType: text("tmdb_media_type"),
    tmdbMetadata: jsonb("tmdb_metadata").$type<Record<string, unknown> | null>(),
    tmdbEnrichmentStatus: text("tmdb_enrichment_status")
      .notNull()
      .default("pending"),
    tmdbEnrichedAt: timestamp("tmdb_enriched_at", { withTimezone: true }),
    slug: text("slug").notNull(),
    // App Storage object paths only. Public API responses translate these to
    // same-origin media URLs and never expose the original remote image URL.
    thumbnailUrl: text("thumbnail_url").notNull(),
    sourceImageUrls: jsonb("source_image_urls").$type<string[] | null>(),
    sourceImagesRefreshedAt: timestamp("source_images_refreshed_at", {
      withTimezone: true,
    }),
    excerpt: text("excerpt").notNull().default(""),
    sourceUrl: text("source_url"),
    sourceDomain: text("source_domain").notNull().default("manual"),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    published: boolean("published").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("posts_slug_unique").on(table.slug),
    uniqueIndex("posts_source_url_unique").on(table.sourceUrl),
  ],
);

export const settingsTable = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  siteName: text("site_name").notNull().default("HDHUB4U"),
  siteDescription: text("site_description")
    .notNull()
    .default("Latest entertainment updates and curated editorial posts."),
  analyticsId: text("analytics_id"),
  contactEmail: text("contact_email").notNull().default("contact@hdhub4u.tech"),
  tmdbApiKeyEncrypted: text("tmdb_api_key_encrypted"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const importRunsTable = pgTable("import_runs", {
  id: serial("id").primaryKey(),
  sourceUrl: text("source_url").notNull(),
  imported: integer("imported").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminSessionsTable = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});