-- ============================================================================
-- API access for the ETL.
--
-- Two things are needed before the loader can write a single row, and neither
-- is implied by creating the tables:
--
--   1. service_role needs privileges on the f1 schema. Supabase's default
--      grants cover `public`, not schemas you add yourself.
--   2. PostgREST only serves schemas listed in pgrst.db_schemas, which
--      defaults to "public, graphql_public". Without f1 there, every request
--      is rejected before it reaches a table.
-- ============================================================================

-- ── 1. Privileges ───────────────────────────────────────────────────────────

grant usage on schema f1 to service_role, postgres;

grant all privileges on all tables    in schema f1 to service_role, postgres;
grant all privileges on all sequences in schema f1 to service_role, postgres;
grant all privileges on all routines  in schema f1 to service_role, postgres;

-- Tables added by later migrations inherit the same access.
alter default privileges in schema f1 grant all on tables    to service_role, postgres;
alter default privileges in schema f1 grant all on sequences to service_role, postgres;

-- ── 2. Expose the schema over PostgREST ─────────────────────────────────────

-- Appends rather than overwrites: a project may already expose storage, graphql
-- or others, and clobbering that list would break unrelated parts of the app.
do $$
declare
  current_list text;
  schemas      text[];
begin
  select split_part(s, '=', 2)
    into current_list
    from pg_db_role_setting r
    cross join unnest(r.setconfig) as s
   where r.setrole = 'authenticator'::regrole
     and s like 'pgrst.db_schemas=%'
   limit 1;

  schemas := string_to_array(
    regexp_replace(coalesce(current_list, 'public, graphql_public'), '\s', '', 'g'), ',');

  if 'f1' = any(schemas) then
    raise notice 'f1 is already exposed over the API';
  else
    schemas := array_append(schemas, 'f1');
    execute format('alter role authenticator set pgrst.db_schemas = %L',
                   array_to_string(schemas, ', '));
    raise notice 'exposed schemas are now: %', array_to_string(schemas, ', ');
  end if;
exception
  -- Self-hosted or local Postgres has no `authenticator` role; the grants above
  -- are the part that matters there.
  when undefined_object then
    raise notice 'no authenticator role — skipping PostgREST schema exposure';
end $$;

-- Pick up both the new config and the new tables.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
