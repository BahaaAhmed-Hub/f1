import { createClient as createSupabase } from '@supabase/supabase-js';
import { log } from './log.js';

export function connect() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n' +
      'Copy etl/.env.example to .env and fill it in, or set them as CI secrets.');
  }
  // The service-role key bypasses RLS, which is what the ETL needs — and why it
  // must never be shipped to the browser.
  return createSupabase(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'f1' },
  });
}

/** Upsert in chunks; PostgREST rejects very large single payloads. */
export async function upsert(db, table, rows, { onConflict, chunk = 500 } = {}) {
  if (!rows?.length) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await db.from(table).upsert(slice, { onConflict, defaultToNull: false });
    if (error) throw new Error(`upsert ${table} [${i}..${i + slice.length}): ${error.message}`);
    written += slice.length;
  }
  return written;
}

export async function selectAll(db, table, columns, filter = q => q) {
  const { data, error } = await filter(db.from(table).select(columns));
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return data ?? [];
}

/** Wraps a unit of work in an f1.ingest_runs row for auditability. */
export async function tracked(db, { source, scope }, fn) {
  const { data, error } = await db
    .from('ingest_runs').insert({ source, scope }).select('id').single();
  if (error) log.warn(`could not open ingest_runs row: ${error.message}`);
  const id = data?.id;

  const finish = async (patch) => {
    if (!id) return;
    const { error: e } = await db.from('ingest_runs')
      .update({ finished_at: new Date().toISOString(), ...patch }).eq('id', id);
    if (e) log.warn(`could not close ingest_runs row: ${e.message}`);
  };

  try {
    const rows = await fn();
    await finish({ status: 'ok', rows_written: Number(rows) || 0 });
    return rows;
  } catch (err) {
    await finish({ status: 'error', error: String(err.message ?? err).slice(0, 2000) });
    throw err;
  }
}

/**
 * Fail fast with an actionable message. Without this a misconfigured project
 * produces one opaque error per upsert, hundreds deep, with the real cause
 * (schema missing, schema not exposed, wrong key) nowhere in sight.
 */
export async function preflight(db) {
  const { error } = await db.from('seasons').select('year').limit(1);
  if (!error) return writeProbe(db);

  const msg = `${error.message ?? ''} ${error.hint ?? ''}`.toLowerCase();

  // PostgREST words this several ways depending on version.
  if (msg.includes('invalid schema') || msg.includes('schema must be one of')
      || msg.includes('acceptable profile')) {
    throw new Error(
      'The f1 schema is not exposed over the API.\n' +
      'Run db/migrations/0004_api_access.sql (included in db/bundle.sql), or add\n' +
      '"f1" under Supabase Settings -> API -> Exposed schemas.');
  }
  if (msg.includes('schema cache') || msg.includes('does not exist') || error.code === 'PGRST205') {
    throw new Error(
      'The f1 schema has not been created yet.\n' +
      'Paste db/bundle.sql into the Supabase SQL editor and run it, then retry.');
  }
  if (msg.includes('permission denied')) {
    throw new Error(
      'Permission denied on the f1 schema.\n' +
      'Check SUPABASE_SERVICE_ROLE_KEY is the secret key (sb_secret_...), not the\n' +
      'publishable one, and that db/migrations/0004_api_access.sql has been applied.');
  }
  if (msg.includes('invalid') && msg.includes('key') || error.code === '401') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY was rejected. Check it against Settings -> API.');
  }
  throw new Error(`Could not reach the database: ${error.message}`);
}

/**
 * Reading proves nothing about writing. The publishable key can SELECT through
 * the RLS read policy, so a read-only probe passes and the run then dies deep
 * inside the first upsert with a bare "permission denied". Probe a write too,
 * against the audit table the loader writes to first anyway.
 */
async function writeProbe(db) {
  const probe = { source: 'preflight', scope: 'write-probe', status: 'ok' };
  const { data, error } = await db.from('ingest_runs').insert(probe).select('id').single();

  if (!error) {
    if (data?.id) await db.from('ingest_runs').delete().eq('id', data.id);
    return;
  }

  const msg = `${error.message ?? ''}`.toLowerCase();
  if (msg.includes('permission denied') || msg.includes('row-level security')) {
    throw new Error(
      'The key can read but not write, which is what the publishable key does.\n' +
      'SUPABASE_SERVICE_ROLE_KEY must be the SECRET key from Supabase\n' +
      'Settings -> API Keys — it starts with "sb_secret_" (or is the legacy\n' +
      'service_role JWT beginning "eyJ"). The publishable key starting\n' +
      '"sb_publishable_" is the one that belongs in index.html, not here.');
  }
  throw new Error(`Database write check failed: ${error.message}`);
}
