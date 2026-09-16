// Upstream publishes times as strings in several shapes. Everything is stored
// as integer milliseconds so the DB can sort and compute gaps.

/**
 * "1:23.456" | "1:23:06.802" | "23.456" | "+2.974" -> milliseconds.
 * Returns null for anything that isn't a clock time ("+1 Lap", "DNF", "").
 */
export function parseTimeMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1000) : null;

  const raw = String(value).trim();
  if (!raw) return null;

  const sign = raw.startsWith('-') ? -1 : 1;
  const body = raw.replace(/^[+-]/, '').trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(body)) return null;

  const parts = body.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;

  // [s] | [m, s] | [h, m, s]
  const seconds = parts.reduce((acc, p) => acc * 60 + p, 0);
  return sign * Math.round(seconds * 1000);
}

/** Seconds as a float (OpenF1 lap_duration) -> milliseconds. */
export const secondsToMs = s =>
  (typeof s === 'number' && Number.isFinite(s) && s > 0 ? Math.round(s * 1000) : null);

/** Milliseconds -> "1:23.456" / "23.456" / "1:02:03.456". */
export function formatMs(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  const sign = ms < 0 ? '-' : '';
  let rest = Math.abs(ms);
  const h = Math.floor(rest / 3_600_000); rest -= h * 3_600_000;
  const m = Math.floor(rest / 60_000);    rest -= m * 60_000;
  const s = rest / 1000;
  const ss = s.toFixed(3).padStart(6, '0');
  if (h) return `${sign}${h}:${String(m).padStart(2, '0')}:${ss}`;
  if (m) return `${sign}${m}:${ss}`;
  return `${sign}${s.toFixed(3)}`;
}

/** Ergast date + time ("2026-03-08", "05:00:00Z") -> ISO timestamptz or null. */
export function toTimestamp(date, time) {
  if (!date) return null;
  if (!time) return new Date(`${date}T00:00:00Z`).toISOString();
  const t = time.endsWith('Z') ? time : `${time}Z`;
  const d = new Date(`${date}T${t}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
