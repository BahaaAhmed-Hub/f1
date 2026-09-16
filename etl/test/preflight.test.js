import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflight } from '../src/db.js';
import { fakeDb } from './fake-db.js';

test('a key that can read but not write is named as the wrong key', async () => {
  // Exactly the CI failure: the RLS read policy lets the publishable key
  // SELECT, so a read-only probe passes and the write dies much later.
  const db = fakeDb({ seasons: [{ year: 2026 }], ingest_runs: [], _deny: ['ingest_runs'] });

  await assert.rejects(() => preflight(db), err => {
    assert.match(err.message, /can read but not write/);
    assert.match(err.message, /sb_secret_/, 'names the key it wants');
    assert.match(err.message, /sb_publishable_/, 'and the one it got');
    return true;
  });
});

test('a writable key passes and leaves no probe row behind', async () => {
  const db = fakeDb({ seasons: [{ year: 2026 }], ingest_runs: [] });
  await preflight(db);
  assert.equal(db.store.ingest_runs.length, 0, 'the probe row is cleaned up');
});

test('a missing schema is reported as a missing schema', async () => {
  const db = fakeDb({});
  db.from = () => ({
    select: () => ({ limit: () => Promise.resolve({
      data: null,
      error: { message: "Could not find the table 'f1.seasons' in the schema cache",
               code: 'PGRST205' } }) }),
  });
  await assert.rejects(() => preflight(db), /has not been created yet/);
});

test('an unexposed schema is reported as an unexposed schema', async () => {
  const db = fakeDb({});
  db.from = () => ({
    select: () => ({ limit: () => Promise.resolve({
      data: null, error: { message: 'Invalid schema: f1' } }) }),
  });
  await assert.rejects(() => preflight(db), /not exposed over the API/);
});
