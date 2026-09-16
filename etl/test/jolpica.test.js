import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as fx from './fixtures/jolpica.js';

// Point the source module at a local server before importing it, so the parsers
// are exercised over a real HTTP round trip instead of being stubbed out.
let server, jolpica;

before(async () => {
  server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    const body =
      path === '/2026'                    ? fx.schedule2026 :
      path === '/2026/1/results'          ? fx.raceResults :
      path === '/2026/1/qualifying'       ? fx.qualifying :
      path === '/2026/1/driverStandings'  ? fx.driverStandings :
      path === '/2026/9/results'          ? fx.empty :
      null;
    if (!body) { res.writeHead(404).end('{}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.JOLPICA_BASE = `http://127.0.0.1:${server.address().port}`;
  jolpica = await import('../src/sources/jolpica.js');
});

after(() => server?.close());

test('fetchSchedule maps rounds, circuits and weekend sessions', async () => {
  const schedule = await jolpica.fetchSchedule(2026);
  assert.equal(schedule.length, 2);

  const [melbourne, shanghai] = schedule;
  assert.equal(melbourne.round, 1);
  assert.equal(melbourne.official_name, 'Australian Grand Prix');
  assert.equal(melbourne.starts_at, '2026-03-08T05:00:00.000Z');
  assert.equal(melbourne.sessions.fp3, '2026-03-07T01:30:00.000Z');
  assert.equal(melbourne.hasSprint, false);
  assert.equal(melbourne.sessions.sprint, null);

  assert.equal(shanghai.hasSprint, true);
  assert.equal(shanghai.sessions.sprint_qualifying, '2026-03-13T07:30:00.000Z');
  assert.equal(shanghai.sessions.fp2, null, 'sprint weekends only run FP1');
});

test('circuitSlug maps Ergast ids back to the frontend slugs', () => {
  assert.equal(jolpica.circuitSlug('albert_park'), 'australia');
  assert.equal(jolpica.circuitSlug('villeneuve'), 'canada');
  assert.equal(jolpica.circuitSlug('osterreichring'), 'austria', 'A1-Ring is the Red Bull Ring');
  assert.equal(jolpica.circuitSlug('imola'), null, 'not on the 2026 calendar');
  assert.equal(jolpica.circuitSlug('brand_new_track'), null);
});

test('fetchRaceResults converts published gaps into absolute times', async () => {
  const { rows } = await jolpica.fetchRaceResults(2026, 1);
  assert.equal(rows.length, 4);

  const [winner, second, third, dnf] = rows;

  assert.equal(winner.position, 1);
  assert.equal(winner.time_ms, 4_986_802, 'leader keeps their total race time');
  assert.equal(winner.gap_ms, 0);
  assert.equal(winner.gap_text, '1:23:06.802');
  assert.equal(winner.points, 25);

  // Ergast publishes a gap for P2, not a race time, and already signs it.
  assert.equal(second.gap_ms, 2_974);
  assert.equal(second.gap_text, '+2.974', 'an already-signed gap is not signed twice');
  assert.equal(second.time_ms, 4_986_802 + 2_974, 'gap is added to the leader time');
  assert.equal(second.fastest_lap_rank, 1);
  assert.equal(second.fastest_lap_ms, 79_401);

  assert.equal(third.gap_text, '+15.519', 'an unsigned gap gets a sign');
  assert.equal(third.gap_ms, 15_519);
  assert.equal(third.fastest_lap_ms, null);

  assert.equal(dnf.position_text, 'R');
  assert.equal(dnf.gap_ms, null, 'a retirement has no gap');
  assert.equal(dnf.gap_text, 'Collision damage');
  assert.equal(dnf.time_ms, null);
  assert.equal(dnf.laps_completed, 31);
});

test('fetchQualifying keeps knocked-out segments null', async () => {
  const { rows } = await jolpica.fetchQualifying(2026, 1);
  const pole = rows[0];
  assert.equal(pole.q3_ms, 75_223);
  assert.equal(pole.best_lap_ms, 75_223);

  const q1Out = rows.at(-1);
  assert.equal(q1Out.q1_ms, 77_004);
  assert.equal(q1Out.q2_ms, null);
  assert.equal(q1Out.q3_ms, null);
  assert.equal(q1Out.best_lap_ms, 77_004, 'best falls back to the Q1 lap');
  assert.equal(q1Out.time_text, '1:17.004');
});

test('fetchStandings reads the constructor out of the standings shape', async () => {
  const standings = await jolpica.fetchStandings(2026, 1, 'driver');
  assert.equal(standings.round, 1);
  assert.equal(standings.rows[0].driver.driverId, 'russell');
  assert.equal(standings.rows[0].constructor.constructorId, 'mercedes');
  assert.equal(standings.rows[0].points, 25);
  assert.equal(standings.rows[0].wins, 1);
});

test('unpublished rounds return null rather than throwing', async () => {
  assert.equal(await jolpica.fetchRaceResults(2026, 9), null, 'empty Races list');
  assert.equal(await jolpica.fetchQualifying(2026, 24), null, 'HTTP 404');
});

test('signGap never doubles a sign', async () => {
  const { signGap } = jolpica;
  assert.equal(signGap('2.974'), '+2.974');
  assert.equal(signGap('+2.974'), '+2.974');
  assert.equal(signGap('-0.5'), '-0.5');
  assert.equal(signGap(' 1.5 '), '+1.5');
  assert.equal(signGap(null), null);
});

test('row mappers produce insertable shapes', () => {
  const c = jolpica.circuitRowFromErgast(fx.schedule2026.MRData.RaceTable.Races[0].Circuit);
  assert.equal(c.id, 'australia');
  assert.equal(c.ergast_circuit_id, 'albert_park');
  assert.equal(c.lat, -37.8497);

  const d = jolpica.driverRowFromErgast(
    fx.raceResults.MRData.RaceTable.Races[0].Results[0].Driver);
  assert.equal(d.id, 'russell');
  assert.equal(d.display_key, 'Russell');
  assert.equal(d.permanent_number, 63);
});
