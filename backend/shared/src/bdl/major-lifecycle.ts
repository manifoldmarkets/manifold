import { chunk, groupBy } from 'lodash'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import { MAJOR_LEAGUES, type MajorLeague } from 'common/bdl/major-leagues'
import { BDL_REISSUED_EVENT_MATCH_WINDOW_MS } from 'common/bdl/constants'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { autoCreates, getSportsCalendar } from 'common/sports-calendar'
import {
  bdlLiveInterval,
  finalsOnlySettings,
  type ScorePollingSettings,
} from 'common/sports-score-polling'
import { parseBdlEventId } from 'common/sports-ids'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import { manifoldSportsUserId } from 'common/sports'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { contractPath } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import {
  bdlClock,
  createBdlClient,
  type BdlClock,
  type BdlReadInterval,
} from '../balldontlie-client'
import {
  createSupabaseDirectClient,
  type SupabaseDirectClient,
} from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { getScorePollingSettings } from '../supabase/sports-score-polling'
import { isProd, log } from '../utils'
import { sportsCreator } from '../odds-markets'
import { publishSportsLiveScore } from '../publish-sports-live-score'
import { sendTextEmail } from '../send-email'
import { fetchMajorGames } from './major-games'
import { fetchMajorSnapshots } from './major-snapshots'
import {
  listMajorMarkets,
  majorPhaseEnabled,
  recordMajorObservation,
  settleRecordedMajor,
} from './major-lifecycle-store'
import { matchesMajorEntrantIds, type MajorMarket } from './major-result'

export type MajorJob = 'sync' | 'resolve' | 'watch'
const SYNC_INTERVAL = 15 * MINUTE_MS
const JOB_DEADLINE = 3 * MINUTE_MS
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function majorPollDue(
  job: MajorJob,
  m: MajorMarket,
  league: MajorLeague,
  settings: ScorePollingSettings,
  now: number
) {
  const last = m.sportsLastCheckedTime ?? 0
  if (job === 'watch') {
    if (!m.resolutionTime || !m.sportsResultHash) return false
    const age = now - m.resolutionTime
    return (
      now - last >=
      (age < DAY_MS ? HOUR_MS : age < 3 * DAY_MS ? 6 * HOUR_MS : DAY_MS)
    )
  }
  if (job === 'sync') return now - (m.sportsLastSyncTime ?? 0) >= SYNC_INTERVAL
  const start = parseSportsKickoffMs(m.sportsStartTimestamp)
  if (!Number.isFinite(start) || start > now) return false
  const live = bdlLiveInterval(league, m.id, settings)
  const finalFrom = BDL_LEAGUES[league].finalsFromMinutes
  const finals =
    finalFrom != null && now >= start + finalFrom * MINUTE_MS
      ? settings.finals
      : 0
  const intervals = [
    live > 0 && (!m.closeTime || m.closeTime > now) ? live : 0,
    finals,
  ].filter((n) => n > 0)
  return intervals.length > 0 && now - last >= Math.min(...intervals) * 1000
}

const ALERT_RETRY_MS = 5 * MINUTE_MS

/** A crash after successful mail delivery and before deletion can repeat a notice. */
export async function deliverMajorAlerts(
  pg: SupabaseDirectClient,
  league: MajorLeague,
  now: number,
  live: () => boolean,
  send: typeof sendTextEmail | null = isProd() ? sendTextEmail : null
) {
  if (!isSportsBdlEnabled()) return
  for (let i = 0; i < 20 && live(); i++) {
    const claimed = await pg.tx(async (tx) => {
      const pending = await tx.oneOrNone<{
        contract_id: string
        incident_key: string
        reason: string
        data: MajorMarket
      }>(
        `select a.contract_id,a.incident_key,a.reason,c.data from sports_market_attention_deliveries a
          join contracts c on c.id=a.contract_id where a.provider='bdl' and a.league_key=$1 and a.retry_at<=$2
          order by a.retry_at,a.contract_id,a.incident_key limit 1 for update of a skip locked`,
        [league, new Date(now)]
      )
      if (!pending || !live()) return
      const key = [pending.contract_id, pending.incident_key]
      const message =
        '[sports-bdl-' +
        league +
        '] ' +
        pending.contract_id +
        ' needs attention: ' +
        pending.reason
      log.error(message)
      const delivered =
        !send ||
        (await send(
          'info@manifold.markets',
          'Sports market needs attention: ' + pending.data.question,
          message + '\n\nhttps://' + DOMAIN + contractPath(pending.data)
        ).catch(() => false))
      if (delivered)
        await tx.none(
          "delete from sports_market_attention_deliveries where contract_id=$1 and provider='bdl' and incident_key=$2",
          key
        )
      else
        await tx.none(
          "update sports_market_attention_deliveries set retry_at=$3 where contract_id=$1 and provider='bdl' and incident_key=$2",
          [...key, new Date(now + ALERT_RETRY_MS)]
        )
      return true
    })
    if (!claimed) break
  }
}

const etDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
type Dependencies = {
  pg?: SupabaseDirectClient
  clock?: BdlClock
  client?: ReturnType<typeof createBdlClient>
}

/** Both enabled-phase and deadline checks run again in the transport and at the payout boundary. */
export async function runMajorLifecycle(
  job: MajorJob,
  deps: Dependencies = {}
) {
  const result = { observed: 0, settled: 0, attention: 0, errors: 0 }
  if (!isSportsBdlEnabled()) return result
  const clock = deps.clock ?? bdlClock(),
    began = clock.now()
  const current = () =>
    isSportsBdlEnabled() && clock.now() - began < JOB_DEADLINE
  const pg = deps.pg ?? createSupabaseDirectClient()
  const switches = await getCompetitionSwitches(pg)
  const enabled = MAJOR_LEAGUES.filter((league) =>
    getSportsCalendar().some(
      (p) =>
        p.bdlLeagueKey === league &&
        p.provider === 'bdl' &&
        autoCreates(p, switches)
    )
  )
  if (!enabled.length) return result
  const settings =
    job === 'resolve'
      ? await getScorePollingSettings(pg).catch(() => finalsOnlySettings())
      : finalsOnlySettings()
  const creatorId = manifoldSportsUserId(isProd())
  let payer: Awaited<ReturnType<typeof sportsCreator>> | undefined
  // Rotating the start prevents a heavily populated league from consuming every short dev run.
  const idx =
    Math.floor(
      began /
        (job === 'resolve' ? 10_000 : job === 'sync' ? SYNC_INTERVAL : HOUR_MS)
    ) % enabled.length
  for (const league of [...enabled.slice(idx), ...enabled.slice(0, idx)]) {
    if (!current()) break
    try {
      const markets = (
        await listMajorMarkets(pg, creatorId, league, job === 'watch', began)
      )
        .filter(
          (m) =>
            majorPhaseEnabled(m, league, switches) &&
            majorPollDue(job, m, league, settings, began)
        )
        .sort(
          (a, b) =>
            (a.sportsLastCheckedTime ?? 0) - (b.sportsLastCheckedTime ?? 0) ||
            a.id.localeCompare(b.id)
        )
      const groups = groupBy(markets, (m) => m.sportsEventId)
      for (const batch of chunk(Object.values(groups), 20)) {
        if (!current()) break
        const targets = batch.flatMap((group) => {
          const m = group[0],
            parsed = parseBdlEventId(m.sportsEventId)
          return parsed && parsed.league === league && !('suffix' in parsed)
            ? [{ m, id: parsed.id }]
            : []
        })
        if (!targets.length) continue
        const authorized = async () => {
          if (!current()) return false
          const fresh = await getCompetitionSwitches(pg)
          return (
            current() &&
            targets.every(({ m }) => majorPhaseEnabled(m, league, fresh))
          )
        }
        if (!(await authorized())) continue
        const client =
          deps.client ??
          createBdlClient({
            role: isProd() ? 'scheduler' : 'dev',
            key: process.env.BALLDONTLIE_API_KEY,
            clock,
            enabledLeagues: new Set([league]),
            isLeagueEnabled: async (asked) => asked === league && authorized(),
          })
        const requestedAt = clock.now()
        const malformed = new Map<
          number,
          { revision?: number; partiallyVersioned: boolean }
        >()
        const unavailable = new Set<number>()
        const receipts = new Map<number, BdlReadInterval>()
        let games: Awaited<ReturnType<typeof fetchMajorSnapshots>>
        try {
          games = await fetchMajorSnapshots(
            client,
            league,
            targets.map(({ m, id }) => ({
              id,
              startTime: m.sportsStartTimestamp,
            })),
            {
              standings: job === 'sync',
              onMalformed: (id, revision, partiallyVersioned = false) =>
                malformed.set(id, { revision, partiallyVersioned }),
              onUnavailable: (id) => unavailable.add(id),
              onReceipt: (id, interval) => {
                const prior = receipts.get(id)
                receipts.set(
                  id,
                  prior
                    ? {
                        requestedAt: Math.min(
                          prior.requestedAt,
                          interval.requestedAt
                        ),
                        receivedAt: Math.max(
                          prior.receivedAt,
                          interval.receivedAt
                        ),
                      }
                    : interval
                )
              },
            }
          )
        } catch (error) {
          // An unverified page is not evidence of a missing game. Continue to
          // independently scoped batches without writing observations for this one.
          result.errors++
          log.error('[sports-bdl-' + league + '] unverified observations', {
            error: error instanceof Error ? error.message : String(error),
          })
          continue
        }
        const completed = clock.now()
        const replacements = new Map<
          string,
          Awaited<ReturnType<typeof fetchMajorGames>>
        >()
        type Writes = Awaited<ReturnType<typeof recordMajorObservation>>
        const persisted: {
          m: MajorMarket
          id: number
          changes: Writes
          refine?: () => Promise<Writes>
        }[] = []
        for (const { m, id } of targets) {
          if (!current()) break
          try {
            if (unavailable.has(id)) {
              result.errors++
              log.warn('[sports-bdl-' + league + '] exact game unavailable', {
                id,
              })
              continue
            }
            const game = games.get(id)
            if (game && game.id !== id) continue
            const receipt = receipts.get(id)
            const requestStart = receipt?.requestedAt ?? requestedAt
            const seen = receipt?.receivedAt ?? game?.observedAt
            if (
              seen !== undefined &&
              (!Number.isSafeInteger(seen) ||
                seen < requestStart ||
                requestStart < requestedAt ||
                seen > completed)
            )
              continue
            const at = seen ?? completed
            const start = parseSportsKickoffMs(m.sportsStartTimestamp)
            const record = (replacement: boolean, refineMissing = false) =>
              recordMajorObservation(
                pg,
                creatorId,
                league,
                m.sportsEventId,
                game,
                requestStart,
                at,
                replacement,
                current,
                job === 'watch',
                job === 'sync',
                malformed.has(id),
                malformed.get(id)?.revision,
                refineMissing,
                malformed.get(id)?.partiallyVersioned
              )
            // Persist the whole verified batch before any second network request or payout.
            const changes = await record(false)
            if (changes.length)
              persisted.push({
                m,
                id,
                changes,
                refine:
                  !game &&
                  !malformed.has(id) &&
                  job === 'sync' &&
                  Number.isFinite(start) &&
                  start < at
                    ? () => record(true, true)
                    : undefined,
              })
          } catch (error) {
            result.errors++
            log.error('[sports-bdl-' + league + '] game observation failed', {
              id,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
        for (const item of persisted) {
          const { m, id, refine } = item
          let changes = item.changes
          try {
            if (refine && current()) {
              const start = parseSportsKickoffMs(m.sportsStartTimestamp)
              try {
                const date = etDate.format(start)
                let candidates = replacements.get(date)
                if (!candidates) {
                  candidates = await fetchMajorGames(
                    client,
                    league,
                    day(start - BDL_REISSUED_EVENT_MATCH_WINDOW_MS),
                    day(start + BDL_REISSUED_EVENT_MATCH_WINDOW_MS)
                  )
                  replacements.set(date, candidates)
                }
                if (
                  candidates.some(
                    (candidate) =>
                      candidate.id !== id &&
                      matchesMajorEntrantIds(m, candidate) &&
                      candidate.startTime !== null &&
                      Math.abs(Date.parse(candidate.startTime) - start) <=
                        BDL_REISSUED_EVENT_MATCH_WINDOW_MS
                  )
                ) {
                  const refined = await refine()
                  if (refined.length) changes = refined
                }
              } catch {
                result.errors++
                log.warn(
                  '[sports-bdl-' + league + '] replacement search unavailable',
                  { id }
                )
              }
            }
            for (const row of changes) {
              result.observed++
              if (row.change.alert) result.attention++
              if (row.change.suspendedWarning)
                log.warn(
                  '[sports-bdl-' +
                    league +
                    '] suspended game has a future resumption',
                  { contractId: row.market.id }
                )
              if (row.change.score && current())
                await publishSportsLiveScore(row.market.id, row.change.score)
              if (row.payout && current()) {
                payer ??= await sportsCreator()
                if (
                  await settleRecordedMajor(
                    pg,
                    row.market,
                    league,
                    row.payout,
                    payer,
                    clock.now,
                    current
                  )
                )
                  result.settled++
              }
            }
          } catch (error) {
            result.errors++
            log.error('[sports-bdl-' + league + '] game observation failed', {
              id,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }
    } catch (e) {
      result.errors++
      log.error('[sports-bdl-' + league + '] ' + job + ' failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
    try {
      if (current()) await deliverMajorAlerts(pg, league, clock.now(), current)
    } catch (e) {
      result.errors++
      log.error('[sports-bdl-' + league + '] alert delivery failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return result
}
