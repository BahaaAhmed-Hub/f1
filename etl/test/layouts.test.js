import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLegacyData } from '../scripts/extract-legacy.mjs';

// Circuits with no published traced layout. Entries here render an approximate
// outline; remove one as soon as a real layout exists for it.
// Empty: every circuit now has a real outline.
const KNOWN_APPROXIMATE = new Set();

const points = p => (p.match(/[ML]/g) ?? []).length;

/**
 * A traced circuit outline has hundreds of vertices at sub-pixel precision.
 * A hand-drawn stand-in has a couple of dozen, snapped to round numbers —
 * which is exactly how a fake Marina Bay went unnoticed in the page.
 */
function looksTraced(path) {
  const nums = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return false;
  const decimals = nums.filter(n => !Number.isInteger(n)).length / nums.length;
  return points(path) >= 100 && decimals > 0.5;
}

test('every circuit layout is a traced outline, not a stand-in', async () => {
  const { circuitPaths } = await extractLegacyData();
  const fake = Object.entries(circuitPaths)
    .filter(([slug]) => !KNOWN_APPROXIMATE.has(slug))
    .filter(([, path]) => !looksTraced(path))
    .map(([slug, path]) => `${slug} (${points(path)} points)`);

  assert.deepEqual(fake, [],
    'these look hand-drawn — replace with a real layout, or add to KNOWN_APPROXIMATE');
});

test('the approximate list has not gone stale', async () => {
  const { circuitPaths } = await extractLegacyData();
  for (const slug of KNOWN_APPROXIMATE) {
    assert.ok(slug in circuitPaths, `${slug} is listed as approximate but has no path at all`);
    assert.ok(!looksTraced(circuitPaths[slug]),
      `${slug} now looks traced — remove it from KNOWN_APPROXIMATE`);
  }
});

test('every circuit on the calendar has a layout', async () => {
  const { circuitPaths, races } = await extractLegacyData();
  // `races` is built inside a vm context, so its arrays carry that realm's
  // Array.prototype and deepStrictEqual would reject them on prototype alone.
  // Copy into this realm before asserting.
  const missing = [...races].map(r => r.k).filter(k => !circuitPaths[k]);
  assert.deepEqual(missing, [],
    `these rounds would render an empty panel: ${missing.join(', ')}`);
});

test('every layout fits the viewBox the page renders it in', async () => {
  const { circuitPaths } = await extractLegacyData();
  for (const [slug, path] of Object.entries(circuitPaths)) {
    const nums = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    for (const [axis, vals] of [['x', xs], ['y', ys]]) {
      assert.ok(Math.min(...vals) >= 0 && Math.max(...vals) <= 500,
        `${slug} is clipped on ${axis} (${Math.min(...vals)}..${Math.max(...vals)}), viewBox is 0..500`);
    }
  }
});
