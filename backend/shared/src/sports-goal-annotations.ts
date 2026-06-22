// ─── Auto goal/VAR chart annotations for live sports markets ─────────────────
//
// The 10s live poller (pollAndStoreLiveScores) detects a goal as a change in the
// cumulative score between two polls. football-data.org doesn't tell us the
// wall-clock instant the goal happened, and our poll lands seconds after it — so
// we can't place the marker at the signal time without it trailing the visible
// probability spike. Instead we fuse signals: the score delta says *that* a goal
// happened (and roughly when); the market's own reaction, read off the bet
// stream, tells us *exactly where on the chart* the move was. findMoveOnset
// back-dates the marker onto the foot of that spike. See common/sports-annotations.
//
// Reuses the existing chart_annotations pipeline end-to-end: same table, same
// broadcastNewChartAnnotation the manual annotate-chart flow uses, so live
// viewers get the marker pushed over the websocket with no extra frontend work.

import { millisToTs } from 'common/supabase/utils'
import { ENV } from 'common/envs/constants'
import { FDMatch, pickSportsWinningAnswer, TournamentConfig } from 'common/sports'
import {
  findMoveOnset,
  estimateGoalWallClock,
  MoveBet,
} from 'common/sports-annotations'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { broadcastNewChartAnnotation } from 'shared/websockets/helpers'

// Kill switch. Ships OFF so a deploy is inert — the feature fires only once
// SPORTS_GOAL_ANNOTATIONS=true is set on the backend service. Set it when you're
// supervising a live match; unset (+ restart) to disable. Gating the whole
// annotator means when off we do zero bet queries / inserts / broadcasts — the
// live score-write path is unchanged.
const ANNOTATIONS_ENABLED = process.env.SPORTS_GOAL_ANNOTATIONS === 'true'

// How far back from detection to hunt for the market's reaction. Matches the
// findMoveOnset default; kept here too because it bounds the bet query.
const LOOKBACK_MS = 180_000

// A contract whose stored (previous-poll) score we captured before overwriting.
export type PrevScore = {
  contractId: string
  oldHome: number | null
  oldAway: number | null
}

// Called by the live poller once per in-play match that has matching contracts,
// AFTER the new score has been written. `prev` carries each contract's score as
// it was on the previous poll, so we can diff. Goals are rare, so the extra
// per-goal bet query + insert here is off the hot path in practice.
export async function annotateScoreChanges(
  pg: SupabaseDirectClient,
  config: TournamentConfig,
  match: FDMatch,
  prev: PrevScore[],
  detectedTime: number
): Promise<number> {
  if (!ANNOTATIONS_ENABLED) return 0

  const newHome = match.score.fullTime.home
  const newAway = match.score.fullTime.away
  if (newHome == null || newAway == null) return 0

  // Penalty shootouts churn the score every kick — annotating each would bury the
  // chart. The shootout result is shown on resolution instead.
  if (match.score.duration === 'PENALTY_SHOOTOUT') return 0

  // Only contracts that actually saw a score change, and only when we have a real
  // prior score (null = first time we've seen this match live; recording the
  // score now, don't retro-annotate goals that happened before we started).
  const changed = prev.filter(
    (p) =>
      (p.oldHome != null && p.oldHome !== newHome) ||
      (p.oldAway != null && p.oldAway !== newAway)
  )
  if (changed.length === 0) return 0

  const creatorId =
    ENV === 'DEV'
      ? config.manifoldSportsUserId.dev
      : config.manifoldSportsUserId.prod
  const creator = await getUser(creatorId)
  if (!creator) {
    log.error(`annotateScoreChanges: creator ${creatorId} not found`)
    return 0
  }

  const kickoffMs = Date.parse(match.utcDate)
  let created = 0

  for (const p of changed) {
    // A contract carries the moneyline answers (home / away / draw). Resolve the
    // scoring team's answer so the pin sits on that team's line.
    const answers = await pg.map<{ id: string; text: string }>(
      `select id, text from answers where contract_id = $1`,
      [p.contractId],
      (r) => r
    )

    for (const side of ['home', 'away'] as const) {
      const oldScore = side === 'home' ? p.oldHome : p.oldAway
      const newScore = side === 'home' ? newHome : newAway
      if (oldScore == null || oldScore === newScore) continue

      const delta = newScore - oldScore
      const direction: 1 | -1 = delta > 0 ? 1 : -1
      const teamName =
        side === 'home' ? match.homeTeam.name : match.awayTeam.name

      const answer = pickSportsWinningAnswer(
        {
          homeTeamName: match.homeTeam.name,
          awayTeamName: match.awayTeam.name,
          winner: side === 'home' ? 'HOME_TEAM' : 'AWAY_TEAM',
        },
        answers
      )
      if (!answer) {
        log.error(
          `annotateScoreChanges: no answer for ${teamName} on ${p.contractId}`
        )
        continue
      }

      // The displayed-prob curve for the scoring answer over the lookback window.
      const bets = await pg.map<MoveBet>(
        `select extract(epoch from created_time) * 1000 as t, prob_after as p
         from contract_bets
         where contract_id = $1 and answer_id = $2 and is_redemption = false
           and created_time > $3 and created_time <= $4
         order by created_time`,
        [
          p.contractId,
          answer.id,
          millisToTs(detectedTime - LOOKBACK_MS),
          millisToTs(detectedTime),
        ],
        (r) => ({ createdTime: Number(r.t), probAfter: Number(r.p) })
      )

      // Snap to the market's reaction; fall back to a minute-based estimate when
      // there wasn't a visible one (thin market — nothing to misalign against).
      const move = findMoveOnset(bets, { detectedTime, direction })
      const eventTime =
        move?.eventTime ??
        estimateGoalWallClock(kickoffMs, match.minute, detectedTime)
      const probChange = move?.probChange ?? null

      const text = goalAnnotationText({
        teamName,
        delta,
        home: newHome,
        away: newAway,
        minute: match.minute,
      })

      try {
        const row = await pg.one(
          `insert into chart_annotations
             (contract_id, event_time, text, creator_id, creator_name,
              creator_username, creator_avatar_url, answer_id, thumbnail_url,
              prob_change)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           returning *`,
          [
            p.contractId,
            eventTime,
            text,
            creator.id,
            creator.name,
            creator.username,
            creator.avatarUrl,
            answer.id,
            creator.avatarUrl,
            probChange,
          ]
        )
        broadcastNewChartAnnotation(p.contractId, row)
        created++
        log(
          `Sports annotation: "${text}" on ${p.contractId} @ ${new Date(
            eventTime
          ).toISOString()} (${move ? 'spike' : 'fallback'}, detected ${
            detectedTime - eventTime
          }ms earlier)`
        )
      } catch (e) {
        log.error(
          `annotateScoreChanges: insert failed on ${p.contractId}: ${
            e instanceof Error ? e.message : String(e)
          }`
        )
      }
    }
  }

  return created
}

// Label shown on the marker. A goal reads "⚽ France 2–1 (67')"; a VAR reversal
// (the team's score went DOWN) reads "↩️ VAR: France goal disallowed → 1–1".
function goalAnnotationText(opts: {
  teamName: string
  delta: number
  home: number
  away: number
  minute: number | string | null | undefined
}): string {
  const { teamName, delta, home, away, minute } = opts
  const score = `${home}–${away}`
  const m = typeof minute === 'string' ? parseInt(minute, 10) : minute
  const min = m != null && isFinite(m as number) && (m as number) > 0 ? ` (${m}')` : ''

  if (delta < 0) {
    return `↩️ VAR: ${teamName} goal disallowed → ${score}`
  }
  const goals = delta > 1 ? `⚽×${delta}` : '⚽'
  return `${goals} ${teamName} ${score}${min}`
}
