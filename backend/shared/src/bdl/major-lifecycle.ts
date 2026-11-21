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
import { bdlClock, createBdlClient, type BdlClock } from '../balldontlie-client'
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
  type MajorWrite,
} from './major-lifecycle-store'
import { matchesEntrants, type MajorMarket } from './major-result'

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

async function notifyMajor(
  { market, change }: MajorWrite,
  league: MajorLeague
) {
  if (change.suspendedWarning)
    log.warn(
      '[sports-bdl-' + league + '] suspended game has a future resumption',
      { contractId: market.id }
    )
  if (!change.alert) return
  const message =
    '[sports-bdl-' +
    league +
    '] ' +
    market.id +
    ' needs attention: ' +
    change.alert
  log.error(message)
  if (isProd()) {
    const sent = await sendTextEmail(
      'info@manifold.markets',
      'Sports market needs attention: ' + market.question,
      message + '\n\nhttps://' + DOMAIN + contractPath(market)
    )
    if (!sent)
      log.error('[sports-bdl-' + league + '] attention email failed', {
        contractId: market.id,
      })
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
        const games = await fetchMajorSnapshots(
          client,
          league,
          targets.map(({ m, id }) => ({
            id,
            startTime: m.sportsStartTimestamp,
          })),
          { standings: job === 'sync' }
        )
        const completed = clock.now()
        const replacements = new Map<
          string,
          Awaited<ReturnType<typeof fetchMajorGames>>
        >()
        for (const { m, id } of targets) {
          if (!current()) break
          const game = games.get(id)
          if (game && game.id !== id) continue
          const seen = game?.observedAt
          if (
            seen !== undefined &&
            (!Number.isSafeInteger(seen) ||
              seen < requestedAt ||
              seen > completed)
          )
            continue
          const at = seen ?? completed
          const start = parseSportsKickoffMs(m.sportsStartTimestamp)
          let replacement = false
          if (!game && job === 'sync' && Number.isFinite(start) && start < at) {
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
            replacement = candidates.some(
              (candidate) =>
                candidate.id !== id &&
                matchesEntrants(m, candidate) &&
                candidate.startTime !== null &&
                Math.abs(Date.parse(candidate.startTime) - start) <=
                  BDL_REISSUED_EVENT_MATCH_WINDOW_MS
            )
          }
          const changes = await recordMajorObservation(
            pg,
            creatorId,
            league,
            m.sportsEventId,
            game,
            requestedAt,
            at,
            replacement,
            current,
            job === 'watch',
            job === 'sync'
          )
          for (const row of changes) {
            result.observed++
            if (row.change.alert) result.attention++
            await notifyMajor(row, league)
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
        }
      }
    } catch (e) {
      result.errors++
      log.error('[sports-bdl-' + league + '] ' + job + ' failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return result
}
