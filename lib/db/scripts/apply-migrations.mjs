import pg from "pg";
import {
  getPrimaryTmdbGenre,
  normalizeCategorySlug,
} from "../src/tmdb-category.mjs";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set to run database migrations");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const syncTmdbPrimaryCategories = async () => {
  const { rows } = await client.query(`
    SELECT id, tmdb_metadata
    FROM posts
    WHERE tmdb_enrichment_status = 'ready'
  `);
  const categoryIds = new Map();

  for (const row of rows) {
    const genre = getPrimaryTmdbGenre(row.tmdb_metadata);
    const slug = genre ? normalizeCategorySlug(genre) : "";
    if (!genre || !slug) continue;

    let categoryId = categoryIds.get(slug);
    if (!categoryId) {
      const { rows: categoryRows } = await client.query(
        `
          INSERT INTO categories (name, slug)
          VALUES ($1, $2)
          ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
          RETURNING id
        `,
        [genre, slug],
      );
      categoryId = categoryRows[0]?.id;
      if (!categoryId) {
        throw new Error(`Could not resolve TMDB category "${genre}"`);
      }
      categoryIds.set(slug, categoryId);
    }

    await client.query(
      `
        UPDATE posts
        SET category_id = $1
        WHERE id = $2
          AND category_id IS DISTINCT FROM $1
      `,
      [categoryId, row.id],
    );
  }

  const { rows: categoryRows } = await client.query(
    "SELECT id, name, slug FROM categories",
  );
  const categorySlugs = new Set(categoryRows.map((category) => category.slug));
  for (const category of categoryRows) {
    const canonicalSlug = normalizeCategorySlug(category.name);
    if (
      !canonicalSlug ||
      category.slug === canonicalSlug ||
      !categorySlugs.has(canonicalSlug)
    ) {
      continue;
    }
    await client.query(
      `
        DELETE FROM categories
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1 FROM posts WHERE posts.category_id = categories.id
          )
      `,
      [category.id],
    );
  }
};

try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationName = "20260826_safe_post_title_source";
  const { rowCount } = await client.query(
    "SELECT 1 FROM app_migrations WHERE name = $1",
    [migrationName],
  );

  if (rowCount === 0) {
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_source text",
    );
    await client.query(
      "UPDATE posts SET title_source = 'manual' WHERE title_source IS NULL OR title_source = 'auto'",
    );
    await client.query(
      "ALTER TABLE posts ALTER COLUMN title_source SET DEFAULT 'manual'",
    );
    await client.query(
      "ALTER TABLE posts ALTER COLUMN title_source SET NOT NULL",
    );
    await client.query(
      "INSERT INTO app_migrations (name) VALUES ($1)",
      [migrationName],
    );
    console.log(`Applied database migration: ${migrationName}`);
  } else {
    console.log(`Database migration already applied: ${migrationName}`);
  }

  const excerptMigrationName = "20260827_clean_importer_excerpts";
  const { rowCount: excerptMigrationCount } = await client.query(
    "SELECT 1 FROM app_migrations WHERE name = $1",
    [excerptMigrationName],
  );

  if (excerptMigrationCount === 0) {
    await client.query(`
      UPDATE posts
      SET excerpt = CONCAT(
        'Explore ',
        title,
        ' and view its release details and authorized source information.'
      )
      WHERE excerpt LIKE 'Imported listing from %. Review and edit before republishing.'
    `);
    await client.query(
      "INSERT INTO app_migrations (name) VALUES ($1)",
      [excerptMigrationName],
    );
    console.log(`Applied database migration: ${excerptMigrationName}`);
  } else {
    console.log(`Database migration already applied: ${excerptMigrationName}`);
  }

  const tmdbApiKeyMigrationName = "20260827_add_tmdb_api_key";
  const { rowCount: tmdbApiKeyMigrationCount } = await client.query(
    "SELECT 1 FROM app_migrations WHERE name = $1",
    [tmdbApiKeyMigrationName],
  );

  if (tmdbApiKeyMigrationCount === 0) {
    await client.query(
      "ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS tmdb_api_key_encrypted text",
    );
    await client.query(
      "INSERT INTO app_migrations (name) VALUES ($1)",
      [tmdbApiKeyMigrationName],
    );
    console.log(`Applied database migration: ${tmdbApiKeyMigrationName}`);
  } else {
    console.log(`Database migration already applied: ${tmdbApiKeyMigrationName}`);
  }

  const titleDetectionMigrationName = "20260827_add_title_detection_fields";
  const { rowCount: titleDetectionMigrationCount } = await client.query(
    "SELECT 1 FROM app_migrations WHERE name = $1",
    [titleDetectionMigrationName],
  );

  if (titleDetectionMigrationCount === 0) {
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_title text",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS detected_title text",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_match_status text NOT NULL DEFAULT 'unmatched'",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_match_confidence integer",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_match_type text",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_match_year integer",
    );
    await client.query(
      "INSERT INTO app_migrations (name) VALUES ($1)",
      [titleDetectionMigrationName],
    );
    console.log(`Applied database migration: ${titleDetectionMigrationName}`);
  } else {
    console.log(
      `Database migration already applied: ${titleDetectionMigrationName}`,
    );
  }

  const tmdbMetadataMigrationName = "20260827_add_tmdb_post_metadata";
  const { rowCount: tmdbMetadataMigrationCount } = await client.query(
    "SELECT 1 FROM app_migrations WHERE name = $1",
    [tmdbMetadataMigrationName],
  );

  if (tmdbMetadataMigrationCount === 0) {
    await client.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS tmdb_id integer");
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS tmdb_media_type text",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS tmdb_metadata jsonb",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS tmdb_enrichment_status text NOT NULL DEFAULT 'pending'",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS tmdb_enriched_at timestamptz",
    );
    await client.query(
      "INSERT INTO app_migrations (name) VALUES ($1)",
      [tmdbMetadataMigrationName],
    );
    console.log(`Applied database migration: ${tmdbMetadataMigrationName}`);
  } else {
    console.log(
      `Database migration already applied: ${tmdbMetadataMigrationName}`,
    );
  }

  const tmdbCategoryReconciliationMigrationName =
    "20260827_reconcile_tmdb_primary_categories";
  const { rowCount: tmdbCategoryReconciliationMigrationCount } =
    await client.query(
      "SELECT 1 FROM app_migrations WHERE name = $1",
      [tmdbCategoryReconciliationMigrationName],
    );

  if (tmdbCategoryReconciliationMigrationCount === 0) {
    await syncTmdbPrimaryCategories();
    await client.query(
      "INSERT INTO app_migrations (name) VALUES ($1)",
      [tmdbCategoryReconciliationMigrationName],
    );
    console.log(
      `Applied database migration: ${tmdbCategoryReconciliationMigrationName}`,
    );
  } else {
    console.log(
      `Database migration already applied: ${tmdbCategoryReconciliationMigrationName}`,
    );
  }

  const sourceImageGalleryMigrationName =
    "20260827_add_source_image_gallery";
  const { rowCount: sourceImageGalleryMigrationCount } = await client.query(
    "SELECT 1 FROM app_migrations WHERE name = $1",
    [sourceImageGalleryMigrationName],
  );

  if (sourceImageGalleryMigrationCount === 0) {
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_image_urls jsonb",
    );
    await client.query(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_images_refreshed_at timestamptz",
    );
    await client.query(
      "INSERT INTO app_migrations (name) VALUES ($1)",
      [sourceImageGalleryMigrationName],
    );
    console.log(
      `Applied database migration: ${sourceImageGalleryMigrationName}`,
    );
  } else {
    console.log(
      `Database migration already applied: ${sourceImageGalleryMigrationName}`,
    );
  }

  const { rows: titleSourceCounts } = await client.query(
    "SELECT title_source, count(*)::integer AS count FROM posts GROUP BY title_source ORDER BY title_source",
  );
  console.log(`Post title sources: ${JSON.stringify(titleSourceCounts)}`);

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
