import { log } from '../log.js';
import { upsert, selectAll } from '../db.js';
import * as jolpica from '../sources/jolpica.js';
import { syncEntities } from './season.js';

async function sessionIdFor(db, raceId, sessionType, startsAt = null) {
  await upsert(db, 'sessions',
    [{ race_id: raceId, session_type: sessionType, starts_at: startsAt, status: 'completed' }],
    { onConflict: 'race_id,session_type' });
  const [row] = await selectAll(db, 'sessions', 'id',
    q => q.eq('race_id', raceId).eq('session_type', sessionType));
  return row?.id ?? null;
}

async function writeResults(db, sessionId, rows, mapRow) {
  const payload = rows.map(r => ({
    session_id: sessionId,
    driver_id: r.driver.driverId,
    constructor_id: r.constructor?.constructorId ?? null,
    ...mapRow(r),
  }));
  const written = await upsert(db, 'session_results', payload, { onConflict: 'session_id,driver_id' });
  await upsert(db, 'sessions',
    [{ id: sessionId, results_count: payload.length, status: 'completed' }], { onConflict: 'id' });
  return written;
}

const raceRow = r => ({
  position: r.position, position_text: r.position_text, car_number: r.car_number,
  grid: r.grid, laps_completed: r.laps_completed, status: r.status, points: r.points,
  time_text: r.time_text, time_ms: r.time_ms, gap_text: r.gap_text, gap_ms: r.gap_ms,
  fastest_lap_ms: r.fastest_lap_ms, fastest_lap_number: r.fastest_lap_number,
  fastest_lap_rank: r.fastest_lap_rank, fastest_lap_kph: r.fastest_lap_kph,
});

const qualiRow = r => ({
  position: r.position, position_text: r.position_text, car_number: r.car_number,
  q1_ms: r.q1_ms, q2_ms: r.q2_ms, q3_ms: r.q3_ms,
  best_lap_ms: r.best_lap_ms, time_text: r.time_text,
});

/**
 * Pull race, sprint and qualifying classifications for one round.
 * Returns the number of result rows written (0 when nothing is published yet).
 */
export async function syncRound(db, year, race) {
  let written = 0;

  const results = await jolpica.fetchRaceResults(year, race.round);
  if (results) {
    await syncEntities(db, results.rows, year);
    const sid = await sessionIdFor(db, race.id, 'race');
    written += await writeResults(db, sid, results.rows, raceRow);
    await upsert(db, 'races', [{ id: race.id, status: 'completed' }], { onConflict: 'id' });
  } else if (race.race_date && race.race_date < new Date().toISOString().slice(0, 10)) {
    // Date has passed with nothing published: cancelled, or not yet uploaded.
    log.warn(`${year} r${race.round}: race date passed, no classification published`);
  }

  const quali = await jolpica.fetchQualifying(year, race.round);
  if (quali) {
    await syncEntities(db, quali.rows, year);
    const sid = await sessionIdFor(db, race.id, 'qualifying');
    written += await writeResults(db, sid, quali.rows, qualiRow);
  }

  if (race.is_sprint_weekend) {
    const sprint = await jolpica.fetchRaceResults(year, race.round, { sprint: true });
    if (sprint) {
      await syncEntities(db, sprint.rows, year);
      const sid = await sessionIdFor(db, race.id, 'sprint');
      written += await writeResults(db, sid, sprint.rows, raceRow);
    }
  }

  if (written) log.info(`${year} r${race.round}: ${written} result rows`);
  return written;
}

/** Championship snapshot after `round`. */
export async function syncStandings(db, year, round) {
  let written = 0;

  const drivers = await jolpica.fetchStandings(year, round, 'driver');
  if (drivers?.rows.length) {
    await syncEntities(db, drivers.rows, year);
    written += await upsert(db, 'driver_standings', drivers.rows.map(s => ({
      season_year: year, round: drivers.round, driver_id: s.driver.driverId,
      constructor_id: s.constructor?.constructorId ?? null,
      position: s.position, points: s.points, wins: s.wins,
    })), { onConflict: 'season_year,round,driver_id' });
  }

  const teams = await jolpica.fetchStandings(year, round, 'constructor');
  if (teams?.rows.length) {
    await syncEntities(db, teams.rows, year);
    written += await upsert(db, 'constructor_standings', teams.rows.map(s => ({
      season_year: year, round: teams.round, constructor_id: s.constructor.constructorId,
      position: s.position, points: s.points, wins: s.wins,
    })), { onConflict: 'season_year,round,constructor_id' });
  }

  if (written) log.info(`${year} r${round ?? 'latest'}: ${written} standings rows`);
  return written;
}
