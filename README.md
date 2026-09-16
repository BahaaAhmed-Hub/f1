# F1 Season Infographic

A single-page infographic for the Formula 1 season: all 24 Grand Prix with
circuit layouts, session results and history back to 2000 — backed by Supabase.

`index.html` is still one self-contained file. It reads from Supabase over
PostgREST, and falls back to the upstream APIs when no database is configured.

```
Jolpica (Ergast)  ─┐
                   ├─► etl/ (service-role key) ──► Supabase Postgres
OpenF1 (2023+)    ─┘                                    │  RLS: anon read-only
                                                        ▼
                     GitHub Actions, after each race    index.html (anon key)
```

## Setup

### 1. Create the database

In the Supabase SQL editor, run in order:

```
db/migrations/0001_schema.sql     tables, enums, indexes
db/migrations/0002_views.sql      the public read API
db/migrations/0003_policies.sql   RLS — anon gets SELECT and nothing else
db/seed/*.sql                     circuits, drivers, teams, 2026 calendar
```

Or with `psql`:

```bash
for f in db/migrations/*.sql db/seed/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Both migrations and seed are idempotent, so re-running is safe.

### 2. Load the data

```bash
cp etl/.env.example .env      # fill in SUPABASE_URL and the service-role key
npm install

npm run ingest -- --history   # one-off: every season from 2000 (slow)
npm run ingest                # year to date for the current season
```

| Flag | Effect |
| --- | --- |
| `--season 2025` | One season |
| `--round 16` | A single round |
| `--history` | Every season from 2000 |
| `--no-practice` | Skip OpenF1 entirely |
| `--no-laps` | Practice classifications without per-lap rows |
| `--dry-run` | Report what would run, write nothing |

### 3. Point the page at the database

In `index.html`, fill in the `SUPABASE` block near the top of the script:

```js
const SUPABASE = {
  url:     'https://YOUR-PROJECT-REF.supabase.co',
  anonKey: 'YOUR-ANON-KEY',
};
```

The **anon** key is safe to publish — RLS grants it `SELECT` only. The
**service-role** key bypasses RLS and must stay in `.env` and CI secrets.

### 4. Keep it updated after each race

`.github/workflows/ingest.yml` runs the ingest Sunday 20:00 and 23:00 UTC and
Monday 06:00 UTC, which covers every slot on the calendar including the
Saturday-night Las Vegas race. Add two repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

You can also trigger it by hand from the Actions tab, with inputs for a single
season, a single round, or a full history backfill.

## Development

```bash
npm test              # ETL unit + HTTP-fixture tests
npm run db:check      # applies every .sql to an in-memory Postgres (PGlite)
npm run test:browser  # drives index.html in Chromium, both data paths
npm run test:all      # all three

npm run seed:gen      # regenerate db/seed from the consts in index.html
```

`npm run db:check` catches SQL errors without a Supabase project: it applies the
migrations and seed to PGlite, re-applies the migrations to prove idempotency,
and queries every view.

## Layout

```
index.html                 the page — single file, no build step
db/migrations/             schema, views, RLS
db/seed/                   generated reference data
etl/src/sources/           Jolpica and OpenF1 clients
etl/src/tasks/             schedule, results, standings, practice
etl/src/mappings.js        slug ↔ Ergast id mappings, team colours
test/smoke.mjs             browser test
docs/DATA-MODEL.md         schema reference
```

## Data sources

- [Jolpica-F1](https://github.com/jolpica/jolpica-f1) — the maintained Ergast successor
- [OpenF1](https://openf1.org) — lap-level timing, 2023 onwards
- Track layouts: MasterPlay007/F1-Track-Layouts-SVG
- Headshots: formula1.com and Wikimedia Commons
