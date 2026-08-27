import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set to run database migrations");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

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
