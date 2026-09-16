#!/usr/bin/env node
// F1 ingest.
//
//   npm run ingest                    # YTD refresh of the current season
//   npm run ingest -- --season 2025   # one full season
//   npm run ingest -- --history       # every season from 2000 (slow, one-off)
//   npm run ingest -- --round 16      # a single round of the current season
//   npm run ingest -- --no-practice   # skip OpenF1
//   npm run ingest -- --dry-run       # fetch and report, write nothing
import { connect, tracked, selectAll, upsert } from './db.js';
import { log } from './log.js';
import { ensureSeason, syncSchedule } from './tasks/season.js';
import { syncRound, syncStandings } from './tasks/results.js';
import { syncPractice } from './tasks/practice.js';
import * as openf1 from './sources/openf1.js';

const FIRST_SEASON = 2000;

function parseArgs(argv) {
  const args = { practice: true, laps: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season')       args.season = Number(argv[++i]);
    else if (a === '--round')   args.round = Number(argv[++i]);
    else if (a === '--history') args.history = true;
    else if (a === '--from')    args.from = Number(argv[++i]);
    else if (a === '--no-practice') args.practice = false;
    else if (a === '--no-laps')     args.laps = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else log.warn(`ignoring unknown argument: ${a}`);
  }
  return args;
}

const HELP = `
f1 ingest

  --season <year>   ingest one season (default: current)
  --round <n>       ingest a single round of that season
  --history         ingest every season from ${FIRST_SEASON} to now
  --from <year>     with --history, start here instead of ${FIRST_SEASON}
  --no-practice     skip OpenF1 practice sessions
  --no-laps         practice classifications only, no per-lap rows
  --dry-run         report what would change, write nothing

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
`;

/** One season end to end. */
async function ingestSeason(db, year, args) {
  log.step(`season ${year}`);
  await ensureSeason(db, year);
  const byRound = await syncSchedule(db, year);
  if (!byRound.size) return 0;

  const today = new Date().toISOString().slice(0, 10);
  let rounds = [...byRound.values()].sort((a, b) => a.round - b.round);

  if (args.round) rounds = rounds.filter(r => r.round === args.round);
  // Only rounds whose race date has passed can have results.
  else rounds = rounds.filter(r => !r.race_date || r.race_date <= today);

  if (!rounds.length) { log.info(`${year}: no completed rounds yet`); return 0; }

  let written = 0;
  for (const race of rounds) {
    written += await syncRound(db, year, race);
  }

  // Standings after each scored round, so the title fight is queryable per round.
  for (const race of rounds) {
    written += await syncStandings(db, year, race.round);
  }

  if (args.practice && year >= openf1.EARLIEST_SEASON) {
    const meetings = await openf1.fetchMeetings(year);
    for (const race of rounds) {
      written += await syncPractice(db, year, race, meetings, { withLaps: args.laps });
    }
  }

  log.info(`season ${year}: ${written} rows`);
  return written;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const now = new Date();
  const currentSeason = now.getUTCFullYear();

  let seasons;
  if (args.history) {
    const from = args.from ?? FIRST_SEASON;
    seasons = Array.from({ length: currentSeason - from + 1 }, (_, i) => from + i);
  } else if (args.season) {
    seasons = [args.season];
  } else if (process.env.F1_SEASONS) {
    const spec = process.env.F1_SEASONS.trim();
    const range = spec.match(/^(\d{4})-(\d{4})$/);
    seasons = range
      ? Array.from({ length: +range[2] - +range[1] + 1 }, (_, i) => +range[1] + i)
      : spec.split(',').map(s => Number(s.trim())).filter(Boolean);
  } else {
    seasons = [currentSeason];
  }

  if (args.dryRun) {
    log.info(`dry run — seasons ${seasons.join(', ')}, practice=${args.practice}, laps=${args.laps}`);
    return;
  }

  const db = connect();
  let total = 0;
  const failures = [];

  for (const year of seasons) {
    try {
      total += await tracked(db, { source: 'jolpica+openf1', scope: `${year}` },
        () => ingestSeason(db, year, args));
    } catch (err) {
      // One bad season must not abandon the rest of a history backfill.
      log.error(`season ${year} failed: ${err.message}`);
      failures.push(year);
    }
  }

  log.step(`done — ${total} rows across ${seasons.length} season(s)`);
  if (failures.length) {
    log.error(`failed seasons: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

await main();
