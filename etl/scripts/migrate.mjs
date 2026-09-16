// Applies db/bundle.sql to a Supabase project through the Management API.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:migrate
//
// The token is a Supabase *personal access token* (Account -> Access Tokens),
// not a project key — project keys cannot run DDL. It grants account-wide
// management access, so prefer pasting db/bundle.sql into the SQL editor unless
// you want this automated; revoke the token afterwards either way.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set.\n' +
    'Create one at https://supabase.com/dashboard/account/tokens, or paste\n' +
    'db/bundle.sql into the SQL editor instead.');
  process.exit(1);
}

const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const url = process.env.SUPABASE_URL ?? html.match(/url:\s*'(https:\/\/[^']+)'/)?.[1];
const ref = url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!ref) { console.error('could not determine the project ref'); process.exit(1); }

const withLayouts = process.argv.includes('--with-layouts');
const files = ['db/bundle.sql', ...(withLayouts ? ['db/seed/optional/0016_circuit_layouts.sql'] : [])];

console.log(`project: ${ref}`);
for (const f of files) {
  const query = await readFile(path.join(ROOT, f), 'utf8');
  process.stdout.write(`  applying ${f} (${(query.length / 1024).toFixed(0)} KB) … `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.log('FAILED');
    let msg = body;
    try { msg = JSON.parse(body).message ?? body; } catch {}
    console.error(`  ${res.status}: ${msg}`);
    process.exit(1);
  }
  console.log('ok');
}
console.log('\nschema applied — verify with: npm run db:verify');
