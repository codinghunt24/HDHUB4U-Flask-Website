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
