// Browser smoke test for index.html. Covers both data paths:
//   1. no database configured, no network  -> the page still renders
//   2. Supabase configured                 -> results come from the database
//
//   npm run test:browser
//
// Needs a Chromium for Playwright. Set CHROME_PATH to reuse an existing one,
// or run `npx playwright install chromium`.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SMOKE_OUT ?? null;
// Reuse a preinstalled Chromium when one is configured, else let Playwright
// resolve its own download.
const CHROME = process.env.CHROME_PATH ?? null;

// ── stand-in Supabase (PostgREST shapes only) ──────────────────────────────
const dbRow = (position, display_key, given_name, family_name, extra = {}) => ({
  season_year: 2026, round: 16, circuit_id: 'madrid', session_type: 'race',
  position, car_number: 63, given_name, family_name, display_key,
  constructor_name: 'Mercedes', constructor_color: '#00D7B6',
  points: 25, laps_completed: 56, result_status: 'Finished',
  q1_ms: null, q2_ms: null, q3_ms: null, best_lap_ms: null, ...extra,
});

const FAKE_DB = {
  f1_session_results: [
    dbRow(1, 'Russell', 'George', 'Russell', { time_text: '1:28:54.201', gap_text: '1:28:54.201' }),
    dbRow(2, 'Antonelli', 'Kimi', 'Antonelli', { gap_text: '+8.742', points: 18 }),
    dbRow(3, 'Leclerc', 'Charles', 'Leclerc', { gap_text: '+24.113', points: 15 }),
  ],
  // Round 17 is still "Upcoming" by date; the DB says it has run.
  f1_race_calendar: [
    ...Array.from({ length: 16 }, (_, i) => ({ round: i + 1, status: 'completed', has_results: true })),
    { round: 17, status: 'completed', has_results: true },
    ...Array.from({ length: 7 }, (_, i) => ({ round: i + 18, status: 'scheduled', has_results: false })),
  ],
};
// Cancelled rounds, as the seed records them.
FAKE_DB.f1_race_calendar[3].status = 'cancelled';
FAKE_DB.f1_race_calendar[4].status = 'cancelled';

let dbHits = 0;
const server = http.createServer((req, res) => {
  const [urlPath] = req.url.split('?');

  if (urlPath.startsWith('/rest/v1/')) {
    dbHits++;
    if (req.headers.apikey !== 'x'.repeat(60)) { res.writeHead(401).end('[]'); return; }
    const view = urlPath.slice('/rest/v1/'.length);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(FAKE_DB[view] ?? []));
    return;
  }

  let file = urlPath === '/' || urlPath === '/db' ? 'index.html' : urlPath.slice(1);
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) { res.writeHead(404).end(); return; }
  let body = fs.readFileSync(abs);
  if (urlPath === '/db') {
    // Point the page's SUPABASE config at this server.
    body = body.toString()
      .replace("'https://YOUR-PROJECT-REF.supabase.co'", `'http://127.0.0.1:${PORT}'`)
      .replace("'YOUR-ANON-KEY'", `'${'x'.repeat(60)}'`)
      .replace(/DB_READY = [^;]+;/, 'DB_READY = true;');
  }
  res.writeHead(200, { 'content-type': abs.endsWith('.svg') ? 'image/svg+xml' : 'text/html' });
  res.end(body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const base = `http://127.0.0.1:${PORT}`;

// ── run ────────────────────────────────────────────────────────────────────
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? '  ok  ' : 'FAIL  '}${msg}`); if (!ok) failures.push(msg); };

async function open(url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return { page, errors };
}

console.log('\n── fallback: no database configured, no network ──');
{
  const { page, errors } = await open(base);
  check(await page.locator('.card').count() === 24, '24 race cards render');
  check(await page.locator('.svg-panel svg').count() === 24, '24 circuit layouts render');

  const badges = (await page.locator('.status-lbl').allTextContents())
    .reduce((a, s) => (a[s] = (a[s] || 0) + 1, a), {});
  check(badges.Results === 14, `14 rounds show Results (got ${badges.Results})`);
  check(badges.Cancelled === 2, `2 rounds show Cancelled (got ${badges.Cancelled})`);
  check(badges.Upcoming === 8, `8 rounds show Upcoming (got ${badges.Upcoming})`);

  await page.locator('#btn_16').click();
  await page.waitForTimeout(600);
  const txt = (await page.locator('#sc_16').textContent() ?? '').trim();
  check(txt.length > 0, `round 16 panel renders a message (${JSON.stringify(txt.slice(0, 40))})`);
  check(errors.length === 0, `no JS errors${errors.length ? ': ' + errors.join('; ') : ''}`);
  await page.close();
}

console.log('\n── supabase: reading from the database ──');
{
  const before = dbHits;
  const { page, errors } = await open(`${base}/db`);
  check(dbHits > before, `page queried the database (${dbHits - before} requests)`);

  // The DB reports round 17 complete even though its date has not passed.
  const r17 = await page.locator('#status_17').textContent();
  check(r17 === 'Results', `round 17 status comes from the DB, not the date (got "${r17}")`);

  await page.locator('#btn_16').click();
  await page.waitForTimeout(800);
  const rows = await page.locator('#sc_16 .drv-row').count();
  check(rows === 3, `3 result rows rendered from the DB (got ${rows})`);

  const first = await page.locator('#sc_16 .drv-row').first().textContent();
  check(/Russell/.test(first), `winner name rendered (${JSON.stringify(first?.replace(/\s+/g, ' ').trim())})`);
  check(/1:28:54\.201/.test(first), 'leader total time rendered');

  const second = await page.locator('#sc_16 .drv-row').nth(1).textContent();
  check(/\+8\.742/.test(second), 'P2 shows a gap, not a race time');
  check(/Mercedes/.test(second), 'team name comes from the constructor');

  check(errors.length === 0, `no JS errors${errors.length ? ': ' + errors.join('; ') : ''}`);
  if (OUT) await page.screenshot({ path: `${OUT}/page.png`, fullPage: false });
  await page.close();
}

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
