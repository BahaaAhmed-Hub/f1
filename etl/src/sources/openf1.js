// OpenF1: lap-level timing. Only covers 2023 onwards.
// Docs: https://openf1.org
import { createClient } from '../http.js';
import { secondsToMs } from '../time.js';

const BASE = process.env.OPENF1_BASE ?? 'https://api.openf1.org/v1';
const http = createClient({ minGapMs: 250, name: 'openf1' });

export const EARLIEST_SEASON = 2023;

const SESSION_NAME_TO_TYPE = {
  'Practice 1': 'fp1',
  'Practice 2': 'fp2',
  'Practice 3': 'fp3',
  'Qualifying': 'qualifying',
  'Sprint Qualifying': 'sprint_qualifying',
  'Sprint Shootout': 'sprint_qualifying',
  'Sprint': 'sprint',
  'Race': 'race',
};

export async function fetchMeetings(year) {
  const meetings = await http.getJson(`${BASE}/meetings?year=${year}`) ?? [];
  return meetings.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
}

/**
 * Match an OpenF1 meeting to one of our races by date rather than by round
 * index — round numbering diverges whenever a race is cancelled, which is
 * exactly what the old index.html `meetings[roundNum - 1]` lookup got wrong.
 */
export function matchMeeting(meetings, raceDate) {
  if (!raceDate) return null;
  const target = new Date(`${raceDate}T00:00:00Z`).getTime();
  let best = null;
  let bestDelta = Infinity;
  for (const m of meetings) {
    const delta = Math.abs(new Date(m.date_start).getTime() - target);
    if (delta < bestDelta) { bestDelta = delta; best = m; }
  }
  // A weekend spans ~4 days; anything further apart is a different event.
  return bestDelta <= 5 * 864e5 ? best : null;
}

export async function fetchSessions(meetingKey) {
  const sessions = await http.getJson(`${BASE}/sessions?meeting_key=${meetingKey}`) ?? [];
  return sessions
    .map(s => ({ ...s, type: SESSION_NAME_TO_TYPE[s.session_name] ?? null }))
    .filter(s => s.type);
}

export async function fetchSessionDrivers(sessionKey) {
  const drivers = await http.getJson(`${BASE}/drivers?session_key=${sessionKey}`) ?? [];
  const byNumber = new Map();
  for (const d of drivers) byNumber.set(Number(d.driver_number), d);
  return byNumber;
}

export async function fetchLaps(sessionKey) {
  return await http.getJson(`${BASE}/laps?session_key=${sessionKey}`) ?? [];
}

/** Collapse raw laps into per-driver lap rows plus a best-lap classification. */
export function summariseLaps(laps) {
  const byDriver = new Map();
  const lapRows = [];

  for (const lap of laps) {
    const num = Number(lap.driver_number);
    if (!Number.isFinite(num)) continue;
    const ms = secondsToMs(lap.lap_duration);

    lapRows.push({
      driver_number: num,
      lap_number: Number(lap.lap_number) || 0,
      lap_ms: ms,
      sector1_ms: secondsToMs(lap.duration_sector_1),
      sector2_ms: secondsToMs(lap.duration_sector_2),
      sector3_ms: secondsToMs(lap.duration_sector_3),
      is_pit_out: Boolean(lap.is_pit_out_lap),
      is_pit_in: Boolean(lap.is_pit_in_lap),
      position: Number.isFinite(Number(lap.position)) ? Number(lap.position) : null,
    });

    if (ms === null || lap.is_pit_out_lap) continue;   // out-laps aren't representative
    const prev = byDriver.get(num);
    if (!prev || ms < prev) byDriver.set(num, ms);
  }

  const ranked = [...byDriver.entries()].sort(([, a], [, b]) => a - b);
  const leader = ranked[0]?.[1] ?? null;
  const classification = ranked.map(([driver_number, best_lap_ms], i) => ({
    driver_number,
    position: i + 1,
    best_lap_ms,
    gap_ms: best_lap_ms - leader,
  }));

  return { lapRows, classification };
}
