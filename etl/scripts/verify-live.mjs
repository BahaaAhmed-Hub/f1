// Checks a live Supabase project over the REST API using the publishable key —
// the same path the page takes. Reports which views exist and how full they are.
//   npm run db:verify
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

// Read the config straight out of index.html so this checks what ships.
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const url = html.match(/url:\s*'(https:\/\/[^']+)'/)?.[1];
const key = process.env.SUPABASE_ANON_KEY ?? html.match(/anonKey:\s*'([^']+)'/)?.[1];
if (!url || !key) { console.error('could not read the SUPABASE block from index.html'); process.exit(1); }
console.log(`project: ${url}\n`);

const headers = { apikey: key, authorization: `Bearer ${key}` };

async function count(view, query = '') {
  const res = await fetch(`${url}/rest/v1/${view}?select=*&limit=1${query}`, {
    headers: { ...headers, prefer: 'count=exact', range: '0-0' },
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = body;
    try { msg = JSON.parse(body).message ?? body; } catch {}
    return { ok: false, msg: `HTTP ${res.status} — ${msg}` };
  }
  const total = res.headers.get('content-range')?.split('/')[1] ?? '?';
  return { ok: true, total: Number(total) };
}

const VIEWS = [
  'f1_race_calendar', 'f1_session_results', 'f1_race_podiums',
  'f1_driver_standings', 'f1_constructor_standings',
  'f1_driver_standings_latest', 'f1_constructor_standings_latest',
  'f1_session_lap_summary',
];

let missing = 0, empty = 0;
for (const v of VIEWS) {
  const r = await count(v);
  if (!r.ok) { console.log(`  ✖  ${v.padEnd(34)} ${r.msg}`); missing++; continue; }
  if (r.total === 0) empty++;
  console.log(`  ${r.total > 0 ? 'ok' : '··'}  ${v.padEnd(34)} ${r.total} rows`);
}

// The write path is not visible to a read-only key; RLS should hide it.
const priv = await fetch(`${url}/rest/v1/ingest_runs?limit=1`, { headers });
console.log(`\n  ${priv.ok ? '✖' : 'ok'}  ingest_runs is ${priv.ok ? 'READABLE — check RLS' : 'not readable by the publishable key (correct)'}`);

if (missing) {
  console.log(`\n${missing} view(s) missing — run db/bundle.sql in the Supabase SQL editor.`);
  process.exit(1);
}
if (empty === VIEWS.length) {
  console.log('\nSchema is in place but empty — run: npm run ingest');
  process.exit(0);
}
console.log('\nlive and populated');
