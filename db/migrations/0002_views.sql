-- ============================================================================
-- Read API for the frontend.
--
-- Views live in `public` (not `f1`) so the anon key can reach them over
-- PostgREST without changing Supabase's "Exposed schemas" setting.
-- security_invoker = true makes them respect the RLS policies in 0003.
-- ============================================================================

-- 2026 calendar, plus everything a race card needs to render before any
-- session data is loaded.
create or replace view public.f1_race_calendar
with (security_invoker = true) as
select
  r.id                as race_id,
  r.season_year,
  r.round,
  r.name,
  r.official_name,
  r.race_date,
  r.starts_at,
  r.date_label,
  r.scheduled_laps,
  r.is_sprint_weekend,
  r.status,
  c.id                as circuit_id,
  c.name              as circuit_name,
  c.locality,
  c.country,
  c.flag_emoji,
  c.length_km,
  c.turns,
  c.circuit_type,
  c.svg_path,
  -- true once the race weekend is in the past and we hold classified results
  exists (
    select 1 from f1.sessions s
     where s.race_id = r.id and s.session_type = 'race' and s.results_count > 0
  ) as has_results
from f1.races r
join f1.circuits c on c.id = r.circuit_id;

-- Denormalised classification. One row per driver per session, carrying the
-- display fields (family name, team colour, headshot) the page renders.
create or replace view public.f1_session_results
with (security_invoker = true) as
select
  r.season_year,
  r.round,
  r.circuit_id,
  s.id             as session_id,
  s.session_type,
  s.status         as session_status,
  sr.position,
  sr.position_text,
  sr.car_number,
  sr.grid,
  sr.laps_completed,
  sr.status        as result_status,
  sr.points,
  sr.time_text,
  sr.time_ms,
  sr.gap_text,
  sr.gap_ms,
  sr.best_lap_ms,
  sr.q1_ms, sr.q2_ms, sr.q3_ms,
  sr.fastest_lap_ms,
  sr.fastest_lap_rank,
  d.id             as driver_id,
  d.display_key,
  d.given_name,
  d.family_name,
  d.full_name,
  d.code           as driver_code,
  d.headshot_url,
  d.headshot_fallback_url,
  ct.id            as constructor_id,
  ct.name          as constructor_name,
  ct.color         as constructor_color
from f1.session_results sr
join f1.sessions s  on s.id = sr.session_id
join f1.races    r  on r.id = s.race_id
join f1.drivers  d  on d.id = sr.driver_id
left join f1.constructors ct on ct.id = sr.constructor_id;

-- Replaces the HISTORY const: top 3 of every race, every season.
create or replace view public.f1_race_podiums
with (security_invoker = true) as
select
  season_year,
  round,
  circuit_id,
  position,
  driver_id,
  display_key,
  family_name,
  full_name,
  constructor_id,
  constructor_name,
  constructor_color,
  time_text,
  gap_text,
  points
from public.f1_session_results
where session_type = 'race'
  and position between 1 and 3;

-- Championship state after the most recent scored round of each season.
create or replace view public.f1_driver_standings
with (security_invoker = true) as
select
  ds.season_year,
  ds.round,
  ds.position,
  ds.points,
  ds.wins,
  d.id   as driver_id,
  d.display_key,
  d.family_name,
  d.full_name,
  d.code as driver_code,
  d.headshot_url,
  ct.id   as constructor_id,
  ct.name as constructor_name,
  ct.color as constructor_color
from f1.driver_standings ds
join f1.drivers d on d.id = ds.driver_id
left join f1.constructors ct on ct.id = ds.constructor_id;

create or replace view public.f1_constructor_standings
with (security_invoker = true) as
select
  cs.season_year,
  cs.round,
  cs.position,
  cs.points,
  cs.wins,
  ct.id    as constructor_id,
  ct.name  as constructor_name,
  ct.color as constructor_color
from f1.constructor_standings cs
join f1.constructors ct on ct.id = cs.constructor_id;

-- Latest standings per season, so the page can query without knowing the round.
create or replace view public.f1_driver_standings_latest
with (security_invoker = true) as
select s.*
from public.f1_driver_standings s
join (
  select season_year, max(round) as round
  from f1.driver_standings group by season_year
) last on last.season_year = s.season_year and last.round = s.round;

create or replace view public.f1_constructor_standings_latest
with (security_invoker = true) as
select s.*
from public.f1_constructor_standings s
join (
  select season_year, max(round) as round
  from f1.constructor_standings group by season_year
) last on last.season_year = s.season_year and last.round = s.round;

-- Per-session lap pace summary, for practice charts without shipping every lap.
create or replace view public.f1_session_lap_summary
with (security_invoker = true) as
select
  lt.session_id,
  lt.driver_id,
  d.family_name,
  count(*)                                as laps,
  min(lt.lap_ms) filter (where lt.lap_ms is not null) as best_lap_ms,
  round(avg(lt.lap_ms) filter (
    where lt.lap_ms is not null and not lt.is_pit_in and not lt.is_pit_out
  ))                                      as avg_clean_lap_ms
from f1.lap_times lt
join f1.drivers d on d.id = lt.driver_id
group by lt.session_id, lt.driver_id, d.family_name;
