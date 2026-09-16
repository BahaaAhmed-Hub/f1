# Data model

All tables live in the `f1` schema. The frontend never touches them directly —
it reads the `public.f1_*` views, which are `security_invoker` and therefore
subject to the same RLS policies.

```
seasons ──┬── races ──── sessions ──┬── session_results
          │     │                   └── lap_times
          │     └── circuits
          ├── driver_entries ── drivers
          ├── driver_standings
          └── constructor_standings ── constructors
```

## Reference tables

| Table | Key | Notes |
| --- | --- | --- |
| `seasons` | `year` | Every season the site knows about (2000–2026). |
| `circuits` | `id` | `id` is the slug the page already used (`monaco`, `lasvegas`). `ergast_circuit_id` is the upstream join key. Holds the SVG track path, flag emoji, length and turn count. |
| `constructors` | `id` | Ergast `constructorId`. **Livery colour lives here**, not on the driver. |
| `drivers` | `id` | Ergast `driverId`. `display_key` is the short label the page renders; it is unique, which is why the three Schumachers and two Verstappens have explicit overrides in `etl/src/mappings.js`. |
| `driver_entries` | `(season_year, driver_id, constructor_id)` | Team and car number are **season-scoped**. A driver who changed teams has one row per season. |

## Event tables

**`races`** — one row per Grand Prix per season, unique on `(season_year, round)`.
Carries both upstream fields (`race_date`, `starts_at`, `official_name`) and the
display fields the infographic needs (`date_label`, `scheduled_laps`,
`is_sprint_weekend`). `status` is `scheduled | completed | cancelled | postponed`.

**`sessions`** — one row per session per race, unique on `(race_id, session_type)`.
`session_type` is ordered chronologically as an enum, so `order by session_type`
gives FP1 → FP2 → FP3 → sprint qualifying → sprint → qualifying → race.
`openf1_session_key` links back to OpenF1. `results_count` lets the calendar view
answer "does this weekend have data?" without touching the results table.

**`session_results`** — one row per driver per session. The columns are a union
across session types, so a single view can render any of them:

| Session type | Columns that carry meaning |
| --- | --- |
| `race`, `sprint` | `position`, `grid`, `laps_completed`, `status`, `points`, `time_ms`, `gap_ms`, `fastest_lap_*` |
| `qualifying`, `sprint_qualifying` | `position`, `q1_ms`, `q2_ms`, `q3_ms`, `best_lap_ms` |
| `fp1`, `fp2`, `fp3` | `position`, `best_lap_ms`, `gap_ms` |

**Times are integer milliseconds.** Upstream publishes strings in several shapes
(`1:23:06.802`, `+2.974`, `23.456`); `etl/src/time.js` normalises them, and the
page formats them back with `fmtMs`.

One subtlety worth knowing: Ergast publishes the **leader's total race time** and
**everyone else's gap** in the same field. This schema keeps both — `time_ms` is
always an absolute race time and `gap_ms` is always a gap to the leader (`0` for
the winner, `null` for a retirement). `time_text` and `gap_text` preserve the
strings as published, for display.

**`lap_times`** — one row per driver per lap, from OpenF1 (2023 onwards only).
The largest table by far. Skip it with `npm run ingest -- --no-laps` if you only
want practice classifications.

## Standings

`driver_standings` and `constructor_standings` are snapshots keyed by
`(season_year, round, …)`. Storing every round rather than just the latest is what
makes title-fight progression queryable:

```sql
select round, points
  from f1.driver_standings
 where season_year = 2026 and driver_id = 'russell'
 order by round;
```

## Read views

| View | Purpose |
| --- | --- |
| `f1_race_calendar` | Calendar plus circuit detail and a `has_results` flag. |
| `f1_session_results` | Denormalised classification with driver, team and headshot fields — what the race cards render. |
| `f1_race_podiums` | Top 3 of every race, every season. Replaces the old `HISTORY` const. |
| `f1_driver_standings` / `f1_constructor_standings` | Standings joined to names and colours. |
| `*_latest` | The same, filtered to each season's most recent round. |
| `f1_session_lap_summary` | Per-driver lap count, best lap and average clean lap — pace charts without shipping every lap. |

## Security

`anon` and `authenticated` get `SELECT` on the data tables and views, and nothing
else. `ingest_runs` has RLS enabled with **no policy**, so it stays private. The
ETL authenticates with the service-role key, which bypasses RLS — that key must
never appear in `index.html`.
