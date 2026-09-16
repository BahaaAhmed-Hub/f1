import { log } from '../log.js';
import { upsert, selectAll } from '../db.js';
import * as jolpica from '../sources/jolpica.js';
import { TEAM_COLORS, disambiguateDisplayKey } from '../mappings.js';

/** Ensure the season row exists before anything references it. */
export async function ensureSeason(db, year) {
  await upsert(db, 'seasons', [{ year }], { onConflict: 'year' });
}

/**
 * Sync the calendar for a season: circuits, races and the session skeleton.
 * Returns races keyed by round so downstream tasks can resolve race ids.
 */
export async function syncSchedule(db, year) {
  const schedule = await jolpica.fetchSchedule(year);
  if (!schedule.length) { log.warn(`${year}: no schedule published`); return new Map(); }

  // Circuits first — races reference them.
  const circuits = new Map();
  for (const r of schedule) {
    const row = jolpica.circuitRowFromErgast(r.circuit);
    circuits.set(row.id, row);
  }
  await upsert(db, 'circuits', [...circuits.values()], { onConflict: 'id' });

  const today = new Date().toISOString().slice(0, 10);
  const raceRows = schedule.map(r => ({
    season_year: year,
    round: r.round,
    circuit_id: jolpica.circuitSlug(r.circuit.circuitId) ?? r.circuit.circuitId,
    name: r.official_name,
    official_name: r.official_name,
    race_date: r.race_date,
    race_time: r.race_time,
    starts_at: r.starts_at,
    is_sprint_weekend: r.hasSprint,
    wikipedia_url: r.wikipedia_url,
    // A race in the past is completed unless results say otherwise; syncResults
    // corrects this once it sees (or fails to see) a classification.
    status: r.race_date && r.race_date < today ? 'completed' : 'scheduled',
  }));
  await upsert(db, 'races', raceRows, { onConflict: 'season_year,round' });

  const saved = await selectAll(db, 'races', 'id, round, race_date, is_sprint_weekend',
    q => q.eq('season_year', year));
  const byRound = new Map(saved.map(r => [r.round, r]));

  // Session skeleton, so the frontend can show a weekend before it runs.
  const sessionRows = [];
  for (const r of schedule) {
    const race = byRound.get(r.round);
    if (!race) continue;
    for (const [type, startsAt] of Object.entries(r.sessions)) {
      if (!startsAt) continue;
      sessionRows.push({
        race_id: race.id,
        session_type: type,
        starts_at: startsAt,
        status: startsAt < new Date().toISOString() ? 'completed' : 'scheduled',
      });
    }
    sessionRows.push({
      race_id: race.id,
      session_type: 'race',
      starts_at: r.starts_at,
      status: r.starts_at && r.starts_at < new Date().toISOString() ? 'completed' : 'scheduled',
    });
  }
  await upsert(db, 'sessions', sessionRows, { onConflict: 'race_id,session_type' });

  log.info(`${year}: ${raceRows.length} races, ${sessionRows.length} sessions`);
  return byRound;
}

/** Upsert drivers and constructors seen in a classification payload. */
export async function syncEntities(db, rows, year) {
  const drivers = new Map();
  const constructors = new Map();
  for (const r of rows) {
    if (r.driver) drivers.set(r.driver.driverId, jolpica.driverRowFromErgast(r.driver));
    if (r.constructor) {
      const row = jolpica.constructorRowFromErgast(r.constructor);
      row.color = TEAM_COLORS[row.id] ?? null;
      constructors.set(row.id, row);
    }
  }
  if (constructors.size) await upsert(db, 'constructors', [...constructors.values()], { onConflict: 'id' });
  if (drivers.size) {
    await resolveDisplayKeyCollisions(db, [...drivers.values()]);
    await upsert(db, 'drivers', [...drivers.values()], { onConflict: 'id' });
  }

  if (year) {
    const entries = new Map();
    for (const r of rows) {
      if (!r.driver || !r.constructor) continue;
      const key = `${r.driver.driverId}:${r.constructor.constructorId}`;
      entries.set(key, {
        season_year: year,
        driver_id: r.driver.driverId,
        constructor_id: r.constructor.constructorId,
        car_number: r.car_number ?? null,
      });
    }
    if (entries.size) {
      await upsert(db, 'driver_entries', [...entries.values()],
        { onConflict: 'season_year,driver_id,constructor_id' });
    }
  }
}

/**
 * drivers.display_key is unique. mappings.js names every collision in the
 * 2000-2026 range, but a name shared by a driver we have not seen before would
 * otherwise abort a backfill, so fall back to the full name instead.
 * Mutates the rows in place.
 */
async function resolveDisplayKeyCollisions(db, rows) {
  const keys = [...new Set(rows.map(r => r.display_key).filter(Boolean))];
  if (!keys.length) return;

  const taken = new Map(
    (await selectAll(db, 'drivers', 'id, display_key',
      q => q.in('display_key', keys))).map(d => [d.display_key, d.id]));

  const claimed = new Map();
  for (const row of rows) {
    const owner = taken.get(row.display_key) ?? claimed.get(row.display_key);
    if (owner && owner !== row.id) {
      const fallback = disambiguateDisplayKey(row.given_name, row.family_name);
      log.warn(`display_key "${row.display_key}" already belongs to ${owner}; ` +
               `using "${fallback}" for ${row.id} — add an override in mappings.js`);
      row.display_key = fallback;
    }
    claimed.set(row.display_key, row.id);
  }
}
