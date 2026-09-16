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
