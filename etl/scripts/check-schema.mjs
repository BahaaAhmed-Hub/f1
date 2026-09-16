// Applies db/migrations + db/seed against an in-memory Postgres (PGlite) so the
// SQL is verified before it ever touches Supabase. Run: npm run db:check
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

async function sqlFiles(dir) {
  try {
    const names = (await readdir(path.join(root, dir))).filter(f => f.endsWith('.sql')).sort();
    return names.map(n => path.join(dir, n));
  } catch { return []; }
}

const db = new PGlite();
// PGlite has no Supabase roles; create them so grants/policies resolve.
await db.exec(`
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticator nologin; exception when duplicate_object then null; end $$;
`);

const files = [...await sqlFiles('db/migrations'), ...await sqlFiles('db/seed'),
               ...await sqlFiles('db/seed/optional')];
if (!files.length) { console.error('no .sql files found'); process.exit(1); }

for (const f of files) {
  const sql = await readFile(path.join(root, f), 'utf8');
  try {
    await db.exec(sql);
    console.log(`  ok  ${f}`);
  } catch (err) {
    console.error(`FAIL  ${f}\n      ${err.message}`);
    process.exit(1);
  }
}

// Re-apply migrations to prove idempotency.
for (const f of await sqlFiles('db/migrations')) {
  const sql = await readFile(path.join(root, f), 'utf8');
  try { await db.exec(sql); }
  catch (err) { console.error(`FAIL (re-run) ${f}\n      ${err.message}`); process.exit(1); }
}
console.log('  ok  migrations are idempotent');

const { rows: tables } = await db.query(
  `select table_name from information_schema.tables
    where table_schema = 'f1' order by table_name`);
const { rows: views } = await db.query(
  `select table_name from information_schema.views
    where table_schema = 'public' and table_name like 'f1\\_%' order by table_name`);

console.log(`\ntables (f1): ${tables.map(t => t.table_name).join(', ')}`);
console.log(`views (public): ${views.map(v => v.table_name).join(', ')}`);

// Every view must be queryable.
for (const v of views) {
  try { await db.query(`select * from public.${v.table_name} limit 1`); }
  catch (err) { console.error(`FAIL view ${v.table_name}: ${err.message}`); process.exit(1); }
}
console.log('\nall views queryable — schema OK');
await db.close();
