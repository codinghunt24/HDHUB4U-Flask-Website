# HDHUB4U

HDHUB4U is a Hindi entertainment publishing site with public catalog pages and an admin area for managing posts, categories, imports, sitemap, analytics, and settings.

## Run & Operate

- Select **HDHUB4U Web** from the Run menu (or press Run). It starts the Express API on port 8080 and the Vite website on port 3000.
- `pnpm run typecheck` — typecheck the workspace.
- `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/hdhub4u run build` — create the frontend production build.
- `pnpm --filter @workspace/api-server run build` — build the API server.
- `pnpm --filter @workspace/db run push` — apply the development database schema.

The project uses the Replit-managed `DATABASE_URL` and `SESSION_SECRET` credentials. The public site is available even when the fresh database has no posts; add content through the admin area.

## Stack

- pnpm workspaces, Node.js 20, TypeScript, React 19, Vite, Tailwind CSS
- API: Express 5 with generated OpenAPI client hooks
- Database: PostgreSQL with Drizzle ORM

## Project layout

- `artifacts/hdhub4u` — React/Vite public site and admin interface.
- `artifacts/api-server` — Express API used by the site.
- `lib/api-spec/openapi.yaml` — source API contract.
- `lib/db` — database schema and Drizzle configuration.

## Notes

- The Vite development server proxies `/api` requests to the local Express server at port 8080 so the frontend and API run together in one workflow.
- The Vite configuration requires `PORT` and `BASE_PATH`; the configured Replit workflow supplies them automatically.
