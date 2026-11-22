import { isEqual } from 'lodash'
import type { MajorLeague } from 'common/bdl/major-leagues'
import {
  BDL_CORRECTION_WATCH_MS,
  BDL_CANCELLATION_HOLD_MS,
  BDL_FINAL_SETTLEMENT_DELAY_MS,
} from 'common/bdl/constants'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  autoCreates,
  getSportsCalendar,
  phaseWindow,
  type CompetitionSwitches,
} from 'common/sports-calendar'
import { bdlEventId } from 'common/sports-ids'
import type { Contract } from 'common/contract'
import { convertAnswer } from 'common/supabase/contracts'
import type { Row } from 'common/supabase/utils'
import type { User } from 'common/user'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import { resolveMarketHelper } from '../resolve-market-helpers'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { sportsProviderSql } from '../supabase/sports-provider'
import type { SupabaseDirectClient } from '../supabase/init'
import { SPORTS_CREATION_BUDGET_LOCK_SQL } from './major-settings'
import { reportSportsKickoffSignal } from '../sports-kickoff-signal'
import { majorChange, type MajorChange } from './major-change'
import type { MajorObservation } from './major-games'
import {
  isMajorMarket,
  majorPayout,
  majorResultHash,
  reviewedResult,
  type MajorMarket,
  type MajorResult,
} from './major-result'

function majorPhase(m: MajorMarket, league: MajorLeague) {
  const seed = parseSportsKickoffMs(
    m.sportsSeededStartTimestamp ?? m.sportsStartTimestamp
  )
  const phases = getSportsCalendar().filter((p) => {
    if (
      p.provider !== 'bdl' ||
      p.bdlLeagueKey !== league ||
      p.competitionId !== m.sportsCompetitionId
    )
      return false
    if (m.sportsCompetitionPhase) return p.phase === m.sportsCompetitionPhase
    const { from, to } = phaseWindow(p)
    return from <= seed && seed <= to
  })
  return phases.length === 1 ? phases[0] : undefined
}
export function majorPhaseEnabled(
  m: MajorMarket,
  league: MajorLeague,
  switches: CompetitionSwitches
) {
  const phase = majorPhase(m, league)
  return isSportsBdlEnabled() && !!phase && autoCreates(phase, switches)
}

// Never give a fixture, a non-house contract, a different provider or market type to the writer.
const official = `c.creator_id=$1 and c.visibility='public' and c.token='MANA'
  and c.deleted is not true and c.data->>'sportsFixture' is distinct from 'true'
  and ${sportsProviderSql()}='bdl' and c.data->>'sportsLeagueKey'=$2
  and c.data->>'sportsMarketType'='moneyline' and c.outcome_type='MULTIPLE_CHOICE'`

type Stored = { data: Contract; token: 'MANA' }
const contract = (row: Stored): Contract => ({ ...row.data, token: row.token })

export async function listMajorMarkets(
  pg: SupabaseDirectClient,
  creatorId: string,
  league: MajorLeague,
  watch: boolean,
  now: number
) {
  // Project away growing text/answers. Fetch authoritative answers only for a verified payout.
  const rows = await pg.manyOrNone<Stored>(
    `select c.data - 'description' - 'answers' as data, c.token from contracts c where ${official}
      and ((not $3 and c.resolution is null) or ($3 and c.resolution is not null
      and c.resolution_time between $4 and $5 and c.data->>'sportsResultHash' is not null))`,
    [
      creatorId,
      league,
      watch,
      new Date(now - BDL_CORRECTION_WATCH_MS),
      new Date(now),
    ]
  )
  return rows
    .map(contract)
    .filter((c): c is MajorMarket => isMajorMarket(c, creatorId, league))
}

export type MajorWrite = {
  market: MajorMarket
  change: MajorChange
  payout?: MajorResult
}

/** Record all existing sibling observations in one transaction. A paid sibling freezes the result
 * for the others. A correction is flagged instead of allowing contradictory house payouts. */
export async function recordMajorObservation(
  pg: SupabaseDirectClient,
  creatorId: string,
  league: MajorLeague,
  eventId: string,
  game: MajorObservation | undefined,
  requestedAt: number,
  observedAt: number,
  replacement: boolean,
  live: () => boolean,
  watch: boolean,
  sync = false
): Promise<MajorWrite[]> {
  if (
    !live() ||
    !Number.isSafeInteger(requestedAt) ||
    requestedAt <= 0 ||
    observedAt < requestedAt ||
    !Number.isSafeInteger(observedAt) ||
    (game && bdlEventId(league, game.id) !== eventId)
  )
    return []
  return pg.tx(async (tx) => {
    await tx.one(SPORTS_CREATION_BUDGET_LOCK_SQL)
    const switches = await getCompetitionSwitches(tx)
    const rows = await tx.manyOrNone<Stored>(
      `select c.data,c.token from contracts c where ${official} and c.data->>'sportsEventId'=$3
        order by c.id for update`,
      [creatorId, league, eventId]
    )
    const siblings = rows
      .map(contract)
      .filter((c): c is MajorMarket => isMajorMarket(c, creatorId, league))
    const valid = game ? reviewedResult(league, game).record : undefined
    const hash = valid && majorResultHash(valid)
    const changed: MajorWrite[] = []
    for (const m of siblings) {
      const settled = !!(m.isResolved || m.resolution)
      if (
        !live() ||
        !majorPhaseEnabled(m, league, switches) ||
        (m.sportsLastCheckedTime ?? 0) >= requestedAt ||
        (m.sportsLiveUpdatedTime ?? 0) >= requestedAt ||
        (game?.scoreUpdatedTime !== undefined &&
          m.sportsScoreUpdatedTime != null &&
          game.scoreUpdatedTime < m.sportsScoreUpdatedTime) ||
        (watch &&
          (!settled ||
            !m.resolutionTime ||
            observedAt - m.resolutionTime > BDL_CORRECTION_WATCH_MS)) ||
        (!watch && settled)
      )
        continue
      const change = majorChange(m, league, game, observedAt, {
        sync,
        replacement,
        conflictingSibling:
          !settled &&
          siblings.some((prior) => {
            if (!prior.isResolved && !prior.resolution) return false
            // The creator's explicit force option can re-create a game after a mistaken
            // N/A. A refund completed before this market existed is not its sibling payout.
            if (
              prior.resolution === 'CANCEL' &&
              prior.resolutionTime &&
              prior.resolutionTime < m.createdTime
            )
              return false
            return (
              !hash ||
              prior.sportsResultHash !== hash ||
              (prior.resolution === 'CANCEL') !== (valid?.status === 'canceled')
            )
          }),
      })
      const next = { ...m, ...change.patch } as MajorMarket
      let payout: MajorResult | undefined
      if (change.record) {
        next.answers = (
          await tx.manyOrNone<Row<'answers'>>(
            'select * from answers where contract_id=$1 order by index',
            [m.id]
          )
        ).map(convertAnswer)
        const due =
          change.record.status === 'canceled'
            ? Number(next.sportsCanceledSince) + BDL_CANCELLATION_HOLD_MS
            : Number(next.sportsFinalSince) + BDL_FINAL_SETTLEMENT_DELAY_MS
        if (majorPayout(next, change.record, observedAt)) payout = change.record
        else if (observedAt >= due) {
          const reason = 'unexpected market answers'
          change.patch.sportsAttentionReason = reason
          change.patch.sportsAttentionSince =
            m.sportsAttentionReason === reason
              ? m.sportsAttentionSince ?? observedAt
              : observedAt
          if (!m.sportsAttentionNotified) {
            change.alert = reason
            change.patch.sportsAttentionNotified = true
          }
        }
      }
      if (!live()) throw new Error('Sports observation expired')
      // Only update the JSON keys owned by this observation. The real contracts trigger mirrors
      // closeTime to close_time. The authoritative row remained locked since the policy read it.
      await tx.none('update contracts set data=data || $1::jsonb where id=$2', [
        JSON.stringify(change.patch),
        m.id,
      ])
      if (change.signal)
        await reportSportsKickoffSignal(tx, {
          kind: change.signal,
          contractId: m.id,
          observedTime: observedAt,
          providerStartTime: game?.startTime ?? undefined,
        })
      changed.push({ market: next, change, payout })
    }
    return changed
  })
}

// Each payout needs a separate phase-lock connection and the platform resolver's
// connection. Other jobs leave the recorded result for their next poll.
let settling = false
export async function settleRecordedMajor(
  pg: SupabaseDirectClient,
  market: MajorMarket,
  league: MajorLeague,
  record: MajorResult,
  creator: User,
  clock: () => number,
  live: () => boolean
) {
  if (settling || !live()) return false
  const proposed = majorPayout(market, record, clock())
  const phase = majorPhase(market, league)
  if (!proposed || !phase) return false
  settling = true
  let resolution: ReturnType<typeof resolveMarketHelper> | undefined
  try {
    await pg.tx(async (tx) => {
      // No contract is locked on this connection. An admin disabling the phase
      // updates this same switch row and waits until the payout commits or fails.
      const enabled = await tx.oneOrNone<{ enabled: boolean }>(
        'select enabled from sports_competition_switches where competition_id=$1 and phase=$2 for share',
        [phase.competitionId, phase.phase]
      )
      if (!enabled?.enabled || !live())
        throw new Error('Sports settlement disabled')
      let release!: () => void
      const committed = new Promise<void>((resolve) => {
        release = resolve
      })
      resolution = resolveMarketHelper(
        market,
        creator,
        creator,
        proposed,
        (state) => {
          if (state === 'committed') release()
        },
        (fresh) => {
          if (
            !live() ||
            !isSportsBdlEnabled() ||
            !isMajorMarket(fresh, creator.id, league) ||
            fresh.id !== market.id ||
            fresh.sportsCompetitionId !== phase.competitionId ||
            majorPhase(fresh, league)?.phase !== phase.phase ||
            !isEqual(majorPayout(fresh, record, clock()), proposed)
          )
            throw new Error('Sports settlement evidence changed')
        }
      )
      await Promise.race([resolution, committed])
    })
    // Email, notifications and revalidation may continue after commit. The
    // operator's switch is already unlocked while the platform finishes these.
    await resolution
    return true
  } finally {
    settling = false
  }
}
