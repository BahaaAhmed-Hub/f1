// Jolpica-F1: the maintained continuation of the Ergast API.
// Docs: https://github.com/jolpica/jolpica-f1
import { createClient } from '../http.js';
import { parseTimeMs, toTimestamp } from '../time.js';
import { ERGAST_TO_CIRCUIT, ERGAST_CIRCUIT_ALIASES, displayKeyFor } from '../mappings.js';

const BASE = process.env.JOLPICA_BASE ?? 'https://api.jolpi.ca/ergast/f1';
const http = createClient({ minGapMs: 350, name: 'jolpica' });
const PAGE = 100;

/** Ergast paginates everything; walk every page of `table`.`key`. */
async function paged(path, table, key) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const body = await http.getJson(`${BASE}/${path}?limit=${PAGE}&offset=${offset}`);
    const mr = body?.MRData;
    if (!mr) break;
    const batch = mr[table]?.[key] ?? [];
    out.push(...batch);
    const total = Number(mr.total ?? 0);
    if (!batch.length || out.length >= total) break;
  }
  return out;
}

/** Map an Ergast circuitId to our slug; null for venues not on the 2026 map. */
export function circuitSlug(ergastId) {
  if (ERGAST_TO_CIRCUIT[ergastId]) return ERGAST_TO_CIRCUIT[ergastId];
  if (ergastId in ERGAST_CIRCUIT_ALIASES) return ERGAST_CIRCUIT_ALIASES[ergastId];
  return null;
}

export const circuitRowFromErgast = c => ({
  id: circuitSlug(c.circuitId) ?? c.circuitId,
  ergast_circuit_id: c.circuitId,
  name: c.circuitName,
  locality: c.Location?.locality ?? null,
  country: c.Location?.country ?? null,
  lat: c.Location?.lat ? Number(c.Location.lat) : null,
  lng: c.Location?.long ? Number(c.Location.long) : null,
});

export const driverRowFromErgast = d => ({
  id: d.driverId,
  display_key: displayKeyFor(d.driverId, d.familyName),
  code: d.code ?? null,
  permanent_number: d.permanentNumber ? Number(d.permanentNumber) : null,
  given_name: d.givenName ?? null,
  family_name: d.familyName,
  nationality: d.nationality ?? null,
  date_of_birth: d.dateOfBirth ?? null,
});

export const constructorRowFromErgast = c => ({
  id: c.constructorId,
  name: c.name,
  nationality: c.nationality ?? null,
});

/** Full calendar for a season, including races not yet run. */
export async function fetchSchedule(year) {
  const races = await paged(`${year}`, 'RaceTable', 'Races');
  return races.map(r => ({
    round: Number(r.round),
    official_name: r.raceName,
    race_date: r.date ?? null,
    race_time: r.time ? r.time.replace('Z', '') : null,
    starts_at: toTimestamp(r.date, r.time),
    wikipedia_url: r.url ?? null,
    circuit: r.Circuit,
    // Jolpica exposes the supporting sessions when a weekend has them.
    sessions: {
      fp1: toTimestamp(r.FirstPractice?.date, r.FirstPractice?.time),
      fp2: toTimestamp(r.SecondPractice?.date, r.SecondPractice?.time),
      fp3: toTimestamp(r.ThirdPractice?.date, r.ThirdPractice?.time),
      qualifying: toTimestamp(r.Qualifying?.date, r.Qualifying?.time),
      sprint_qualifying: toTimestamp(r.SprintQualifying?.date ?? r.SprintShootout?.date,
                                     r.SprintQualifying?.time ?? r.SprintShootout?.time),
      sprint: toTimestamp(r.Sprint?.date, r.Sprint?.time),
    },
    hasSprint: Boolean(r.Sprint),
  }));
}

/** Classified race (or sprint) results for one round. Null when unpublished. */
export async function fetchRaceResults(year, round, { sprint = false } = {}) {
  const path = sprint ? `${year}/${round}/sprint` : `${year}/${round}/results`;
  const key = sprint ? 'SprintResults' : 'Results';
  const races = await paged(path, 'RaceTable', 'Races');
  const race = races[0];
  if (!race?.[key]?.length) return null;

  const leaderMs = parseTimeMs(race[key][0]?.Time?.time);
  return {
    race,
    rows: race[key].map(r => {
      const timeMs = parseTimeMs(r.Time?.time);
      // Ergast publishes leader total time, then gaps for everyone else.
      const gapMs = r.position === '1' ? 0
        : timeMs !== null ? timeMs
        : null;
      return {
        driver: r.Driver,
        constructor: r.Constructor,
        position: Number(r.position) || null,
        position_text: r.positionText ?? null,
        car_number: r.number ? Number(r.number) : null,
        grid: r.grid !== undefined ? Number(r.grid) : null,
        laps_completed: r.laps !== undefined ? Number(r.laps) : null,
        status: r.status ?? null,
        points: Number(r.points ?? 0),
        time_text: r.Time?.time ?? null,
        time_ms: r.position === '1' ? timeMs : (leaderMs !== null && timeMs !== null ? leaderMs + timeMs : null),
        gap_text: r.position === '1' ? (r.Time?.time ?? null) : (r.Time?.time ? `+${r.Time.time}` : r.status ?? null),
        gap_ms: gapMs,
        fastest_lap_ms: parseTimeMs(r.FastestLap?.Time?.time),
        fastest_lap_number: r.FastestLap?.lap ? Number(r.FastestLap.lap) : null,
        fastest_lap_rank: r.FastestLap?.rank ? Number(r.FastestLap.rank) : null,
        fastest_lap_kph: r.FastestLap?.AverageSpeed?.speed
          ? Number(r.FastestLap.AverageSpeed.speed) : null,
      };
    }),
  };
}

/** Qualifying classification for one round. Null when unpublished. */
export async function fetchQualifying(year, round) {
  const races = await paged(`${year}/${round}/qualifying`, 'RaceTable', 'Races');
  const race = races[0];
  if (!race?.QualifyingResults?.length) return null;

  return {
    race,
    rows: race.QualifyingResults.map(r => {
      const best = parseTimeMs(r.Q3) ?? parseTimeMs(r.Q2) ?? parseTimeMs(r.Q1);
      return {
        driver: r.Driver,
        constructor: r.Constructor,
        position: Number(r.position) || null,
        position_text: r.position ?? null,
        car_number: r.number ? Number(r.number) : null,
        q1_ms: parseTimeMs(r.Q1),
        q2_ms: parseTimeMs(r.Q2),
        q3_ms: parseTimeMs(r.Q3),
        best_lap_ms: best,
        time_text: r.Q3 || r.Q2 || r.Q1 || null,
      };
    }),
  };
}

/** Championship standings after a given round (or the latest, if omitted). */
export async function fetchStandings(year, round, kind /* 'driver' | 'constructor' */) {
  const path = `${year}${round ? `/${round}` : ''}/${kind}Standings`;
  const lists = await paged(path, 'StandingsTable', 'StandingsLists');
  const list = lists[0];
  if (!list) return null;
  const rows = kind === 'driver' ? list.DriverStandings : list.ConstructorStandings;
  return {
    round: Number(list.round),
    rows: (rows ?? []).map(s => ({
      driver: s.Driver,
      constructor: s.Constructor ?? s.Constructors?.[0],
      position: Number(s.position) || null,
      points: Number(s.points ?? 0),
      wins: Number(s.wins ?? 0),
    })),
  };
}
