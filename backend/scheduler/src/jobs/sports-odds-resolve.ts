// Every 10 seconds: for every Odds API game market whose game has started and
// is not resolved, ask for its sport's scores when /admin/sports says one is
// due (live scores per sport or game, finals once a game is due to end), write
// live scores onto the markets, and resolve when the provider marks a game
// completed. The same tick also refreshes opted-in NBA scores from BDL.
// Each source uses its own credentials; only the Odds path resolves markets.

import { MINUTE_MS } from 'common/util/time'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { pollNbaScores } from 'shared/bdl/nba-scores'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasOddsApiKey } from 'shared/the-odds-api-client'
import {
  newScorePollState,
  pollOddsScoresAndResolve,
} from 'shared/odds-markets'

// When each sport was last polled, for this process's lifetime.
const state = newScorePollState()
let warnedNoKey = false
const nbaLastAttempts = new Map<string, number>()
let nbaWork: Promise<void> | undefined

// A run still going after this long is abandoned: the cron's promise settles
// with an error (so the job-crash alert fires), the next 10-second tick starts
// a fresh run, and the abandoned one is told through isCurrent to stop at its
// next checkpoint without starting another side effect. An already-issued
// write/publish/resolution retains its market's reservation until it settles;
// the shared state lets fresh ticks skip that market and process the rest.
// Rejected helpers release reservations for later guarded/transactional retries.
// A normal run is a few seconds: one scores
// call per sport in play and a handful of row updates. On 2026-10-17 four runs
// instead sat for exactly the 60-minute client query_timeout on a dead
// database connection while `protect` skipped every tick, so Everton-Chelsea
// resolved ~50 minutes late and the 14:00 kickoffs ~30 minutes late, trading
// past the final whistle. Three minutes still leaves room for a slow
// resolution write on a busy morning.
const RUN_DEADLINE_MS = 3 * MINUTE_MS
let current: { id: string } | undefined
let nextRunId = 0

export async function resolveOddsSportsMarkets() {
  // The existing tick drives both sources. Waiting for a BDL quota slot must
  // neither delay Odds resolution nor start a second NBA read on the next tick.
  if (
    isSportsBdlEnabled() &&
    (process.env.BALLDONTLIE_API_KEY || process.env.BDL_FIXTURE_DIR) &&
    !nbaWork
  ) {
    const controller = new AbortController()
    let timer: NodeJS.Timeout
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        log.error(
          '[sports-bdl-nba] score poll exceeded its three-minute deadline'
        )
        resolve()
      }, RUN_DEADLINE_MS)
    })
    const work = pollNbaScores(
      createSupabaseDirectClient(),
      nbaLastAttempts,
      controller.signal
    )
    nbaWork = Promise.race([work, deadline])
      .catch((error) =>
        log.error(`[sports-bdl-nba] score poll failed: ${error}`)
      )
      .finally(() => {
        clearTimeout(timer)
        nbaWork = undefined
      })
  }
  if (!hasOddsApiKey()) {
    if (!warnedNoKey) {
      log('[sports-odds-resolve] THE_ODDS_API_KEY not set — skipping')
      warnedNoKey = true
    }
    return nbaWork
  }
  const run = { id: `${Date.now()}-${++nextRunId}` }
  current = run
  const isCurrent = () => current === run
  const pg = createSupabaseDirectClient()
  const work = pollOddsScoresAndResolve(pg, state, isCurrent, run.id)
  // An abandoned run settles eventually, at the latest when its connection
  // times out; keep that from becoming an unhandled rejection and say so.
  work.catch((err) => {
    if (!isCurrent())
      log(`[sports-odds-resolve] abandoned run ended: run=${run.id} ${err}`)
  })
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Include older reservations too, without alerting on every skipped
      // tick. Pending is not an unknown outcome or evidence of cancellation.
      const reservations = Array.from(state.inFlight, (id) => ({
        id,
        ...state.inFlightDetails.get(id),
      }))
      reject(
        new Error(
          `[sports-odds-resolve] run exceeded ${
            RUN_DEADLINE_MS / 1000
          }s and was abandoned; run=${run.id}; reservations=${JSON.stringify(
            reservations
          )}. Pending work may still finish; the deadline does not cancel database work. Inspect these markets and their original database work before recovery. The next tick polls unreserved markets.`
        )
      )
    }, RUN_DEADLINE_MS)
  })
  try {
    const r = await Promise.race([work, deadline])
    if (r.polled > 0) {
      log(
        `[sports-odds-resolve] polled=${r.polled} live=${r.live} resolved=${r.resolved} pending=${r.pending} errors=${r.errors}`
      )
    }
  } finally {
    clearTimeout(timer)
    if (current === run) current = undefined
  }
}
