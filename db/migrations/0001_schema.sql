-- ============================================================================
-- F1 infographic — core schema
-- Target: Supabase / PostgreSQL 15+
-- Idempotent: safe to re-run.
-- ============================================================================

create schema if not exists f1;
comment on schema f1 is 'Formula 1 reference data, session results and standings.';

-- ── Enums ───────────────────────────────────────────────────────────────────

do $$ begin
  create type f1.circuit_type as enum ('street', 'permanent', 'semi_permanent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type f1.race_status as enum ('scheduled', 'completed', 'cancelled', 'postponed');
exception when duplicate_object then null; end $$;

-- Ordered chronologically within a race weekend so `order by session_type` is useful.
do $$ begin
  create type f1.session_type as enum (
    'fp1', 'fp2', 'fp3', 'sprint_qualifying', 'sprint', 'qualifying', 'race'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type f1.session_status as enum ('scheduled', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ── Reference tables ────────────────────────────────────────────────────────

create table if not exists f1.seasons (
  year         smallint primary key check (year between 1950 and 2100),
  race_count   smallint,
  updated_at   timestamptz not null default now()
);

-- `id` is the slug the frontend already uses ("monaco", "lasvegas"), so the
-- page keeps its existing keys. ergast_circuit_id is the upstream join key.
create table if not exists f1.circuits (
  id                text primary key,
  ergast_circuit_id text unique,
  name              text not null,
  locality          text,
  country           text,
  flag_emoji        text,
  length_km         numeric(6,3),
  turns             smallint,
  circuit_type      f1.circuit_type,
  svg_path          text,
  lat               numeric(9,6),
  lng               numeric(9,6),
  updated_at        timestamptz not null default now()
);

create table if not exists f1.constructors (
  id          text primary key,             -- ergast constructorId
  name        text not null,
  nationality text,
  color       text check (color is null or color ~* '^#[0-9a-f]{6}$'),
  updated_at  timestamptz not null default now()
);

create table if not exists f1.drivers (
  id                    text primary key,   -- ergast driverId
  -- the key the single-file frontend renders by; disambiguates e.g. Michael
  -- Schumacher ("Schumacher") from Ralf Schumacher ("Ralf")
  display_key           text unique,
  code                  text,               -- 'VER'
  permanent_number      smallint,
  given_name            text,
  family_name           text not null,
  full_name             text generated always as
                          (trim(both ' ' from coalesce(given_name, '') || ' ' || family_name)) stored,
  nationality           text,
  date_of_birth         date,
  headshot_url          text,
  headshot_fallback_url text,
  updated_at            timestamptz not null default now()
);

create index if not exists drivers_family_name_idx on f1.drivers (lower(family_name));

-- A driver's team and car number are season-scoped, not driver-scoped. The old
-- single-file DRIVERS const conflated the two; this table separates them.
create table if not exists f1.driver_entries (
  season_year    smallint not null references f1.seasons(year) on delete cascade,
  driver_id      text     not null references f1.drivers(id)   on delete cascade,
  constructor_id text     not null references f1.constructors(id) on delete cascade,
  car_number     smallint,
  primary key (season_year, driver_id, constructor_id)
);

create index if not exists driver_entries_season_idx on f1.driver_entries (season_year);

-- ── Events ──────────────────────────────────────────────────────────────────

create table if not exists f1.races (
  id                bigint generated always as identity primary key,
  season_year       smallint not null references f1.seasons(year) on delete cascade,
  round             smallint not null check (round > 0),
  circuit_id        text     not null references f1.circuits(id),
  name              text     not null,          -- "Monaco GP"
  official_name     text,                       -- upstream raceName
  race_date         date,
  race_time         time,
  starts_at         timestamptz,
  date_label        text,                       -- display string, e.g. "5–7 Jun"
  scheduled_laps    smallint,
  is_sprint_weekend boolean  not null default false,
  status            f1.race_status not null default 'scheduled',
  wikipedia_url     text,
  updated_at        timestamptz not null default now(),
  unique (season_year, round)
);

create index if not exists races_circuit_idx on f1.races (circuit_id, season_year desc);
create index if not exists races_date_idx    on f1.races (race_date);

create table if not exists f1.sessions (
  id                bigint generated always as identity primary key,
  race_id           bigint not null references f1.races(id) on delete cascade,
  session_type      f1.session_type not null,
  starts_at         timestamptz,
  openf1_session_key integer unique,
  status            f1.session_status not null default 'scheduled',
  results_count     smallint not null default 0,
  updated_at        timestamptz not null default now(),
  unique (race_id, session_type)
);

create index if not exists sessions_race_idx on f1.sessions (race_id, session_type);

-- One row per driver per session. Columns are a superset across session types:
-- race/sprint use points/grid/laps_completed/status, qualifying uses q1..q3,
-- practice uses best_lap_ms. Nulls elsewhere.
create table if not exists f1.session_results (
  id                  bigint generated always as identity primary key,
  session_id          bigint not null references f1.sessions(id) on delete cascade,
  driver_id           text   not null references f1.drivers(id),
  constructor_id      text   references f1.constructors(id),
  position            smallint,
  position_text       text,                   -- 'R', 'D', 'W', 'NC' or the number
  car_number          smallint,
  grid                smallint,
  laps_completed      smallint,
  status              text,                   -- 'Finished', '+1 Lap', 'Collision'
  points              numeric(5,2) not null default 0,
  time_text           text,                   -- '1:23:06.802' as published
  time_ms             bigint,
  gap_text            text,                   -- '+2.974' / '+1 Lap'
  gap_ms              bigint,
  best_lap_ms         integer,                -- practice / sprint-shootout best
  q1_ms               integer,
  q2_ms               integer,
  q3_ms               integer,
  fastest_lap_ms      integer,
  fastest_lap_number  smallint,
  fastest_lap_rank    smallint,
  fastest_lap_kph     numeric(6,3),
  updated_at          timestamptz not null default now(),
  unique (session_id, driver_id)
);

create index if not exists session_results_session_pos_idx
  on f1.session_results (session_id, position nulls last);
create index if not exists session_results_driver_idx
  on f1.session_results (driver_id);

-- Heaviest table: one row per driver per lap (OpenF1, 2023+).
create table if not exists f1.lap_times (
  session_id  bigint   not null references f1.sessions(id) on delete cascade,
  driver_id   text     not null references f1.drivers(id),
  lap_number  smallint not null,
  lap_ms      integer,
  sector1_ms  integer,
  sector2_ms  integer,
  sector3_ms  integer,
  is_pit_out  boolean not null default false,
  is_pit_in   boolean not null default false,
  position    smallint,
  primary key (session_id, driver_id, lap_number)
);

create index if not exists lap_times_session_best_idx
  on f1.lap_times (session_id, lap_ms) where lap_ms is not null;

-- ── Standings (snapshot after each round) ───────────────────────────────────

create table if not exists f1.driver_standings (
  season_year    smallint not null references f1.seasons(year) on delete cascade,
  round          smallint not null,
  driver_id      text     not null references f1.drivers(id),
  constructor_id text     references f1.constructors(id),
  position       smallint,
  points         numeric(6,2) not null default 0,
  wins           smallint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (season_year, round, driver_id)
);

create table if not exists f1.constructor_standings (
  season_year    smallint not null references f1.seasons(year) on delete cascade,
  round          smallint not null,
  constructor_id text     not null references f1.constructors(id),
  position       smallint,
  points         numeric(6,2) not null default 0,
  wins           smallint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (season_year, round, constructor_id)
);

-- ── ETL bookkeeping ─────────────────────────────────────────────────────────

create table if not exists f1.ingest_runs (
  id           bigint generated always as identity primary key,
  source       text not null,               -- 'jolpica' | 'openf1'
  scope        text not null,               -- '2026:results', '2026:r16:laps', ...
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running','ok','error')),
  rows_written integer not null default 0,
  error        text
);

create index if not exists ingest_runs_recent_idx on f1.ingest_runs (started_at desc);

-- ── updated_at triggers ─────────────────────────────────────────────────────

create or replace function f1.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'seasons','circuits','constructors','drivers','races','sessions',
    'session_results','driver_standings','constructor_standings'
  ] loop
    execute format('drop trigger if exists touch_%1$s on f1.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on f1.%1$s
         for each row execute function f1.touch_updated_at()', t);
  end loop;
end $$;
