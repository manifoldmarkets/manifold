/**
 * Seed the `sportsCalendar` Firestore collection with competition/phase entries
 * for all sports in scope. Document IDs are deterministic so this script is
 * safe to re-run — it overwrites existing entries rather than creating duplicates.
 *
 * Usage:
 *   yarn ts-node --project tsconfig.json seed-sports-calendar.ts
 *
 * Flags:
 *   DRY_RUN=true   — log what would be written without touching Firestore
 *   FORCE=true     — overwrite entries even if they exist (default behaviour;
 *                    flag is a no-op but documents intent)
 */

import { runScript } from './run-script'
import { SportsCalendarEntry, SportId, SportsCalendarStatus } from 'common/sports'

const DRY_RUN = process.env.DRY_RUN === 'true'
const COLLECTION = 'sportsCalendar'

// Compute status from dates relative to today.
// The scheduler will keep this field current as time passes.
function computeStatus(startDate: string, endDate: string): SportsCalendarStatus {
  const now = Date.now()
  const start = new Date(startDate + 'T00:00:00Z').getTime()
  const end = new Date(endDate + 'T23:59:59Z').getTime()
  if (end < now) return 'completed'
  if (start <= now) return 'active'
  return 'upcoming'
}

function phaseSlug(phase: string): string {
  return phase
    .toLowerCase()
    .replace(/[\s/–—]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

type EntryInput = Omit<SportsCalendarEntry, 'status' | 'updatedAt' | 'updatedBy'>

const ENTRIES: EntryInput[] = [
  // ── NFL ─────────────────────────────────────────────────────────────────────
  {
    sport: 'nfl',
    competition: 'NFL Preseason 2026',
    competitionId: 'nfl-preseason-2026',
    phase: 'Preseason',
    startDate: '2026-08-07',
    endDate: '2026-08-28',
    autoCreate: false,
    autoResolve: true,
    notes: 'Preseason markets are off by default; enable manually per game',
  },
  {
    sport: 'nfl',
    competition: 'NFL Regular Season 2026–27',
    competitionId: 'nfl-regular-2026',
    phase: 'Regular Season',
    startDate: '2026-09-04',
    endDate: '2027-01-04',
    autoCreate: true,
    autoResolve: true,
    notes: 'Rolling 14-day creation window; ~272 games total',
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Wild Card',
    startDate: '2027-01-10',
    endDate: '2027-01-11',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Divisional Round',
    startDate: '2027-01-17',
    endDate: '2027-01-18',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Conference Championships',
    startDate: '2027-01-24',
    endDate: '2027-01-24',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'nfl',
    competition: 'NFL Playoffs 2027',
    competitionId: 'nfl-playoffs-2027',
    phase: 'Super Bowl LXI',
    startDate: '2027-02-01',
    endDate: '2027-02-01',
    autoCreate: true,
    autoResolve: true,
  },

  // ── College Football ─────────────────────────────────────────────────────────
  {
    sport: 'cfb',
    competition: 'NCAA Football 2026',
    competitionId: 'cfb-regular-2026',
    phase: 'Regular Season',
    startDate: '2026-08-29',
    endDate: '2026-11-28',
    autoCreate: true,
    autoResolve: true,
    notes:
      'Scope: Top 25 matchups and rivalry games only — not all games. Rolling 14-day window.',
  },
  {
    sport: 'cfb',
    competition: 'NCAA Football 2026',
    competitionId: 'cfb-regular-2026',
    phase: 'Conference Championships',
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'cfb',
    competition: 'NCAA Football 2026',
    competitionId: 'cfb-regular-2026',
    phase: 'Bowl Season',
    startDate: '2026-12-20',
    endDate: '2027-01-01',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'cfb',
    competition: 'College Football Playoff 2026–27',
    competitionId: 'cfb-cfp-2027',
    phase: 'CFP (12-team)',
    startDate: '2026-12-20',
    endDate: '2027-01-19',
    autoCreate: true,
    autoResolve: true,
  },

  // ── F1 ──────────────────────────────────────────────────────────────────────
  {
    sport: 'f1',
    competition: 'F1 World Championship 2026',
    competitionId: 'f1-2026',
    phase: '2026 Remaining',
    startDate: '2026-08-28',
    endDate: '2026-12-07',
    autoCreate: true,
    autoResolve: true,
    notes:
      'Remaining races: Zandvoort, Monza, Singapore, Austin, Mexico City, São Paulo, Las Vegas, Abu Dhabi. DECISION NEEDED: one market per race weekend or separate markets per session (qualifying, sprint, race)?',
  },
  {
    sport: 'f1',
    competition: 'F1 World Championship 2027',
    competitionId: 'f1-2027',
    phase: '2027 Season',
    startDate: '2027-03-07',
    endDate: '2027-11-28',
    autoCreate: false,
    autoResolve: false,
    notes: 'Calendar TBC — hold auto-create until full race calendar confirmed',
  },

  // ── Tour de France ───────────────────────────────────────────────────────────
  {
    sport: 'tdf',
    competition: 'Tour de France 2027',
    competitionId: 'tdf-2027',
    phase: 'TdF 2027',
    startDate: '2027-07-03',
    endDate: '2027-07-25',
    autoCreate: false,
    autoResolve: false,
    notes:
      'DECISION NEEDED: per-stage markets (21 stages) vs. GC winner market only. Also consider: KoM / points jersey / best young rider classifications? Dates are estimates — confirm once official route announced.',
  },

  // ── Soccer: EPL ──────────────────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'English Premier League 2026–27',
    competitionId: 'epl-2026-27',
    phase: 'Season',
    startDate: '2026-08-15',
    endDate: '2027-05-17',
    autoCreate: true,
    autoResolve: true,
    notes: '~380 games total; rolling 14-day creation window',
  },

  // ── Soccer: Champions League ─────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'UEFA Champions League 2026–27',
    competitionId: 'ucl-2026-27',
    phase: 'League Phase',
    startDate: '2026-09-16',
    endDate: '2026-12-11',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'UEFA Champions League 2026–27',
    competitionId: 'ucl-2026-27',
    phase: 'Knockout Phase',
    startDate: '2027-02-11',
    endDate: '2027-05-30',
    autoCreate: true,
    autoResolve: true,
  },

  // ── Soccer: MLS ──────────────────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'MLS 2026',
    competitionId: 'mls-2026',
    phase: 'Regular Season',
    startDate: '2026-08-01',
    endDate: '2026-10-19',
    autoCreate: true,
    autoResolve: true,
    notes: 'Season wrapping up; rolling window already running',
  },
  {
    sport: 'soccer',
    competition: 'MLS 2026',
    competitionId: 'mls-2026',
    phase: 'MLS Cup Playoffs',
    startDate: '2026-10-22',
    endDate: '2026-11-28',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'MLS 2027',
    competitionId: 'mls-2027',
    phase: 'Season',
    startDate: '2027-02-27',
    endDate: '2027-11-27',
    autoCreate: false,
    autoResolve: false,
    notes: 'Enable auto-create once API provider confirmed',
  },

  // ── Soccer: NWSL ─────────────────────────────────────────────────────────────
  {
    sport: 'soccer',
    competition: 'NWSL 2026',
    competitionId: 'nwsl-2026',
    phase: 'Regular Season',
    startDate: '2026-08-01',
    endDate: '2026-10-11',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'NWSL 2026',
    competitionId: 'nwsl-2026',
    phase: 'Playoffs',
    startDate: '2026-10-16',
    endDate: '2026-11-15',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'soccer',
    competition: 'NWSL 2027',
    competitionId: 'nwsl-2027',
    phase: 'Season',
    startDate: '2027-03-01',
    endDate: '2027-11-14',
    autoCreate: false,
    autoResolve: false,
    notes: 'Enable auto-create once API provider confirmed',
  },

  // ── MLB ──────────────────────────────────────────────────────────────────────
  {
    sport: 'mlb',
    competition: 'MLB 2026',
    competitionId: 'mlb-2026',
    phase: 'Playoffs',
    startDate: '2026-09-29',
    endDate: '2026-10-24',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'mlb',
    competition: 'MLB 2026',
    competitionId: 'mlb-2026',
    phase: 'World Series',
    startDate: '2026-10-25',
    endDate: '2026-10-31',
    autoCreate: true,
    autoResolve: true,
  },
  {
    sport: 'mlb',
    competition: 'MLB 2027',
    competitionId: 'mlb-2027',
    phase: 'Regular Season',
    startDate: '2027-04-01',
    endDate: '2027-09-28',
    autoCreate: false,
    autoResolve: false,
    notes: '~162 games per team (~2430 total); rolling window essential. Enable once API confirmed.',
  },
  {
    sport: 'mlb',
    competition: 'MLB 2027',
    competitionId: 'mlb-2027',
    phase: 'Playoffs',
    startDate: '2027-09-30',
    endDate: '2027-10-25',
    autoCreate: false,
    autoResolve: false,
  },

  // ── NBA ──────────────────────────────────────────────────────────────────────
  {
    sport: 'nba',
    competition: 'NBA 2026–27',
    competitionId: 'nba-regular-2026-27',
    phase: 'Regular Season',
    startDate: '2026-10-21',
    endDate: '2027-04-12',
    autoCreate: true,
    autoResolve: true,
    notes:
      'Resolution-only live mode: final score triggers auto-resolve. Mid-game odds move via human traders only — no automated probability nudging during play.',
  },
  {
    sport: 'nba',
    competition: 'NBA Playoffs 2027',
    competitionId: 'nba-playoffs-2027',
    phase: 'Playoffs',
    startDate: '2027-04-18',
    endDate: '2027-06-15',
    autoCreate: true,
    autoResolve: true,
    notes: 'Resolution-only live mode',
  },

  // ── WNBA ─────────────────────────────────────────────────────────────────────
  {
    sport: 'wnba',
    competition: 'WNBA 2026',
    competitionId: 'wnba-2026',
    phase: 'Playoffs',
    startDate: '2026-09-17',
    endDate: '2026-10-20',
    autoCreate: true,
    autoResolve: true,
    notes: 'Resolution-only live mode',
  },
  {
    sport: 'wnba',
    competition: 'WNBA 2027',
    competitionId: 'wnba-2027',
    phase: 'Season',
    startDate: '2027-05-01',
    endDate: '2027-10-19',
    autoCreate: false,
    autoResolve: false,
    notes: 'Enable auto-create once API confirmed',
  },
]

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const col = firestore.collection(COLLECTION)
    let written = 0

    for (const entry of ENTRIES) {
      const docId = `${entry.competitionId}-${phaseSlug(entry.phase)}`
      const data: SportsCalendarEntry = {
        ...entry,
        status: computeStatus(entry.startDate, entry.endDate),
        updatedAt: Date.now(),
      }

      if (DRY_RUN) {
        console.log(`[DRY] ${docId}`, JSON.stringify(data, null, 2))
        continue
      }

      await col.doc(docId).set(data)
      console.log(`  wrote ${docId}`)
      written++
    }

    console.log(
      DRY_RUN
        ? `\nDry run complete — ${ENTRIES.length} entries would be written to ${COLLECTION}`
        : `\nDone — ${written} entries written to ${COLLECTION}`
    )
  })
}
