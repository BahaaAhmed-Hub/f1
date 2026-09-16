import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fakeDb } from './fake-db.js';

// Upstream 2026 calendar with the two cancelled races dropped and everything
// after them renumbered — the exact shape that used to corrupt the calendar.
const UPSTREAM = {
  MRData: {
    total: '4',
    RaceTable: {
      Races: [
        { round: '1', raceName: 'Australian Grand Prix', date: '2026-03-08', time: '05:00:00Z',
          Circuit: { circuitId: 'albert_park', circuitName: 'Albert Park', Location: {} } },
        { round: '2', raceName: 'Chinese Grand Prix', date: '2026-03-15', time: '07:00:00Z',
          Circuit: { circuitId: 'shanghai', circuitName: 'Shanghai', Location: {} },
          Sprint: { date: '2026-03-14', time: '03:00:00Z' } },
        { round: '3', raceName: 'Japanese Grand Prix', date: '2026-03-29', time: '05:00:00Z',
          Circuit: { circuitId: 'suzuka', circuitName: 'Suzuka', Location: {} } },
        { round: '4', raceName: 'Miami Grand Prix', date: '2026-05-03', time: '19:30:00Z',
          Circuit: { circuitId: 'miami', circuitName: 'Miami', Location: {} } },
      ],
    },
  },
};

// The calendar as db/seed/0015 writes it: cancelled races keep their slots.
const seededRaces = () => [
  { id: 1, season_year: 2026, round: 1, circuit_id: 'australia', status: 'completed' },
  { id: 2, season_year: 2026, round: 2, circuit_id: 'china',     status: 'completed' },
  { id: 3, season_year: 2026, round: 3, circuit_id: 'japan',     status: 'completed' },
  { id: 4, season_year: 2026, round: 4, circuit_id: 'bahrain',   status: 'cancelled' },
  { id: 5, season_year: 2026, round: 5, circuit_id: 'saudi',     status: 'cancelled' },
  { id: 6, season_year: 2026, round: 6, circuit_id: 'miami',     status: 'scheduled' },
];

let server, syncSchedule;

before(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url.startsWith('/2026') ? UPSTREAM
      : { MRData: { total: '0', RaceTable: { Races: [] } } }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.JOLPICA_BASE = `http://127.0.0.1:${server.address().port}`;
  ({ syncSchedule } = await import('../src/tasks/season.js'));
});

after(() => server?.close());

test('upstream renumbering never overwrites a cancelled race', async () => {
  const db = fakeDb({ races: seededRaces(), sessions: [], circuits: [] });
  await syncSchedule(db, 2026);

  const bahrain = db.store.races.find(r => r.circuit_id === 'bahrain');
  assert.equal(bahrain.round, 4, 'Bahrain keeps round 4');
  assert.equal(bahrain.status, 'cancelled', 'and stays cancelled');

  const saudi = db.store.races.find(r => r.circuit_id === 'saudi');
  assert.equal(saudi.status, 'cancelled');

  const miami = db.store.races.find(r => r.circuit_id === 'miami');
  assert.equal(miami.id, 6, 'Miami updated its own row');
  assert.equal(miami.round, 6, 'and kept our round numbering, not upstream round 4');
  assert.equal(miami.official_name, 'Miami Grand Prix', 'while still taking upstream detail');
  assert.equal(miami.race_date, '2026-05-03');

  assert.equal(db.store.races.length, 6, 'no duplicate race rows were created');
});

test('syncSchedule reports the upstream round for each race', async () => {
  const db = fakeDb({ races: seededRaces(), sessions: [], circuits: [] });
  const races = await syncSchedule(db, 2026);

  const miami = races.find(r => r.circuit_id === 'miami');
  assert.equal(miami.round, 6, 'stored round, used for writes');
  assert.equal(miami.apiRound, 4, 'upstream round, used for fetching');

  const australia = races.find(r => r.circuit_id === 'australia');
  assert.equal(australia.round, australia.apiRound, 'unaffected races match');

  // Cancelled races have no upstream counterpart, so nothing tries to fetch them.
  assert.ok(!races.some(r => r.circuit_id === 'bahrain'));
});

test('sessions attach to the right race despite the round mismatch', async () => {
  const db = fakeDb({ races: seededRaces(), sessions: [], circuits: [] });
  await syncSchedule(db, 2026);

  const miamiId = db.store.races.find(r => r.circuit_id === 'miami').id;
  const miamiSessions = db.store.sessions.filter(s => s.race_id === miamiId);
  assert.ok(miamiSessions.some(s => s.session_type === 'race'), 'Miami has a race session');

  const bahrainId = db.store.races.find(r => r.circuit_id === 'bahrain').id;
  assert.equal(db.store.sessions.filter(s => s.race_id === bahrainId).length, 0,
    'the cancelled race got no sessions');

  const chinaId = db.store.races.find(r => r.circuit_id === 'china').id;
  assert.ok(db.store.sessions.some(s => s.race_id === chinaId && s.session_type === 'sprint'),
    'the sprint weekend got a sprint session');
});

test('an empty season inserts the upstream calendar as-is', async () => {
  const db = fakeDb({ races: [], sessions: [], circuits: [] });
  const races = await syncSchedule(db, 2026);
  assert.equal(db.store.races.length, 4);
  assert.deepEqual(races.map(r => r.round), [1, 2, 3, 4]);
  assert.deepEqual(races.map(r => r.apiRound), [1, 2, 3, 4]);
});
