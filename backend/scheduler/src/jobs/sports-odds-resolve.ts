/**
 * Auto-resolution job for Odds API sports markets (NFL, CFB, MLB, NBA, WNBA).
 *
 * Runs every 15 minutes. For each sportsMarketEvent that started within the
 * last 3 days and isn't resolved yet:
 *   1. Fetches completed scores from The Odds API.
 *   2. Resolves the Manifold market YES (home wins), NO (away wins), or
 *      NA (tie — e.g. overtime tie in NFL, which is extremely rare but valid).
 *   3. Stamps the sportsMarketEvents doc with resolved=true and final scores.
 *
 * Required env var: THE_ODDS_API_KEY
 */

import { getFirestore } from 'firebase-admin/firestore'
import { log, getUser, isProd } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { convertContract } from 'common/supabase/contracts'
import {
  getScores,
  resolveWinner,
  COMPETITION_TO_ODDS_KEY,
  OddsApiScore,
} from 'shared/the-odds-api-client'

const CREATOR_ID = isProd()
  ? 'NnVY8olowYMYQGr346dfmHXBSpx2' // @ManifoldSports prod
  : 't3R3HV2QFTRGnJxtxhzdesA4stw1' // @ManifoldSports dev

const LOOKBACK_DAYS = 3

export async function resolveSportsOddsMarkets() {
  const apiKey = process.env.THE_ODDS_API_KEY ?? ''
  if (!apiKey) {
    log('[sports-odds-resolve] THE_ODDS_API_KEY not set — skipping')
    return
  }

  const firestore = getFirestore()
  const pg = createSupabaseDirectClient()

  const creatorUser = await getUser(CREATOR_ID)
  if (!creatorUser) {
    log(`[sports-odds-resolve] Creator user ${CREATOR_ID} not found`)
    return
  }

  // Find events that started in the lookback window and aren't resolved yet.
  // We query by commenceTime range to bound the result set; resolved=false
  // is set on all events created by our market-creator jobs.
  const now = Date.now()
  const cutoff = new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date(now).toISOString()

  const snap = await firestore
    .collection('sportsMarketEvents')
    .where('commenceTime', '>=', cutoff)
    .where('commenceTime', '<=', nowIso)
    .get()

  const pending = snap.docs.filter((d) => d.data().resolved !== true)

  if (pending.length === 0) {
    log('[sports-odds-resolve] No pending events in lookback window')
    return
  }

  log(`[sports-odds-resolve] ${pending.length} pending event(s) to check`)

  // Group by oddsKey to minimise API calls (one /scores call per sport)
  const byOddsKey = new Map<string, typeof pending>()
  for (const doc of pending) {
    const { competitionId } = doc.data()
    const oddsKey = COMPETITION_TO_ODDS_KEY[competitionId]
    if (!oddsKey) continue
    const group = byOddsKey.get(oddsKey) ?? []
    group.push(doc)
    byOddsKey.set(oddsKey, group)
  }

  let resolved = 0
  let skipped = 0
  let errors = 0

  for (const [oddsKey, docs] of byOddsKey) {
    let scores: OddsApiScore[]
    try {
      scores = await getScores(oddsKey, LOOKBACK_DAYS)
    } catch (e) {
      log(`[sports-odds-resolve] Failed to fetch scores for ${oddsKey}: ${e}`)
      errors += docs.length
      continue
    }

    const scoreById = new Map(scores.map((s) => [s.id, s]))

    for (const doc of docs) {
      const ev = doc.data()
      const score = scoreById.get(doc.id)

      if (!score || !score.completed) {
        skipped++
        continue
      }

      const winnerName = resolveWinner(score)
      let outcome: 'YES' | 'NO' | 'NA'
      if (winnerName === null) {
        outcome = 'NA' // tie
      } else if (winnerName === ev.homeTeam) {
        outcome = 'YES'
      } else if (winnerName === ev.awayTeam) {
        outcome = 'NO'
      } else {
        log(
          `[sports-odds-resolve] Unrecognised winner '${winnerName}' for event ${doc.id} (home=${ev.homeTeam} away=${ev.awayTeam})`
        )
        errors++
        continue
      }

      try {
        const contractRow = await pg.oneOrNone<{
          data: any
          importance_score: number
        }>(`select data, importance_score from contracts where id = $1`, [
          ev.contractId,
        ])
        if (!contractRow) {
          log(`[sports-odds-resolve] Contract ${ev.contractId} not found in DB`)
          errors++
          continue
        }

        const contract = convertContract(contractRow)
        if (contract.isResolved) {
          // Already resolved externally — just stamp the event doc.
          await firestore
            .collection('sportsMarketEvents')
            .doc(doc.id)
            .update({ resolved: true })
          skipped++
          continue
        }

        await resolveMarketHelper(
          contract as any,
          creatorUser,
          creatorUser,
          { outcome }
        )

        const homeScoreStr =
          score.scores?.find((s: { name: string; score: string }) => s.name === score.home_team)?.score ?? null
        const awayScoreStr =
          score.scores?.find((s: { name: string; score: string }) => s.name === score.away_team)?.score ?? null

        await firestore
          .collection('sportsMarketEvents')
          .doc(doc.id)
          .update({
            resolved: true,
            resolvedOutcome: outcome,
            resolvedAt: now,
            ...(homeScoreStr !== null && { homeScore: homeScoreStr }),
            ...(awayScoreStr !== null && { awayScore: awayScoreStr }),
          })

        log(
          `[sports-odds-resolve] Resolved "${ev.question}" → ${outcome} (${homeScoreStr ?? '?'}-${awayScoreStr ?? '?'})`
        )
        resolved++
      } catch (e) {
        log(`[sports-odds-resolve] Failed to resolve event ${doc.id}: ${e}`)
        errors++
      }
    }
  }

  log(
    `[sports-odds-resolve] Done — resolved=${resolved} skipped=${skipped} errors=${errors}`
  )
}
