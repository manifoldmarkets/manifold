/**
 * Formula 1 markets from BALLDONTLIE: a market per upcoming session and
 * market type, built by common/f1-markets.ts. For now an admin creates them
 * from /admin/sports on dev (admin-sports-create-f1-markets); the daily job
 * and the resolver come with the jobs PR, so nothing here resolves a market.
 */

import { sortBy, uniq } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { anythingToRichText } from 'shared/tiptap'
import {
  createSportsContract,
  ensureOfficialGroup,
  findSportsMarket,
  SportsGameStartedError,
  SportsMarketAlreadyExistsError,
} from 'shared/sports-markets'
import { sportsCreator } from 'shared/odds-markets'
import {
  BalldontlieError,
  getF1DriverStandings,
  getF1Events,
  getF1Sessions,
} from 'shared/balldontlie-f1-client'
import {
  buildF1MarketParams,
  F1_MARKETS_BY_SESSION,
  F1DriverStanding,
  F1MarketParams,
  f1SessionKind,
} from 'common/f1-markets'
import { contractPath } from 'common/contract'
import { getAnte } from 'common/economy'
import {
  calendarEntriesFor,
  phaseWindow,
  SPORT_ID_TO_SPORT_KEY,
} from 'common/sports-calendar'
import { sportTagIds } from 'common/sports-schedule'
import { User } from 'common/user'
import { DAY_MS, MINUTE_MS } from 'common/util/time'

const ROLLING_WINDOW_DAYS = 14
/**
 * The odds pipeline's tier: Ṁ100 an answer, so about Ṁ2,300 for a winner
 * market over a full grid. The ante decision (F4199-05) is still open.
 */
const LIQUIDITY_TIER = 1000
/** Two race weekends make at most ten markets. */
const MAX_NEW_MARKETS_PER_RUN = 12
/** A session starting sooner than this isn't opened. */
const MIN_CREATE_LEAD_MS = 5 * MINUTE_MS

export type F1CreateStatus = 'created' | 'skipped' | 'dry-run' | 'error'

export interface F1CreateResult {
  created: number
  skipped: number
  errors: number
  log: {
    /** `<session id>:<market type>`: what an admin ticks after a dry run. */
    key: string
    question: string
    status: F1CreateStatus
    reason: string | null
  }[]
}

/**
 * A provider call with its 401 said plainly. /events works on every plan,
 * so a 401 there is the key; a 401 from a paid endpoint after /events
 * accepted the key is the plan.
 */
async function providerCall<T>(
  path: string,
  paid: boolean,
  call: () => Promise<T>
): Promise<T> {
  try {
    return await call()
  } catch (e) {
    if (e instanceof BalldontlieError && e.status === 401) {
      throw new Error(
        paid
          ? `BALLDONTLIE accepted the key on /events but refused ${path} (401): the key's plan doesn't include F1 ALL-STAR`
          : `BALLDONTLIE refused the key on ${path} (401), which every plan can read: the key is missing or invalid`
      )
    }
    throw e
  }
}

/** A dry run's one-line summary of the market it would open. */
function describeF1Market(params: F1MarketParams, ante: number): string {
  const top = params.answers
    .slice(0, 4)
    .map(
      (answer, i) =>
        `${params.answerShortTexts[i] ?? answer} ${Math.round(
          params.answerProbs[i]
        )}%`
    )
  const more = params.answers.length - top.length
  return [
    `${params.answers.length} answers, ${
      params.shouldAnswersSumToOne ? 'sum to one' : 'independent'
    }`,
    `opens ${top.join(', ')}${more > 0 ? `, +${more} more` : ''}`,
    `closes ${new Date(params.closeTime).toISOString().slice(0, 16)}Z`,
    `ante Ṁ${ante}`,
  ].join('; ')
}

/**
 * Create the missing markets for one F1 calendar competition's sessions in
 * the next two weeks: race winner and podium, sprint winner, pole. The entry
 * list and the opening prices come from the season's driver standings. A
 * session already holding a market of a type is skipped, and the check is
 * repeated inside the creating transaction. `keys` narrows the run to the
 * markets an admin ticked in a dry run. Throws only when the provider
 * fails; each market's own failure goes in the log.
 */
export async function createF1Markets(
  pg: SupabaseDirectClient,
  competitionId: string,
  opts: { dryRun?: boolean; keys?: string[] } = {}
): Promise<F1CreateResult> {
  const phases = calendarEntriesFor(competitionId)
  const entry = phases[0]
  if (!entry || entry.sport !== 'f1') {
    throw new Error(`${competitionId} is not an F1 competition`)
  }
  const result: F1CreateResult = { created: 0, skipped: 0, errors: 0, log: [] }
  const picked = opts.keys ? new Set(opts.keys) : undefined
  const now = Date.now()
  const until = now + ROLLING_WINDOW_DAYS * DAY_MS
  const windows = phases.map(phaseWindow)
  const inRun = (t: number) =>
    t > now && t <= until && windows.some((w) => t >= w.from && t <= w.to)

  const seasons = uniq([now, until].map((t) => new Date(t).getUTCFullYear()))
  const events = (
    await providerCall('/events', false, () =>
      Promise.all(seasons.map((season) => getF1Events(season)))
    )
  )
    .flat()
    .filter(
      (e) =>
        e.status_state !== 'canceled' &&
        Date.parse(e.end_date) >= now &&
        Date.parse(e.start_date) <= until
    )
  if (events.length === 0) return result
  const eventById = new Map(events.map((e) => [e.id, e]))

  const sessions = sortBy(
    (
      await providerCall('/sessions', true, () =>
        getF1Sessions(events.map((e) => e.id))
      )
    ).filter((s) => eventById.has(s.event?.id) && inRun(Date.parse(s.date))),
    (s) => Date.parse(s.date)
  )
  if (sessions.length === 0) return result

  const standingsBySeason = new Map<number, F1DriverStanding[]>()
  for (const season of uniq(
    sessions.map((s) => eventById.get(s.event.id)!.season)
  )) {
    standingsBySeason.set(
      season,
      await providerCall('/driver_standings', true, () =>
        getF1DriverStandings(season)
      )
    )
  }

  let planned = 0
  // A preview only reads; the creator and group are looked up on the first
  // insert.
  let creator: User | undefined
  let groupIds: string[] | undefined

  for (const session of sessions) {
    const event = eventById.get(session.event.id)!
    const sessionTitle = `${event.season} ${event.name}: ${session.name}`
    const kind = f1SessionKind(session)
    if (!kind) {
      // Listed so a preview shows how each of the provider's sessions read.
      if (!picked) {
        result.skipped++
        result.log.push({
          key: `${session.id}:none`,
          question: sessionTitle,
          status: 'skipped',
          reason: `no market for a "${session.type}" / "${session.name}" session`,
        })
      }
      continue
    }
    for (const marketType of F1_MARKETS_BY_SESSION[kind]) {
      const key = `${session.id}:${marketType}`
      if (picked && !picked.has(key)) continue
      let question = sessionTitle
      const skip = (reason: string) => {
        result.skipped++
        result.log.push({ key, question, status: 'skipped', reason })
      }
      try {
        if (session.status_state !== 'scheduled') {
          skip(`the session is ${session.status_state}`)
          continue
        }
        const standings = standingsBySeason.get(event.season) ?? []
        const params = buildF1MarketParams(
          event,
          session,
          standings.map((s) => s.driver),
          standings,
          marketType
        )
        if (!params) {
          skip(
            standings.length === 0
              ? `no ${event.season} driver standings yet, so no entry list`
              : `${standings.length} drivers in the standings isn't an entry list`
          )
          continue
        }
        question = params.question
        const existing = await findSportsMarket(
          pg,
          params.sportsEventId,
          marketType
        )
        if (existing) {
          skip(`market ${existing.id} already exists`)
          continue
        }
        if (
          Date.parse(params.sportsStartTimestamp) <=
          Date.now() + MIN_CREATE_LEAD_MS
        ) {
          skip('starts too soon to open a market')
          continue
        }
        if (planned >= MAX_NEW_MARKETS_PER_RUN) {
          skip(
            `${MAX_NEW_MARKETS_PER_RUN} new markets is the most one run creates`
          )
          continue
        }
        planned++
        if (opts.dryRun) {
          const ante = getAnte(
            params.outcomeType,
            params.answers.length,
            LIQUIDITY_TIER
          )
          result.log.push({
            key,
            question,
            status: 'dry-run',
            reason: describeF1Market(params, ante),
          })
          continue
        }
        creator ??= await sportsCreator()
        if (!groupIds) {
          const group = await ensureOfficialGroup(
            {
              officialGroupSlug: `ms-official-${competitionId}`,
              officialGroupName: `MS Official: ${entry.competition}`,
              name: entry.competition,
            },
            creator.id,
            pg
          )
          groupIds = uniq([
            group.id,
            ...sportTagIds(SPORT_ID_TO_SPORT_KEY[entry.sport]),
          ])
        }
        const contract = await createSportsContract(
          pg,
          creator,
          {
            question: params.question,
            outcomeType: params.outcomeType,
            description:
              anythingToRichText({ markdown: params.description }) ??
              anythingToRichText({ raw: '' })!,
            closeTime: params.closeTime,
            liquidityTier: LIQUIDITY_TIER,
            answers: params.answers,
            shouldAnswersSumToOne: params.shouldAnswersSumToOne,
            answerProbs: params.answerProbs,
            answerShortTexts: params.answerShortTexts,
            answerColors: params.answerColors,
            sportsStartTimestamp: params.sportsStartTimestamp,
            sportsEventId: params.sportsEventId,
            sportsLeague: params.sportsLeague,
            sportsMarketType: params.sportsMarketType,
            sportsEntrantIds: params.sportsEntrantIds,
            groupIds,
          },
          { deduplicateMarketType: marketType, minLeadMs: MIN_CREATE_LEAD_MS }
        )
        result.created++
        result.log.push({
          key,
          question,
          status: 'created',
          reason: contractPath(contract),
        })
      } catch (e) {
        // Both are expected races, not failures: another run made the
        // market, or the session started while this one got to it.
        const skipped =
          e instanceof SportsMarketAlreadyExistsError ||
          e instanceof SportsGameStartedError
        if (skipped) result.skipped++
        else result.errors++
        result.log.push({
          key,
          question,
          status: skipped ? 'skipped' : 'error',
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }
  return result
}
