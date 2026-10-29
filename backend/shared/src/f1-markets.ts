/**
 * Formula 1 markets from BALLDONTLIE: a market per upcoming session and
 * market type, built by common/f1-markets.ts. The daily sports-f1-create job
 * makes them for the F1 calendar phases switched on in /admin/sports (an
 * admin can also make them by hand, on dev or prod), and the
 * sports-f1-resolve job resolves them from the session's classification.
 *
 * State lives on the contracts: `sportsEventId` is
 * `bdl-f1:<event id>:<session id>` and `sportsMarketType` is 'winner' or
 * 'podium', so dedupe is a lookup on those two and the resolver knows which
 * session to ask about from the market alone.
 *
 * A season also gets two title markets, the drivers' and the constructors'
 * championship (`bdl-f1-title:<season>:<kind>`, type 'title'), opened
 * before its first weekend by the same runs and resolved from its final
 * standings by resolveF1TitleMarkets, in the same job.
 */

import { sortBy, sum, uniq } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect, isProd, log } from 'shared/utils'
import { anythingToRichText } from 'shared/tiptap'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { sendTextEmail } from 'shared/send-email'
import {
  createSportsContract,
  ensureOfficialGroup,
  findSportsMarket,
  SportsGameStartedError,
  SportsMarketAlreadyExistsError,
} from 'shared/sports-markets'
import { sportsCreator } from 'shared/odds-markets'
import { getCompetitionSwitches } from 'shared/supabase/sports-competition-switches'
import {
  BalldontlieError,
  getF1DriverStandings,
  getF1Events,
  getF1SessionResults,
  getF1Sessions,
  getF1TeamStandings,
} from 'shared/balldontlie-f1-client'
import {
  buildF1MarketParams,
  buildF1TitleMarketParams,
  F1_DAYS_AHEAD,
  F1_MARKETS_BY_SESSION,
  F1_RESOLVE_DELAY_HOURS,
  F1_SEASON_END_TOLERANCE_DAYS,
  F1_TITLE_KINDS,
  F1_TITLE_RESOLVE_DELAY_HOURS,
  F1_TITLE_SAFE_MARGIN,
  f1CalendarListsEveryRound,
  f1CalendarReachesEnd,
  f1DriverEntrant,
  F1DriverStanding,
  f1DriverStandingRow,
  F1Event,
  f1EventTitle,
  F1MarketParams,
  f1SeasonComplete,
  f1SeasonDates,
  f1SeasonPointsAwarded,
  f1SessionKind,
  f1SessionResolution,
  F1SessionResult,
  f1TeamEntrant,
  f1TeamStandingRow,
  f1TitleCloseTime,
  F1TitleKind,
  f1TitleMargin,
  f1TitleResolution,
  parseF1EventId,
  parseF1TitleEventId,
} from 'common/f1-markets'
import {
  contractPath,
  CPMMMultiContract,
  MarketContract,
  SportsContract,
} from 'common/contract'
import { getAnte } from 'common/economy'
import { DOMAIN } from 'common/envs/constants'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  autoCreates,
  calendarEntriesFor,
  calendarEntriesOverlapping,
  CompetitionSwitches,
  phaseWindow,
  SPORT_ID_TO_SPORT_KEY,
} from 'common/sports-calendar'
import { sportTagIds } from 'common/sports-schedule'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { millisToTs } from 'common/supabase/utils'
import { User } from 'common/user'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'

/** Tod, 28 Oct 2026: look three to four weeks out or more, or the F1 page is bare. */
const ROLLING_WINDOW_DAYS = F1_DAYS_AHEAD
/**
 * The odds pipeline's tier: Ṁ100 an answer, so about Ṁ2,300 for a winner
 * market over a full grid. Tod, 27 Oct 2026: fine for now (F4199-05).
 */
const LIQUIDITY_TIER = 1000
/**
 * A weekend makes three or four markets, and one weekend at a time enters
 * the window, so a daily run rarely makes more than four. The first run over
 * the window opens the nearest twelve and the next day's the rest.
 */
const MAX_NEW_MARKETS_PER_RUN = 12
/** A session starting sooner than this isn't opened. */
const MIN_CREATE_LEAD_MS = 5 * MINUTE_MS

const KEY_REFUSED = 'the key is missing or invalid; every plan can read it'
const PLAN_REFUSED =
  "the key works on /events, so its plan doesn't include F1 ALL-STAR"
const KEY_OR_PLAN_REFUSED =
  "the key is invalid or its plan doesn't include F1 ALL-STAR"

/**
 * A provider call with its 401 said plainly: /events works on every plan,
 * so a 401 there is the key, and a 401 from a paid endpoint after /events
 * took the key is the plan.
 */
async function providerCall<T>(
  path: string,
  on401: string,
  call: () => Promise<T>
): Promise<T> {
  try {
    return await call()
  } catch (e) {
    if (e instanceof BalldontlieError && e.status === 401) {
      throw new Error(`BALLDONTLIE refused ${path} (401): ${on401}`)
    }
    throw e
  }
}

// ─── Creating markets ─────────────────────────────────────────────────────────

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

/** A dry run's one-line summary of the market it would open. */
function describeF1Market(
  params: Pick<
    F1MarketParams,
    | 'answers'
    | 'answerShortTexts'
    | 'answerProbs'
    | 'shouldAnswersSumToOne'
    | 'closeTime'
  >,
  ante: number
): string {
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
 * The creator and topics a competition's markets get, looked up when a run
 * first creates one: a preview only reads.
 */
function officialFor(
  pg: SupabaseDirectClient,
  competitionId: string,
  creator: User | undefined
) {
  let groupIds: string[] | undefined
  return async () => {
    creator ??= await sportsCreator()
    if (!groupIds) {
      const entry = calendarEntriesFor(competitionId)[0]
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
    return { creator, groupIds }
  }
}

/**
 * Our calendar's first date for a season may be the opening race's Sunday
 * rather than its Friday: assume the first weekend can start three days
 * before it.
 */
const OUR_WEEKEND_LEAD_DAYS = 3

/**
 * A season by our calendar (common/sports-calendar.ts): when its first
 * weekend may start, the end of its last date, and how many rounds it was
 * announced with, if we know. Null for a competition we don't list.
 */
function ourSeason(
  competitionId: string
): { firstStart: number; end: number; rounds: number | undefined } | null {
  const phases = calendarEntriesFor(competitionId)
  const windows = phases.map(phaseWindow)
  if (windows.length === 0) return null
  const rounds = phases.flatMap((p) => (p.rounds ? [p.rounds] : []))
  return {
    firstStart:
      Math.min(...windows.map((w) => w.from)) - OUR_WEEKEND_LEAD_DAYS * DAY_MS,
    // phaseWindow runs a day past the last date.
    end: Math.max(...windows.map((w) => w.to)) - DAY_MS,
    rounds: rounds.length > 0 ? Math.max(...rounds) : undefined,
  }
}

/** The season an F1 competition is about: `f1-2027` is 2027. */
function competitionSeason(competitionId: string): number | null {
  const match = /^f1-(\d{4})$/.exec(competitionId)
  return match ? Number(match[1]) : null
}

/** A title's field, with the points behind each entrant, from the standings. */
async function titleStandings(kind: F1TitleKind, season: number) {
  if (kind === 'drivers') {
    const rows = await providerCall('/driver_standings', PLAN_REFUSED, () =>
      getF1DriverStandings(season)
    )
    return rows.map((r) => ({
      entrant: f1DriverEntrant(r.driver),
      row: f1DriverStandingRow(r),
    }))
  }
  const rows = await providerCall('/team_standings', PLAN_REFUSED, () =>
    getF1TeamStandings(season)
  )
  return rows.map((r) => ({
    entrant: f1TeamEntrant(r.team),
    row: f1TeamStandingRow(r),
  }))
}

/**
 * The season's title markets, drivers' and constructors' (keys
 * `title:drivers` and `title:constructors`), while the season hasn't
 * started by the provider's calendar or ours (common/sports-calendar.ts),
 * whichever starts it sooner. It closes after the provider's final race once
 * the provider's calendar reaches the season's end (f1CalendarReachesEnd),
 * else at the end of our last date, which resolveF1TitleMarkets corrects
 * when it does. The field is the season's standings once the provider has
 * them, else last season's; the opening prices are last season's points
 * either way. A title that already has a market is skipped, and the check
 * is repeated inside the creating transaction.
 */
async function createF1TitleMarkets(
  pg: SupabaseDirectClient,
  competitionId: string,
  result: F1CreateResult,
  opts: {
    dryRun?: boolean
    picked?: Set<string>
    official: ReturnType<typeof officialFor>
  }
) {
  const season = competitionSeason(competitionId)
  const titles = F1_TITLE_KINDS.map((kind) => ({
    kind,
    key: `title:${kind}`,
    // What the log says until the market's question is known.
    label: `${season ?? competitionId} ${
      kind === 'drivers' ? "drivers'" : "constructors'"
    } title`,
  })).filter(({ key }) => !opts.picked || opts.picked.has(key))
  if (titles.length === 0) return
  const skipAll = (reason: string) => {
    for (const { key, label } of titles) {
      result.skipped++
      result.log.push({ key, question: label, status: 'skipped', reason })
    }
  }
  const ours = ourSeason(competitionId)
  if (!season || !ours)
    return skipAll(`can't tell which season ${competitionId} is`)
  // Without it a title could never pay out by itself.
  if (!ours.rounds)
    return skipAll(
      `our calendar doesn't say how many rounds the ${season} season has, which a title's payout checks need`
    )

  const events = await providerCall('/events', KEY_REFUSED, () =>
    getF1Events(season)
  )
  const provider = f1SeasonDates(events)
  if (events.length > 0 && !provider)
    return skipAll(
      `the provider's ${season} calendar has no weekend left with dates that parse`
    )
  // The provider's final race once its calendar reaches the season's end;
  // until then our last date, which resolveF1TitleMarkets corrects later.
  const fullCalendar =
    !!provider && f1CalendarReachesEnd(provider.lastRaceStart, ours.end)
  const dates = {
    firstStart: Math.min(ours.firstStart, provider?.firstStart ?? Infinity),
    closeTime: fullCalendar
      ? f1TitleCloseTime(provider.lastRaceStart)
      : ours.end,
  }
  if (dates.firstStart <= Date.now() + MIN_CREATE_LEAD_MS)
    return skipAll(
      `the ${season} season's first weekend has started, or may have by our calendar; a title market opens before it`
    )

  for (const { kind, key, label } of titles) {
    let question = label
    const skip = (reason: string) => {
      result.skipped++
      result.log.push({ key, question, status: 'skipped', reason })
    }
    try {
      const current = await titleStandings(kind, season)
      const last = await titleStandings(kind, season - 1)
      const field = (current.length > 0 ? current : last).map((s) => s.entrant)
      const params = buildF1TitleMarketParams(
        season,
        kind,
        field,
        last.map((s) => s.row),
        dates
      )
      if (!params) {
        skip(
          field.length === 0
            ? `no ${season} or ${season - 1} ${kind} standings, so no field`
            : `${field.length} in the ${
                current.length > 0 ? season : season - 1
              } ${kind} standings isn't a field`
        )
        continue
      }
      question = params.question
      const existing = await findSportsMarket(pg, params.sportsEventId, 'title')
      if (existing) {
        skip(`market ${existing.id} already exists`)
        continue
      }
      if (opts.dryRun) {
        const ante = getAnte(
          params.outcomeType,
          params.answers.length,
          LIQUIDITY_TIER
        )
        const source = current.length > 0 ? season : season - 1
        result.log.push({
          key,
          question,
          status: 'dry-run',
          reason: `${describeF1Market(
            params,
            ante
          )}; field from the ${source} standings${
            fullCalendar
              ? ''
              : `; the provider's ${season} calendar ${
                  events.length === 0 ? "isn't out yet" : "doesn't reach ours"
                }, so it closes on our last date until it does`
          }`,
        })
        continue
      }
      const { creator, groupIds } = await opts.official()
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
        { deduplicateMarketType: 'title', minLeadMs: MIN_CREATE_LEAD_MS }
      )
      result.created++
      result.log.push({
        key,
        question,
        status: 'created',
        reason: contractPath(contract),
      })
    } catch (e) {
      // Expected races, as for sessions: another run made it, or the
      // season's first weekend began meanwhile.
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

/**
 * Create the missing markets for one F1 calendar competition: its season's
 * titles before the season starts (createF1TitleMarkets), and the markets
 * of its sessions in the next ROLLING_WINDOW_DAYS: race winner and podium,
 * sprint winner, pole. A session's entry list and opening prices come from
 * the season's driver standings. A session already holding a market of a
 * type is skipped, and the check is repeated inside the creating
 * transaction. `keys` narrows the run to the markets an admin ticked in a
 * dry run. With `switches` (the scheduler), only competitions with a phase
 * switched on get titles, and only sessions inside such a phase get
 * markets; without them (an admin by hand) every phase counts. Throws only
 * when the provider fails; each market's own failure goes in the log.
 */
export async function createF1Markets(
  pg: SupabaseDirectClient,
  competitionId: string,
  opts: {
    dryRun?: boolean
    keys?: string[]
    switches?: CompetitionSwitches
    creator?: User
  } = {}
): Promise<F1CreateResult> {
  const phases = calendarEntriesFor(competitionId)
  const entry = phases[0]
  if (!entry || entry.sport !== 'f1') {
    throw new Error(`${competitionId} is not an F1 competition`)
  }
  const result: F1CreateResult = { created: 0, skipped: 0, errors: 0, log: [] }
  const { switches } = opts
  const windows = (
    switches ? phases.filter((p) => autoCreates(p, switches)) : phases
  ).map(phaseWindow)
  if (windows.length === 0) return result
  const picked = opts.keys ? new Set(opts.keys) : undefined
  const official = officialFor(pg, competitionId, opts.creator)

  // The season's titles don't wait for the window: they open before it starts.
  await createF1TitleMarkets(pg, competitionId, result, {
    dryRun: opts.dryRun,
    picked,
    official,
  })

  const now = Date.now()
  const until = now + ROLLING_WINDOW_DAYS * DAY_MS
  const inRun = (t: number) =>
    t > now && t <= until && windows.some((w) => t >= w.from && t <= w.to)

  const seasons = uniq([now, until].map((t) => new Date(t).getUTCFullYear()))
  const events = (
    await providerCall('/events', KEY_REFUSED, () =>
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
      await providerCall('/sessions', PLAN_REFUSED, () =>
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
      await providerCall('/driver_standings', PLAN_REFUSED, () =>
        getF1DriverStandings(season)
      )
    )
  }

  let planned = 0
  for (const session of sessions) {
    const event = eventById.get(session.event.id)!
    const sessionTitle = `${event.season} ${f1EventTitle(event.name)}: ${
      session.name
    }`
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
        const { creator, groupIds } = await official()
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

/**
 * The daily run: every F1 competition with a phase switched on in
 * /admin/sports that hasn't ended, so a season switched on in the winter
 * gets its titles before its first weekend; its sessions still wait for
 * the ROLLING_WINDOW_DAYS window. All are off by default. A run that can't
 * read the switches creates nothing.
 */
export async function createF1MarketsForActiveCalendar(
  pg: SupabaseDirectClient
): Promise<Record<string, F1CreateResult>> {
  let switches: CompetitionSwitches
  try {
    switches = await getCompetitionSwitches(pg)
  } catch (e) {
    log.error(
      `[sports-f1-create] couldn't read the switches, so this run creates nothing: ${e}`
    )
    return {}
  }
  const now = Date.now()
  const competitionIds = uniq(
    calendarEntriesOverlapping(now, Number.MAX_SAFE_INTEGER)
      .filter((e) => e.provider === 'bdl-f1' && autoCreates(e, switches))
      .map((e) => e.competitionId)
  )
  const out: Record<string, F1CreateResult> = {}
  if (competitionIds.length === 0) return out
  const creator = await sportsCreator()
  for (const competitionId of competitionIds) {
    try {
      out[competitionId] = await createF1Markets(pg, competitionId, {
        switches,
        creator,
      })
    } catch (e) {
      // A provider outage or a lapsed plan stops the competition: an error,
      // so it alerts.
      log.error(`[sports-f1-create] ${competitionId} didn't run: ${e}`)
    }
  }
  return out
}

// ─── Resolving markets ────────────────────────────────────────────────────────

/** An unresolved market this long after its close needs a person. */
const ATTENTION_AFTER_MS = 12 * HOUR_MS
/**
 * A run checks every due market of the last RESOLVE_LOOKBACK_MS, so markets
 * stuck waiting for a person can't crowd out ones that can resolve (F1 makes
 * a few a weekend). More than this is a backlog a person has to see.
 */
const MAX_DUE_MARKETS = 1000
/** How far back a run looks: anything stuck longer was reported long ago. */
const RESOLVE_LOOKBACK_MS = 30 * DAY_MS
/** The `alerted` key for the backlog warning. */
const BACKLOG_ALERT = 'f1-resolve-backlog'

/**
 * A check for resolveMarketHelper to run on its transaction's read of the
 * market: refuse when an answer has since been resolved other than the
 * classification (or the cancellation) says, so a person's resolution that
 * lands after this run's snapshot stops the payout instead of mixing with it.
 */
const agreesWith =
  (intended: (answerId: string) => string) => (fresh: MarketContract) => {
    const other = (fresh as CPMMMultiContract).answers?.find(
      (a) => a.resolution && a.resolution !== intended(a.id)
    )
    if (other)
      throw new Error(
        `${other.text} was resolved ${
          other.resolution
        } meanwhile, but the run means ${intended(other.id)}`
      )
  }

/** 'moved': a title market's close moved to the season's final race. */
export type F1ResolveStatus =
  | 'resolved'
  | 'waiting'
  | 'attention'
  | 'moved'
  | 'error'

export interface F1ResolveResult {
  checked: number
  resolved: number
  waiting: number
  attention: number
  moved: number
  errors: number
  log: {
    contractId: string
    question: string
    status: F1ResolveStatus
    reason: string
  }[]
}

const emptyResolveResult = (): F1ResolveResult => ({
  checked: 0,
  resolved: 0,
  waiting: 0,
  attention: 0,
  moved: 0,
  errors: 0,
  log: [],
})

/**
 * Where a market that needs a person is reported on prod, besides the
 * error log: the scheduler's alert policy only pages for a crashed job.
 */
const ATTENTION_EMAIL = 'info@manifold.markets'

/**
 * A run's log lines and counts. `attention` is what only a person can
 * settle: logged as an error and, on prod, emailed to ATTENTION_EMAIL, once
 * per market for the life of `alerted` (so a scheduler restart repeats it
 * for a market still waiting).
 */
function resolveLog(result: F1ResolveResult, alerted: Set<string>) {
  const add = (
    contract: { id: string; question: string },
    status: F1ResolveStatus,
    reason: string
  ) => {
    result[status === 'error' ? 'errors' : status]++
    result.log.push({
      contractId: contract.id,
      question: contract.question,
      status,
      reason,
    })
  }
  const attention = (
    contract: {
      id: string
      question: string
      slug: string
      creatorUsername: string
    },
    reason: string
  ) => {
    add(contract, 'attention', reason)
    if (alerted.has(contract.id)) return
    alerted.add(contract.id)
    log.error(
      `[sports-f1-resolve] ${contract.id} (${contract.question}) needs a person: ${reason}`
    )
    if (!isProd()) return
    // Not awaited: a run shouldn't wait on mail, and sendTextEmail logs its
    // own failure.
    void sendTextEmail(
      ATTENTION_EMAIL,
      `F1 market needs a person: ${contract.question}`,
      [
        `${reason}.`,
        ``,
        `https://${DOMAIN}${contractPath(contract)}`,
        ``,
        `It won't pay out by itself: resolve it by hand, or fix what's missing and the resolver picks it up. From sports-f1-resolve, once per scheduler process.`,
      ].join('\n')
    )
  }
  return { add, attention }
}

const getAnswers = async (pg: SupabaseDirectClient, contractId: string) =>
  (
    await pg.manyOrNone(`select * from answers where contract_id = $1`, [
      contractId,
    ])
  ).map(convertAnswer)

/**
 * Resolve the F1 markets that closed at least F1_RESOLVE_DELAY_HOURS ago and
 * within RESOLVE_LOOKBACK_MS, from the provider's classification of their
 * session, once that session and its results are the market's own (the
 * event and session ids in sportsEventId). A cancelled session
 * resolves N/A; a final one resolves through f1SessionResolution, a winner
 * market to one answer and a podium market answer by answer (a run that
 * stops half way picks up the rest). Anything else waits. What only a person
 * can settle, a classification that doesn't check out, an answer already
 * resolved the other way, or a session still not final or without results
 * ATTENTION_AFTER_MS after close, is logged as an error once per market for
 * the life of `alerted`, and never guessed.
 */
export async function resolveF1Markets(
  pg: SupabaseDirectClient,
  alerted: Set<string> = new Set()
): Promise<F1ResolveResult> {
  const result = emptyResolveResult()
  const now = Date.now()
  const rows = await pg.manyOrNone(
    `select ${contractColumnsToSelect} from contracts
     where data->>'sportsEventId' like 'bdl-f1:%'
       and creator_id = any($1)
       and token = 'MANA'
       and resolution is null
       and close_time <= $2
       and close_time > $3
     order by close_time asc
     limit ${MAX_DUE_MARKETS + 1}`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      millisToTs(now - F1_RESOLVE_DELAY_HOURS * HOUR_MS),
      millisToTs(now - RESOLVE_LOOKBACK_MS),
    ]
  )
  if (rows.length > MAX_DUE_MARKETS && !alerted.has(BACKLOG_ALERT)) {
    alerted.add(BACKLOG_ALERT)
    log.error(
      `[sports-f1-resolve] more than ${MAX_DUE_MARKETS} F1 markets are due; the newest wait until a person clears the backlog`
    )
  }
  const contracts = rows
    .slice(0, MAX_DUE_MARKETS)
    .map((r) => convertContract(r) as CPMMMultiContract & SportsContract)
  result.checked = contracts.length
  if (contracts.length === 0) return result
  const { add, attention } = resolveLog(result, alerted)

  const ids = new Map(
    contracts.map((c) => [c.id, parseF1EventId(c.sportsEventId)])
  )
  const eventIds = uniq(
    [...ids.values()].flatMap((id) => (id ? [id.eventId] : []))
  )
  const sessions =
    eventIds.length > 0
      ? await providerCall('/sessions', KEY_OR_PLAN_REFUSED, () =>
          getF1Sessions(eventIds)
        )
      : []
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const resultsBySession = new Map<number, F1SessionResult[]>()
  let creator: User | undefined

  for (const contract of contracts) {
    const id = ids.get(contract.id)
    // Waiting turns into a person's job once the market is long closed.
    const wait = (reason: string) => {
      const closedFor = now - (contract.closeTime ?? now)
      if (closedFor < ATTENTION_AFTER_MS) add(contract, 'waiting', reason)
      else
        attention(
          contract,
          `${reason}, ${Math.round(closedFor / HOUR_MS)} hours after close`
        )
    }
    try {
      if (!id) {
        attention(contract, `can't read ${contract.sportsEventId}`)
        continue
      }
      const session = sessionById.get(id.sessionId)
      if (!session) {
        wait(`the provider doesn't list session ${id.sessionId}`)
        continue
      }
      if (session.event?.id !== id.eventId) {
        attention(
          contract,
          `the provider files session ${session.id} under event ${session.event?.id}, not ${id.eventId}`
        )
        continue
      }
      const answers = await getAnswers(pg, contract.id)
      const multi = { ...contract, answers }

      if (session.status_state === 'canceled') {
        // The description promises N/A. An answer that's already resolved
        // some other way is a person's call.
        const done = answers.find(
          (a) => a.resolution && a.resolution !== 'CANCEL'
        )
        if (done) {
          attention(
            contract,
            `the session was cancelled but ${done.text} is resolved ${done.resolution}`
          )
          continue
        }
        creator ??= await sportsCreator()
        if (contract.shouldAnswersSumToOne) {
          await resolveMarketHelper(multi, creator, creator, {
            outcome: 'CANCEL',
          })
        } else {
          for (const a of sortBy(answers, (x) => x.index)) {
            if (a.resolution) continue
            await resolveMarketHelper(
              multi,
              creator,
              creator,
              { outcome: 'CANCEL', answerId: a.id },
              undefined,
              agreesWith(() => 'CANCEL')
            )
          }
        }
        add(contract, 'resolved', 'N/A: the session was cancelled')
        continue
      }
      if (session.status_state !== 'final') {
        wait(`the session is ${session.status_state}`)
        continue
      }

      let results = resultsBySession.get(session.id)
      if (!results) {
        results = await providerCall(
          '/session_results',
          KEY_OR_PLAN_REFUSED,
          () => getF1SessionResults(session.id)
        )
        resultsBySession.set(session.id, results)
      }
      // Seen in October 2026: final sessions whose classification never
      // arrived. Wait, then hand it to a person.
      if (results.length === 0) {
        wait('the session is final but has no classification yet')
        continue
      }
      // Only the session's own classification can pay out.
      const foreign = results.find((r) => r.session?.id !== session.id)
      if (foreign) {
        attention(
          contract,
          `the results for session ${session.id} include session ${foreign.session?.id}'s`
        )
        continue
      }
      const marketType = contract.sportsMarketType
      if (marketType !== 'winner' && marketType !== 'podium') {
        attention(contract, `unknown market type ${marketType}`)
        continue
      }
      const resolution = f1SessionResolution(
        session,
        results,
        answers,
        contract.sportsEntrantIds ?? [],
        marketType
      )
      if (!resolution) {
        attention(
          contract,
          "the classification doesn't check out against the market's field"
        )
        continue
      }
      creator ??= await sportsCreator()
      if (resolution.kind === 'sum-to-one') {
        await resolveMarketHelper(multi, creator, creator, {
          outcome: resolution.outcome,
          resolutions: resolution.resolutions,
        })
        const winner = answers.find((a) => a.id === resolution.outcome)
        add(contract, 'resolved', `${winner?.text ?? resolution.outcome}`)
        continue
      }
      const conflict = answers.find(
        (a) => a.resolution && a.resolution !== resolution.resolutions[a.id]
      )
      if (conflict) {
        attention(
          contract,
          `${conflict.text} is resolved ${
            conflict.resolution
          }, but the classification says ${resolution.resolutions[conflict.id]}`
        )
        continue
      }
      const intended = (answerId: string) => resolution.resolutions[answerId]
      for (const a of sortBy(answers, (x) => x.index)) {
        if (a.resolution) continue
        await resolveMarketHelper(
          multi,
          creator,
          creator,
          { outcome: intended(a.id), answerId: a.id },
          undefined,
          agreesWith(intended)
        )
      }
      add(
        contract,
        'resolved',
        `YES: ${answers
          .filter((a) => resolution.resolutions[a.id] === 'YES')
          .map((a) => a.text)
          .join(', ')}`
      )
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      add(contract, 'error', reason)
      log.error(`[sports-f1-resolve] ${contract.id} failed: ${reason}`)
    }
  }
  return result
}

// ─── Resolving titles ─────────────────────────────────────────────────────────

/** The most open title markets a run reads: there are two a season. */
const MAX_TITLE_MARKETS = 20

const iso = (t: number) => new Date(t).toISOString().slice(0, 16) + 'Z'

/**
 * Every open title market (createF1TitleMarkets), every run. While one is
 * open and the provider's calendar reaches the season's end by ours
 * (f1CalendarReachesEnd), its close follows the final race
 * (f1TitleCloseTime), or comes now if that has passed: a season the
 * provider didn't list yet when the market opened, or a final race that
 * moves, closes it at the right time. A market already closed isn't
 * reopened. Once every weekend is final or cancelled, the calendar reaches
 * the end, and F1_TITLE_RESOLVE_DELAY_HOURS have passed since the final
 * race's market closed, it resolves to the leader of the season's final
 * standings (f1TitleResolution), provided they add up to the points every
 * final race and sprint awards (f1SeasonPointsAwarded) and the calendar
 * lists every announced round (f1CalendarListsEveryRound). What only a
 * person can settle, standings that don't add up or check out, a missing
 * weekend, a champion the
 * field doesn't list, an answer already resolved against them, or a season
 * still not over ATTENTION_AFTER_MS after the market was due, is logged as
 * an error once per market for the life of `alerted`, and never guessed.
 */
export async function resolveF1TitleMarkets(
  pg: SupabaseDirectClient,
  alerted: Set<string> = new Set()
): Promise<F1ResolveResult> {
  const result = emptyResolveResult()
  const rows = await pg.manyOrNone(
    `select ${contractColumnsToSelect} from contracts
     where data->>'sportsEventId' like 'bdl-f1-title:%'
       and creator_id = any($1)
       and token = 'MANA'
       and resolution is null
     order by close_time asc
     limit ${MAX_TITLE_MARKETS}`,
    [MANIFOLD_SPORTS_USER_IDS]
  )
  const contracts = rows.map(
    (r) => convertContract(r) as CPMMMultiContract & SportsContract
  )
  result.checked = contracts.length
  if (contracts.length === 0) return result
  const { add, attention } = resolveLog(result, alerted)
  const now = Date.now()
  const delayMs = F1_TITLE_RESOLVE_DELAY_HOURS * HOUR_MS
  const eventsBySeason = new Map<number, F1Event[]>()
  let creator: User | undefined

  for (const contract of contracts) {
    // Waiting turns into a person's job once the market is long overdue.
    const wait = (reason: string) => {
      const overdueFor = now - ((contract.closeTime ?? now) + delayMs)
      if (overdueFor < ATTENTION_AFTER_MS) add(contract, 'waiting', reason)
      else
        attention(
          contract,
          `${reason}, ${Math.round(
            overdueFor / HOUR_MS
          )} hours after it was due to pay out`
        )
    }
    try {
      const id = parseF1TitleEventId(contract.sportsEventId)
      if (!id) {
        attention(contract, `can't read ${contract.sportsEventId}`)
        continue
      }
      let events = eventsBySeason.get(id.season)
      if (!events) {
        events = await providerCall('/events', KEY_REFUSED, () =>
          getF1Events(id.season)
        )
        eventsBySeason.set(id.season, events)
      }
      const ours = ourSeason(`f1-${id.season}`)
      if (!ours) {
        attention(contract, `our calendar has no F1 ${id.season} season`)
        continue
      }
      const seasonEvents = events
      const dates = f1SeasonDates(events)
      const fullCalendar =
        !!dates && f1CalendarReachesEnd(dates.lastRaceStart, ours.end)

      // Close with the final race market, or now if that has passed.
      const close = contract.closeTime
      if (dates && fullCalendar && close !== undefined && close > now) {
        const target = Math.max(f1TitleCloseTime(dates.lastRaceStart), now)
        if (target !== close) {
          await pg.none(
            `update contracts set data = data || $1::jsonb
             where id = $2 and resolution is null and close_time > now()`,
            [JSON.stringify({ closeTime: target }), contract.id]
          )
          log(
            `[sports-f1-resolve] ${contract.id}: close moved from ${iso(
              close
            )} to ${iso(target)}, by the final race's`
          )
          add(contract, 'moved', `close ${iso(close)} → ${iso(target)}`)
          continue
        }
      }

      if (!f1SeasonComplete(events)) {
        wait(`the provider's ${id.season} season isn't over`)
        continue
      }
      if (!dates) {
        attention(
          contract,
          `the provider's ${id.season} calendar has dates that don't parse`
        )
        continue
      }
      if (!fullCalendar) {
        wait(
          `the provider's ${id.season} calendar ends ${iso(
            dates.lastRaceStart
          )}, more than ${F1_SEASON_END_TOLERANCE_DAYS} days before ours (${iso(
            ours.end
          )}), so it may be missing races`
        )
        continue
      }
      const dueAt = f1TitleCloseTime(dates.lastRaceStart) + delayMs
      if (now < dueAt) {
        add(contract, 'waiting', `pays out from ${iso(dueAt)}`)
        continue
      }
      if (!f1CalendarListsEveryRound(seasonEvents, ours.rounds)) {
        attention(
          contract,
          ours.rounds
            ? `the provider lists ${seasonEvents.length} weekends for ${id.season}, but the season has ${ours.rounds} rounds: one may be missing, so its sessions can't vouch for the standings`
            : `our calendar doesn't say how many rounds the ${id.season} season has`
        )
        continue
      }

      // The standings have to add up to every final race and sprint, so a
      // feed still on its pre-finale snapshot can't pay out.
      const sessions = await providerCall(
        '/sessions',
        KEY_OR_PLAN_REFUSED,
        () =>
          getF1Sessions(
            seasonEvents
              .filter((e) => e.status_state !== 'canceled')
              .map((e) => e.id)
          )
      )
      const awarded = f1SeasonPointsAwarded(seasonEvents, sessions)
      if (!awarded) {
        attention(
          contract,
          `the provider's ${id.season} sessions don't show one final race for every weekend held (or a sprint is unfinished, or a session is from elsewhere), so they can't vouch for the standings`
        )
        continue
      }
      const standings =
        id.kind === 'drivers'
          ? (
              await providerCall('/driver_standings', KEY_OR_PLAN_REFUSED, () =>
                getF1DriverStandings(id.season)
              )
            ).map(f1DriverStandingRow)
          : (
              await providerCall('/team_standings', KEY_OR_PLAN_REFUSED, () =>
                getF1TeamStandings(id.season)
              )
            ).map(f1TeamStandingRow)
      const total = sum(standings.map((s) => s.points))
      if (!(Math.abs(total - awarded.points) < 1e-6)) {
        attention(
          contract,
          `the final ${id.season} ${id.kind} standings add up to ${total} points, but its ${awarded.races} races and ${awarded.sprints} sprints award ${awarded.points}: the standings may be stale, a race paid half points, or a penalty took points`
        )
        continue
      }
      const answers = await getAnswers(pg, contract.id)
      const resolution = f1TitleResolution(
        id.season,
        id.kind,
        standings,
        answers,
        contract.sportsEntrantIds ?? []
      )
      if (!resolution) {
        const margin = f1TitleMargin(standings)
        const safe = F1_TITLE_SAFE_MARGIN[id.kind]
        attention(
          contract,
          margin > safe
            ? `the final ${id.season} ${id.kind} standings don't check out against the market's field, or the champion isn't one of its answers`
            : `the ${id.season} ${id.kind}' title was won by ${margin} points, within what one weekend's results can change (${safe}), so a person checks the standings before it pays`
        )
        continue
      }
      // An answer someone resolved by hand meanwhile (a driver ruled out
      // NO) has to agree with the standings, here and on the fresh read.
      const intended = (answerId: string) =>
        answerId === resolution.outcome ? 'YES' : 'NO'
      const conflict = answers.find(
        (a) => a.resolution && a.resolution !== intended(a.id)
      )
      if (conflict) {
        attention(
          contract,
          `${conflict.text} is resolved ${
            conflict.resolution
          }, but the standings say ${intended(conflict.id)}`
        )
        continue
      }
      creator ??= await sportsCreator()
      await resolveMarketHelper(
        { ...contract, answers },
        creator,
        creator,
        { outcome: resolution.outcome, resolutions: resolution.resolutions },
        undefined,
        agreesWith(intended)
      )
      const champion = answers.find((a) => a.id === resolution.outcome)
      add(contract, 'resolved', champion?.text ?? resolution.outcome)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      add(contract, 'error', reason)
      log.error(`[sports-f1-resolve] ${contract.id} failed: ${reason}`)
    }
  }
  return result
}
