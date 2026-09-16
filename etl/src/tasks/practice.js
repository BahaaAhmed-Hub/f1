import { log } from '../log.js';
import { upsert, selectAll, updateById } from '../db.js';
import * as openf1 from '../sources/openf1.js';

const PRACTICE_TYPES = new Set(['fp1', 'fp2', 'fp3']);

/**
 * Resolve an OpenF1 driver_number to one of our driver ids. OpenF1 has no
 * Ergast id, so match on the three-letter code, then family name.
 */
function makeResolver(drivers) {
  const byCode = new Map();
  const byFamily = new Map();
  for (const d of drivers) {
    if (d.code) byCode.set(d.code.toUpperCase(), d.id);
    byFamily.set(d.family_name.toLowerCase(), d.id);
  }
  const unmatched = new Set();

  return {
    resolve(of1Driver) {
      if (!of1Driver) return null;
      const code = (of1Driver.name_acronym ?? '').toUpperCase();
      if (byCode.has(code)) return byCode.get(code);

      const full = (of1Driver.full_name ?? of1Driver.broadcast_name ?? '').trim();
      const family = full.split(/\s+/).slice(1).join(' ').toLowerCase();
      if (family && byFamily.has(family)) return byFamily.get(family);

      // OpenF1 broadcast names are "M VERSTAPPEN"; try the last token too.
      const last = full.split(/\s+/).pop()?.toLowerCase();
      if (last && byFamily.has(last)) return byFamily.get(last);

      unmatched.add(full || code || String(of1Driver.driver_number));
      return null;
    },
    get unmatched() { return [...unmatched]; },
  };
}

/**
 * Load practice classifications and lap times for one race weekend.
 * `withLaps: false` stores only the best-lap classification, which is what the
 * page renders — the per-lap table is large and only worth it on demand.
 */
export async function syncPractice(db, year, race, meetings, { withLaps = true } = {}) {
  if (year < openf1.EARLIEST_SEASON) return 0;

  const meeting = openf1.matchMeeting(meetings, race.race_date);
  if (!meeting) { log.warn(`${year} r${race.round}: no OpenF1 meeting near ${race.race_date}`); return 0; }

  const sessions = (await openf1.fetchSessions(meeting.meeting_key))
    .filter(s => PRACTICE_TYPES.has(s.type));
  if (!sessions.length) return 0;

  const drivers = await selectAll(db, 'drivers', 'id, code, family_name');
  const resolver = makeResolver(drivers);
  let written = 0;

  for (const s of sessions) {
    await upsert(db, 'sessions', [{
      race_id: race.id, session_type: s.type, starts_at: s.date_start ?? null,
      openf1_session_key: s.session_key, status: 'completed',
    }], { onConflict: 'race_id,session_type' });

    const [row] = await selectAll(db, 'sessions', 'id',
      q => q.eq('race_id', race.id).eq('session_type', s.type));
    const sessionId = row?.id;
    if (!sessionId) continue;

    const of1Drivers = await openf1.fetchSessionDrivers(s.session_key);
    const laps = await openf1.fetchLaps(s.session_key);
    if (!laps.length) continue;

    const { lapRows, classification } = openf1.summariseLaps(laps);

    const results = classification.flatMap(c => {
      const driverId = resolver.resolve(of1Drivers.get(c.driver_number));
      if (!driverId) return [];
      return [{
        session_id: sessionId,
        driver_id: driverId,
        constructor_id: null,
        position: c.position,
        position_text: String(c.position),
        car_number: c.driver_number,
        best_lap_ms: c.best_lap_ms,
        gap_ms: c.gap_ms,
      }];
    });
    written += await upsert(db, 'session_results', results, { onConflict: 'session_id,driver_id' });
    await updateById(db, 'sessions', sessionId, { results_count: results.length });

    if (withLaps) {
      const payload = lapRows.flatMap(l => {
        const driverId = resolver.resolve(of1Drivers.get(l.driver_number));
        if (!driverId || !l.lap_number) return [];
        const { driver_number, ...rest } = l;
        return [{ session_id: sessionId, driver_id: driverId, ...rest }];
      });
      written += await upsert(db, 'lap_times', payload,
        { onConflict: 'session_id,driver_id,lap_number', chunk: 1000 });
    }
  }

  if (resolver.unmatched.length) {
    log.warn(`${year} r${race.round}: unmatched OpenF1 drivers — ${resolver.unmatched.join(', ')}`);
  }
  if (written) log.info(`${year} r${race.round}: ${written} practice rows`);
  return written;
}
