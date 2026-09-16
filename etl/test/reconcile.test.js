import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRounds, freeRound } from '../src/reconcile.js';

const seeded2026 = [
  { id: 1, round: 1, circuit_id: 'australia' },
  { id: 2, round: 2, circuit_id: 'china' },
  { id: 3, round: 3, circuit_id: 'japan' },
  { id: 4, round: 4, circuit_id: 'bahrain' },   // cancelled, kept in its slot
  { id: 5, round: 5, circuit_id: 'saudi' },     // cancelled, kept in its slot
  { id: 6, round: 6, circuit_id: 'miami' },
];

test('upstream renumbering does not overwrite the wrong circuit', () => {
  // Upstream drops the two cancelled races and renumbers: Miami is round 4.
  const upstream = [
    { round: 1, circuitId: 'australia' },
    { round: 2, circuitId: 'china' },
    { round: 3, circuitId: 'japan' },
    { round: 4, circuitId: 'miami' },
  ];
  const { matched, inserted } = reconcileRounds(seeded2026, upstream);

  assert.equal(inserted.length, 0);
  const miami = matched.find(m => m.upstream.circuitId === 'miami');
  assert.equal(miami.existing.id, 6, 'Miami updates the Miami row, not Bahrain');
  assert.equal(miami.existing.round, 6, 'the seeded round number is preserved');

  // The cancelled races are simply not matched, so nothing touches them.
  assert.ok(!matched.some(m => m.existing.circuit_id === 'bahrain'));
  assert.ok(!matched.some(m => m.existing.circuit_id === 'saudi'));
});

test('a circuit visited twice in a season pairs in round order', () => {
  // 2020: Red Bull Ring hosted both the Austrian and Styrian GPs.
  const existing = [
    { id: 10, round: 1, circuit_id: 'austria' },
    { id: 11, round: 2, circuit_id: 'austria' },
    { id: 12, round: 3, circuit_id: 'hungary' },
  ];
  const upstream = [
    { round: 1, circuitId: 'austria' },
    { round: 2, circuitId: 'austria' },
    { round: 3, circuitId: 'hungary' },
  ];
  const { matched, inserted } = reconcileRounds(existing, upstream);
  assert.equal(inserted.length, 0);
  assert.deepEqual(matched.map(m => m.existing.id), [10, 11, 12]);
});

test('unknown circuits are inserted rather than overwriting a neighbour', () => {
  const { matched, inserted } = reconcileRounds(seeded2026, [
    { round: 1, circuitId: 'australia' },
    { round: 2, circuitId: 'somewhere_new' },
  ]);
  assert.equal(matched.length, 1);
  assert.deepEqual(inserted.map(r => r.circuitId), ['somewhere_new']);
});

test('an empty season inserts everything', () => {
  const upstream = [{ round: 1, circuitId: 'australia' }, { round: 2, circuitId: 'china' }];
  const { matched, inserted } = reconcileRounds([], upstream);
  assert.equal(matched.length, 0);
  assert.equal(inserted.length, 2);
});

test('freeRound skips round numbers already in use', () => {
  const taken = new Set([1, 2, 3, 4, 5, 6]);
  assert.equal(freeRound(4, taken), 7);
  assert.equal(freeRound(4, taken), 8, 'and does not hand out the same one twice');
  assert.equal(freeRound(20, taken), 20);
});
