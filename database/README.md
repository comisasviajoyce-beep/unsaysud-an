# Unsay Sud-an database foundation

## Target setup

- Frontend: Vercel (Vite static build).
- API runtime: Vercel Node.js Functions.
- Relational database: MySQL hosted separately; Railway MySQL is the selected starting provider.
- Driver: `mysql2/promise`.
- Connection lifecycle: a module-scoped pool attached to Vercel Fluid Compute with `attachDatabasePool`.

The MySQL connection is server-only. Never add database credentials to `VITE_*` variables or browser code.

## Environment variables

The application accepts the plan's standard names:

- `DB_HOST`
- `DB_PORT` (defaults to `3306`)
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL` (set to `true` only when the database provider requires TLS)
- `DB_CONNECTION_LIMIT` (defaults to `3`; allowed range is 2–10)

For Railway's Vercel integration, the connector also recognizes `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, and `MYSQLDATABASE`. The standard `DB_*` values take precedence when both are present.

Do not commit a real `.env` file. Configure values in Vercel Project Settings → Environment Variables. Keep Preview and Production credentials separate where possible.

## Health check

Vercel Function endpoint:

`GET /api/health/database`

- HTTP 200 means `SELECT 1` succeeded.
- HTTP 503 with `database: not_configured` means one or more required environment variables are absent.
- HTTP 503 with `database: unavailable` means the configured database could not be reached.

The public response intentionally omits connection strings, usernames, passwords, hostnames, and raw provider errors. Inspect Vercel Function logs for the server-side error.

The existing standalone Express process is still the local development entry point. The health function above is a Vercel API route; test it on Vercel or with `vercel dev`, not by assuming it is mounted in the standalone Express process.

## First migration

`migrations/0001_create_schema_migrations.sql` creates only the migration-history table. It does not create business tables, seed data, or modify JSON files.

Apply it manually to a new development database using the provider's SQL console or a trusted MySQL client. Confirm with:

```sql
SHOW TABLES LIKE 'schema_migrations';
DESCRIBE schema_migrations;
```

Do not run it against a production database until a backup and target database have been confirmed.

## JSON migration / dry-run policy

No application records are migrated in this phase. Preserve all existing JSON files and uploads as read-only source backups.

Before a later import:

1. Export a backup of the source JSON files and uploaded assets.
2. Build and review an ERD and field mapping from the actual TypeScript interfaces and JSON records.
3. Run the importer against a disposable/staging database in dry-run mode; report planned inserts, updates, skipped rows, and validation errors without writing rows.
4. Run the import with stable source IDs and idempotent upserts only after review.
5. Reconcile row counts, key relationships, and monetary totals against the JSON source.
6. Keep the original JSON backup until acceptance and a restore test are complete.

Business tables and the executable import tool are deliberately deferred. The entity list in the approved development plan is preliminary, not a final schema.

## Vercel deployment note

This repository currently starts its Express application from `server.ts` and mounts Vite middleware in that process. Vercel does not automatically run that standalone listener just because the file exists. This foundation adds a Vercel database health function only; the existing Express API routes still need a separate Vercel-compatible adapter/refactor before the full application API is available on Vercel. Do not claim the complete app backend is deployed until that is implemented and tested.

Place the Vercel Function region close to the Railway database region to reduce round-trip latency. Enable Railway backups before storing production records. Railway's standard MySQL template is a single-node service; evaluate its high-availability option and backup/restore settings before production use.
