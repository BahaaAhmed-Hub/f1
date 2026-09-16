-- ============================================================================
-- Row Level Security.
--
-- The site is public and read-only; every write goes through the ETL, which
-- authenticates with the service-role key and bypasses RLS entirely.
-- So: anon/authenticated get SELECT on everything, and nothing else.
-- ============================================================================

grant usage on schema f1 to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'seasons','circuits','constructors','drivers','driver_entries',
    'races','sessions','session_results','lap_times',
    'driver_standings','constructor_standings','ingest_runs'
  ] loop
    execute format('alter table f1.%I enable row level security', t);
    execute format('drop policy if exists public_read on f1.%I', t);
    execute format('revoke all on f1.%I from anon, authenticated', t);
  end loop;
end $$;

-- Public read on the data tables.
do $$
declare t text;
begin
  foreach t in array array[
    'seasons','circuits','constructors','drivers','driver_entries',
    'races','sessions','session_results','lap_times',
    'driver_standings','constructor_standings'
  ] loop
    execute format('grant select on f1.%I to anon, authenticated', t);
    execute format(
      'create policy public_read on f1.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ingest_runs stays private: RLS is on with no policy, so anon sees nothing
-- even if the table is ever granted by accident.

-- The read views in 0002 are security_invoker, so they inherit the policies above.
grant select on
  public.f1_race_calendar,
  public.f1_session_results,
  public.f1_race_podiums,
  public.f1_driver_standings,
  public.f1_constructor_standings,
  public.f1_driver_standings_latest,
  public.f1_constructor_standings_latest,
  public.f1_session_lap_summary
to anon, authenticated;

-- Future tables in f1 must not leak by default.
alter default privileges in schema f1 revoke all on tables from anon, authenticated;
