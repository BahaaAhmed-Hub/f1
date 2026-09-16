/**
 * Match upstream races to rows already in the database.
 *
 * Round numbers are not a stable key across sources. The 2026 calendar seeded
 * from index.html keeps cancelled races in their original slots (Bahrain at 4,
 * Saudi at 5), while upstream drops them and renumbers everything after. Keying
 * the upsert on (season_year, round) would therefore write Miami over Bahrain.
 *
 * The circuit is the stable identity, so pair on that. A season can visit the
 * same circuit twice (2020 ran Red Bull Ring, Silverstone and Bahrain twice
 * each), so within a circuit the two sides are paired in round order.
 *
 * @param existing rows already stored: { id, round, circuit_id }
 * @param upstream races from the API:  { round, circuitId, ... }
 * @returns { matched: [{ existing, upstream }], inserted: [upstream] }
 */
export function reconcileRounds(existing, upstream) {
  const byCircuit = new Map();
  for (const row of existing) {
    if (!byCircuit.has(row.circuit_id)) byCircuit.set(row.circuit_id, []);
    byCircuit.get(row.circuit_id).push(row);
  }
  for (const rows of byCircuit.values()) rows.sort((a, b) => a.round - b.round);

  const consumed = new Map();          // circuit_id -> how many rows paired so far
  const matched = [];
  const inserted = [];

  for (const race of [...upstream].sort((a, b) => a.round - b.round)) {
    const candidates = byCircuit.get(race.circuitId) ?? [];
    const i = consumed.get(race.circuitId) ?? 0;
    if (i < candidates.length) {
      consumed.set(race.circuitId, i + 1);
      matched.push({ existing: candidates[i], upstream: race });
    } else {
      inserted.push(race);
    }
  }

  return { matched, inserted };
}

/**
 * A round number for a brand-new race that does not collide with one already
 * used this season.
 */
export function freeRound(preferred, taken) {
  let round = preferred;
  while (taken.has(round)) round++;
  taken.add(round);
  return round;
}
