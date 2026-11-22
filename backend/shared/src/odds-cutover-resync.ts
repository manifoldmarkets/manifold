import { OddsMarketParams } from 'common/odds-markets'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { LEGACY_OFFICIAL_SUFFIX } from 'common/sports-league-label'
import { normalizeTeam } from 'common/sports-team-colors'
import { SPORTS_CREATION_BUDGET_LOCK_SQL } from './bdl/major-settings'
import { oddsMoneylineSql } from './bdl/odds-moneyline-identity'
import { findOpenSportsCounterparts } from './sports-market-dedupe'
import {
  describeOddsConflict,
  saveScheduleObservation,
  ScheduleConflict,
} from './sports-schedule-observation'
import type { SupabaseDirectClient } from './supabase/init'

type Stored = Partial<ScheduleConflict> & {
  id: string
  start: string | null
  home: string | null
  away: string | null
  question: string | null
  attention: string | null
  superseded: boolean
}

export async function reconcileOddsKickoff(
  pg: SupabaseDirectClient,
  params: OddsMarketParams,
  opts: {
    observedAt?: string
    dryRun?: boolean
    checkBdl: boolean
    titleFor: (start: string) => string
  }
) {
  const read = (db: Pick<SupabaseDirectClient, 'manyOrNone'>, lock = false) =>
    db.manyOrNone<Stored>(
      `select c.id, c.data->>'sportsStartTimestamp' as start, c.data->>'sportsHomeTeam' as home,
       c.data->>'sportsAwayTeam' as away, c.question, c.data->>'sportsAttentionReason' as attention,
       s.counterpart_contract_ids, s.same_event_contract_ids, s.participant_mismatch,
       coalesce(s.observed_at >= $3::timestamptz,false) as superseded
     from contracts c left join sports_market_schedule_observations s on s.contract_id=c.id and s.provider='odds'
     where c.data->>'sportsEventId'=$1 and c.creator_id=any($2) and c.token='MANA'
       and c.resolution is null and c.deleted is not true and ${oddsMoneylineSql()}
     order by c.id ${lock ? 'for update of c' : ''}`,
      [params.sportsEventId, MANIFOLD_SPORTS_USER_IDS, opts.observedAt ?? null]
    )
  const initial = await read(pg)
  if (!initial.length) return ''
  const moved = (r: Stored) =>
    Date.parse(r.start ?? '') !== Date.parse(params.sportsStartTimestamp)
  if (opts.dryRun)
    return initial
      .filter(moved)
      .map((r) => `would move ${r.id} to ${params.sportsStartTimestamp}`)
      .join('; ')
  const stamp = opts.observedAt
  if (!stamp) throw new Error('Missing Odds schedule acquisition timestamp')
  return pg.tx(async (tx) => {
    // Funding and all schedule writers use the same league-wide cutoff boundary.
    // Always acquire this before event/matchup or contract row locks.
    await tx.one(SPORTS_CREATION_BUDGET_LOCK_SQL)
    const current = await read(tx, true)
    const seen = new Map(initial.map((row) => [row.id, row]))
    const duplicateIds = current.length > 1 ? current.map((row) => row.id) : []
    const messages: string[] = []
    for (const row of current) {
      const prior = seen.get(row.id)
      if (
        !prior ||
        prior.start !== row.start ||
        prior.home !== row.home ||
        prior.away !== row.away ||
        row.superseded
      ) {
        messages.push(
          `${row.id}: superseded schedule observation; wait for a fresh read`
        )
        continue
      }
      const changed = moved(row)
      // Do not rename an existing funded matchup when this payload disagrees.
      const home = row.home && normalizeTeam(row.home)
      const away = row.away && normalizeTeam(row.away)
      const mismatch =
        !home ||
        !away ||
        home === away ||
        home !== normalizeTeam(params.sportsHomeTeam) ||
        away !== normalizeTeam(params.sportsAwayTeam)
      const matches =
        opts.checkBdl && (changed || mismatch || duplicateIds.length > 0)
          ? await findOpenSportsCounterparts(
              tx,
              {
                ...params,
                sportsHomeTeam: row.home ?? undefined,
                sportsAwayTeam: row.away ?? undefined,
              },
              'resync'
            )
          : []
      const merge = (old: string[] | undefined, fresh: string[]) =>
        [...new Set([...(old ?? []), ...fresh])].sort()
      const conflict: ScheduleConflict = {
        counterpart_contract_ids: merge(
          row.counterpart_contract_ids,
          matches.map((m) => m.id)
        ),
        same_event_contract_ids: merge(
          row.same_event_contract_ids,
          duplicateIds
        ),
        participant_mismatch: !!row.participant_mismatch || mismatch,
      }
      const reason = describeOddsConflict(conflict)
      const title =
        changed &&
        row.start &&
        Number.isFinite(Date.parse(row.start)) &&
        opts.titleFor(row.start)
      const retitle =
        changed &&
        !mismatch &&
        title &&
        (row.question === title ||
          row.question === title + LEGACY_OFFICIAL_SUFFIX)
      // Existing reason/since are operator-owned. Keep identities in the private record.
      const newAttention =
        !row.attention?.trim() &&
        (matches.length || duplicateIds.length || mismatch)
      if (changed || newAttention)
        await tx.none(
          `update contracts set data=data || $1::jsonb where id=$2 and resolution is null`,
          [
            JSON.stringify({
              ...(changed
                ? {
                    sportsStartTimestamp: params.sportsStartTimestamp,
                    closeTime: params.closeTime,
                  }
                : {}),
              ...(retitle ? { question: params.question } : {}),
              ...(newAttention
                ? {
                    sportsAttentionReason:
                      'Odds schedule needs operator review',
                    sportsAttentionSince: Date.now(),
                  }
                : {}),
            }),
            row.id,
          ]
        )
      await saveScheduleObservation(tx, row.id, stamp, conflict)
      if (changed || reason)
        messages.push(
          [
            changed &&
              `${row.id} moved its kickoff to ${params.sportsStartTimestamp}`,
            reason,
          ]
            .filter(Boolean)
            .join('; ')
        )
    }
    return messages.join('; ')
  })
}
