# Postgres databases

The initial schemas target two separate databases:

| Database            | Tables                     | Purpose                                                                         |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `user_content`      | `content_owners`, `shares` | Anonymous owners and their saved responses, including a snapshot of the reading |
| `daily_reflections` | `daily_reflections`        | One reading per calendar date                                                   |

## Local Docker setup

Start Docker Desktop in Linux-container mode, then run from the repository root:

```powershell
node scripts/setup-local-databases.mjs
docker compose --env-file .env.database up -d --wait
```

This creates two Postgres 17 containers with separate credentials and persistent named volumes. Ports bind only to localhost: `user_content` on `5433`, and `daily_reflections` on `5434`. Initial schemas run automatically when each volume is first created. The setup script preserves existing credentials, and `.env.database` is ignored by Git.

Connection URLs (replace each password placeholder with the corresponding value in `.env.database`):

```dotenv
USER_CONTENT_DATABASE_URL=postgresql://user_content_admin:<USER_CONTENT_DB_PASSWORD>@127.0.0.1:5433/user_content
DAILY_REFLECTIONS_DATABASE_URL=postgresql://daily_reflections_admin:<DAILY_REFLECTIONS_DB_PASSWORD>@127.0.0.1:5434/daily_reflections
```

These are local administration credentials. Application integration is a separate step; the app still uses in-memory shares and a fictional reading fixture.

Inspect or stop the databases:

```powershell
docker compose --env-file .env.database ps
docker compose --env-file .env.database exec user-content-db psql -U user_content_admin -d user_content
docker compose --env-file .env.database exec daily-reflections-db psql -U daily_reflections_admin -d daily_reflections
docker compose --env-file .env.database down
```

Stopping containers preserves data. Do not add `--volumes` to `down` unless you intend to permanently delete both databases. Changing SQL files or passwords does not modify an already initialized volume; future schema changes need new migrations.

## Manual schema installation

For separately provisioned empty databases, apply each SQL file once. With `psql` installed and connection URLs set in your shell:

```powershell
psql --dbname "$env:USER_CONTENT_DATABASE_URL" --set ON_ERROR_STOP=1 --file database/user-content/001-initial.sql
psql --dbname "$env:DAILY_REFLECTIONS_DATABASE_URL" --set ON_ERROR_STOP=1 --file database/daily-reflections/001-initial.sql
```

These SQL scripts create tables, constraints, an owner-history index, and an automatic reading update timestamp. They do not seed readings or change the application's current in-memory storage.

Keep both connection URLs server-only in `.env.local`; never use a `NEXT_PUBLIC_` prefix. Use separate database roles and credentials for each database. The reading connection used by the application should have read-only access; use a separate publishing role for editing readings. Database provisioning must restrict network access and public role privileges before real content is stored.

The app must continue checking signed-session ownership on every private share query. Deleting an owner cascades to their shares; cookie loss or expiry does not delete records. Public-link expiry remains an application rule (currently seven days from saving). Database persistence does not add login, account recovery, or a deletion endpoint.

Reading IDs are references across databases without foreign keys. Each share retains the reading's ID, date, title, and body so historical shares survive reading edits or removal. No real readings or user content are included in these migrations.
