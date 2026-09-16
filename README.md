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

The page is already wired to the project at
`https://whedlcpdbzvcynvpwgnn.supabase.co` using its **publishable** key, which
is safe to commit — RLS grants it `SELECT` and nothing else.

### 1. Create the schema

Paste [`db/bundle.sql`](db/bundle.sql) into the Supabase **SQL editor** and run
it once. It contains every migration and seed file in order, is idempotent, and
ends by reloading the PostgREST schema cache.

It also grants `service_role` access to the `f1` schema and adds `f1` to
PostgREST's exposed schemas — neither is implied by creating the tables, and
the ETL cannot write a single row without both.

Or, with a Supabase personal access token:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run db:migrate
```

Optionally also run `db/seed/optional/0016_circuit_layouts.sql` (109 KB) to
store the SVG track layouts. The page renders them from its own embedded copy,
so this is only needed if you want them queryable.

With `psql` instead:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/bundle.sql
```

Check it landed:

```bash
npm run db:verify     # queries the live project the same way the page does
```

### 2. Load the data

The ingest writes, so it needs the **secret** key (`sb_secret_…`, Supabase
Settings → API). That key bypasses RLS and must never go in `index.html`.

```bash
cp etl/.env.example .env      # fill in SUPABASE_SERVICE_ROLE_KEY
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

### 3. Keep it updated after each race

`.github/workflows/ingest.yml` runs Sunday 20:00 and 23:00 UTC and Monday 06:00
UTC, covering every slot on the calendar including the Saturday-night Las Vegas
race. Add two repository secrets under Settings → Secrets → Actions:

- `SUPABASE_URL` — `https://whedlcpdbzvcynvpwgnn.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — the secret key

You can also trigger it by hand from the Actions tab, with inputs for a single
season, a single round, or a full history backfill.

Until the schema exists and data is loaded, the page falls back to the upstream
APIs, so it keeps working throughout.

## Development

```bash
npm test              # ETL unit + HTTP-fixture tests
npm run db:check      # applies every .sql to an in-memory Postgres (PGlite)
npm run db:verify     # checks the live project over the REST API
npm run test:browser  # drives index.html in Chromium, both data paths
npm run test:all      # all three

npm run seed:gen      # regenerate db/seed from the consts in index.html
npm run db:bundle     # regenerate db/bundle.sql after changing any .sql
npm run db:migrate    # apply db/bundle.sql via the Supabase Management API
```

`npm run db:check` catches SQL errors without a Supabase project: it applies the
migrations and seed to PGlite, re-applies the migrations to prove idempotency,
and queries every view.

## Layout

```
index.html                 the page — single file, no build step
db/bundle.sql              all of the below, concatenated for one-paste setup
db/migrations/             schema, views, RLS, API access
db/seed/                   generated reference data
db/seed/optional/          SVG track layouts (large, not required)
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
