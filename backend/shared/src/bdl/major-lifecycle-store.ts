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
import { tsToMillis, type Row } from 'common/supabase/utils'
import type { User } from 'common/user'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import { resolveMarketHelper } from '../resolve-market-helpers'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { sportsProviderSql } from '../supabase/sports-provider'
import type { SupabaseDirectClient } from '../supabase/init'
import { SPORTS_CREATION_BUDGET_LOCK_SQL } from './major-settings'
import { reportSportsKickoffSignal } from '../sports-kickoff-signal'
import {
  majorChange,
  markMajorIncident,
  type MajorChange,
} from './major-change'
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

type Stored = {
  data: Contract
  token: 'MANA'
  resolution?: string | null
  resolution_time?: Date | string | null
}
const contract = (row: Stored): Contract =>
  Object.assign(
    {},
    row.data,
    { token: row.token },
    row.resolution && {
      isResolved: true,
      resolution: row.resolution,
      ...(row.resolution_time && {
        resolutionTime: tsToMillis(row.resolution_time),
      }),
    }
  )

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

async function siblingAgrees(
  tx: SupabaseDirectClient,
  prior: MajorMarket,
  market: MajorMarket,
  valid: MajorResult | undefined,
  lock = false
) {
  if (!prior.isResolved && !prior.resolution) {
    const firstFinal =
      prior.sportsFirstFinalHash ??
      (prior.sportsRecordedResult?.status === 'final'
        ? prior.sportsResultHash
        : undefined)
    return !valid || !firstFinal || firstFinal === majorResultHash(valid)
  }
  if (
    prior.resolution === 'CANCEL' &&
    prior.resolutionTime &&
    prior.resolutionTime < market.createdTime
  )
    return true
  if (!valid || prior.sportsResultHash !== majorResultHash(valid)) return false
  if (valid.status === 'canceled') return prior.resolution === 'CANCEL'
  const answers = (
    await tx.manyOrNone<Row<'answers'>>(
      'select * from answers where contract_id=$1 order by index' +
        (lock ? ' for share nowait' : ''),
      [prior.id]
    )
  ).map(convertAnswer)
  // Reconstruct the expected weights on the actual sibling share IDs.
  const expected = majorPayout(
    {
      ...prior,
      isResolved: false,
      resolution: undefined,
      sportsAttentionReason: undefined,
      sportsFinalSince: 1,
      answers: answers.map((a) => ({
        ...a,
        resolution: undefined,
        resolutionTime: undefined,
      })),
    },
    valid,
    Number.MAX_SAFE_INTEGER
  )
  if (
    !expected ||
    (prior.resolution !== 'CHOOSE_MULTIPLE' &&
      expected.outcome !== prior.resolution) ||
    !expected.resolutions
  )
    return false
  const weights = prior.resolutions
  if (!weights)
    return (
      expected.outcome === prior.resolution &&
      expected.outcome !== 'CHOOSE_MULTIPLE' &&
      answers.every((a) => a.prob === (a.id === prior.resolution ? 1 : 0))
    )
  return (
    Object.keys(weights).every((id) => answers.some((a) => a.id === id)) &&
    answers.every((a) => {
      const weight = expected.resolutions![a.id] ?? 0
      return (weights[a.id] ?? 0) === weight && a.prob === weight / 100
    })
  )
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
  sync = false,
  malformed = false,
  malformedRevision?: number,
  refineMissing = false
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
    await tx.one('select pg_advisory_xact_lock(hashtextextended($1,0))', [
      'major-observation:' + eventId,
    ])
    const switches = await getCompetitionSwitches(tx)
    const rows = await tx.manyOrNone<Stored>(
      `select c.data,c.token,c.resolution,c.resolution_time from contracts c where ${official} and c.data->>'sportsEventId'=$3
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
      const watermark = m.sportsRevisionWatermark ?? m.sportsScoreUpdatedTime
      const revision = game?.scoreUpdatedTime ?? malformedRevision
      const validRevision =
        revision !== undefined &&
        Number.isSafeInteger(revision) &&
        revision > 0 &&
        revision <= observedAt
      const currentRevision = m.sportsObservationRevision
      const newer =
        validRevision && currentRevision != null && revision > currentRevision
      const last = Math.max(
        m.sportsLastCheckedTime ?? 0,
        m.sportsLiveUpdatedTime ?? 0
      )
      const observationKey = (hasReplacement: boolean) =>
        JSON.stringify([
          malformed,
          hasReplacement,
          game?.status,
          game?.home,
          game?.away,
          game?.startTime,
          game?.eligible,
          game?.homeScore,
          game?.awayScore,
          game?.irregular,
          hash,
        ])
      const key = observationKey(replacement)
      if (
        refineMissing &&
        (m.sportsLastObservationKey !== observationKey(false) ||
          m.sportsObservationStartedAt !== requestedAt ||
          last !== observedAt)
      )
        continue
      const overlap = last >= requestedAt && !newer && !refineMissing
      // The order of two intersecting acquisitions is unknown even when the
      // earlier completion obtains its database lock second.
      const definitelyOlder =
        m.sportsObservationStartedAt != null
          ? observedAt < m.sportsObservationStartedAt
          : !m.sportsRecordedResult &&
            !m.sportsLastObservationKey &&
            observedAt <= last
      if (
        !live() ||
        !majorPhaseEnabled(m, league, switches) ||
        (overlap && definitelyOlder) ||
        (validRevision && watermark != null && revision < watermark) ||
        (watch && !settled) ||
        (settled &&
          (!m.resolutionTime ||
            (!watch && !m.sportsResultHash) ||
            observedAt - m.resolutionTime > BDL_CORRECTION_WATCH_MS))
      )
        continue
      if (
        overlap &&
        key === m.sportsLastObservationKey &&
        (revision === undefined || validRevision)
      ) {
        // Identical data can still extend the interval across a later, different read.
        const bounds = {
          sportsObservationStartedAt: Math.min(
            requestedAt,
            m.sportsObservationStartedAt ?? requestedAt
          ),
          sportsLastCheckedTime: Math.max(observedAt, last),
          sportsObservationRevision:
            validRevision && currentRevision === revision ? revision : null,
          ...(validRevision && {
            sportsRevisionWatermark: Math.max(watermark ?? 0, revision),
          }),
          ...(sync && {
            sportsLastSyncTime: Math.max(observedAt, m.sportsLastSyncTime ?? 0),
          }),
        }
        await tx.none(
          'update contracts set data=data || $1::jsonb where id=$2',
          [JSON.stringify(bounds), m.id]
        )
        continue
      }
      const change = majorChange(m, league, game, Math.max(observedAt, last), {
        receivedAt: observedAt,
        revision,
        sync,
        malformed,
        orderingIssue: overlap,
        replacement,
        conflictingSibling:
          !settled &&
          !(
            await Promise.all(
              siblings
                .filter((prior) => prior.id !== m.id)
                .map((prior) => siblingAgrees(tx, prior, m, valid))
            )
          ).every(Boolean),
      })
      change.patch.sportsObservationStartedAt = overlap
        ? Math.min(requestedAt, m.sportsObservationStartedAt ?? requestedAt)
        : requestedAt
      change.patch.sportsObservationRevision =
        validRevision && !overlap ? revision : null
      change.patch.sportsLastObservationKey = key
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
        else if (!next.sportsAttentionReason && observedAt >= due) {
          markMajorIncident(m, change, 'unexpected market answers', observedAt)
        }
      }
      if (!live()) throw new Error('Sports observation expired')
      // Only update the JSON keys owned by this observation. The real contracts trigger mirrors
      // closeTime to close_time. The authoritative row remained locked since the policy read it.
      await tx.none('update contracts set data=data || $1::jsonb where id=$2', [
        JSON.stringify(change.patch),
        m.id,
      ])
      if (change.alert && change.patch.sportsIncidentKey)
        await tx.none(
          `insert into sports_market_attention_deliveries(contract_id,provider,league_key,incident_key,reason,occurred_at,retry_at)
           values($1,'bdl',$2,$3,$4,$5,$5) on conflict do nothing`,
          [
            m.id,
            league,
            change.patch.sportsIncidentKey,
            change.alert,
            new Date(observedAt),
          ]
        )
      if (change.signal)
        await reportSportsKickoffSignal(tx, {
          kind: change.signal,
          contractId: m.id,
          observedTime: observedAt,
          providerStartTime: game?.startTime ?? undefined,
        })
      changed.push({
        market: Object.assign(next, change.patch),
        change,
        payout,
      })
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
      // Only sibling contracts are locked on this connection. Disabling the phase
      // updates this same switch row and waits until the payout commits or fails.
      const enabled = await tx.oneOrNone<{ enabled: boolean }>(
        'select enabled from sports_competition_switches where competition_id=$1 and phase=$2 for share',
        [phase.competitionId, phase.phase]
      )
      if (!enabled?.enabled || !live())
        throw new Error('Sports settlement disabled')
      // Observations take this lock before touching any contract rows.
      // The platform resolver alone locks the target contract on its own connection.
      await tx.one('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        'major-observation:' + market.sportsEventId,
      ])
      const siblings = await tx.manyOrNone<Stored>(
        `select c.data,c.token,c.resolution,c.resolution_time from contracts c where ${official} and c.data->>'sportsEventId'=$3 and c.id<>$4 order by c.id for share nowait`,
        [creator.id, league, market.sportsEventId, market.id]
      )
      for (const row of siblings) {
        const prior = contract(row)
        if (
          isMajorMarket(prior, creator.id, league) &&
          !(await siblingAgrees(tx, prior, market, record, true))
        )
          return
      }
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
    if (!resolution) return false
    await resolution
    return true
  } finally {
    settling = false
  }
}
