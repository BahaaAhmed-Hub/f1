import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeMs, formatMs, secondsToMs, toTimestamp } from '../src/time.js';

test('parseTimeMs handles every published shape', () => {
  assert.equal(parseTimeMs('23.456'), 23_456);
  assert.equal(parseTimeMs('1:23.456'), 83_456);
  assert.equal(parseTimeMs('1:23:06.802'), 4_986_802);
  assert.equal(parseTimeMs('+2.974'), 2_974);
  assert.equal(parseTimeMs('-0.312'), -312);
  assert.equal(parseTimeMs('1:30'), 90_000);
});

test('parseTimeMs rejects non-clock statuses', () => {
  for (const v of ['+1 Lap', 'DNF', 'Retired', '', '  ', null, undefined, '\\N'])
    assert.equal(parseTimeMs(v), null, `expected null for ${JSON.stringify(v)}`);
});

test('formatMs round-trips parseTimeMs', () => {
  for (const s of ['23.456', '1:23.456', '1:23:06.802'])
    assert.equal(formatMs(parseTimeMs(s)), s);
});

test('secondsToMs matches OpenF1 lap_duration semantics', () => {
  assert.equal(secondsToMs(83.456), 83_456);
  assert.equal(secondsToMs(0), null);      // OpenF1 uses 0/null for no lap
  assert.equal(secondsToMs(null), null);
});

test('toTimestamp normalises Ergast date + time', () => {
  assert.equal(toTimestamp('2026-03-08', '05:00:00Z'), '2026-03-08T05:00:00.000Z');
  assert.equal(toTimestamp('2026-03-08', '05:00:00'), '2026-03-08T05:00:00.000Z');
  assert.equal(toTimestamp('2026-03-08', null), '2026-03-08T00:00:00.000Z');
  assert.equal(toTimestamp(null, '05:00:00Z'), null);
});
