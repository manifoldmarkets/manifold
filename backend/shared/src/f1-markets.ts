/**
 * Formula 1 markets from BALLDONTLIE: a market per upcoming session and
 * market type, built by common/f1-markets.ts. The daily sports-f1-create job
 * makes them for the F1 calendar phases switched on in /admin/sports (an
 * admin can also make them by hand on dev), and the sports-f1-resolve job
 * resolves them from the session's classification.
 *
 * State lives on the contracts: `sportsEventId` is
 * `bdl-f1:<event id>:<session id>` and `sportsMarketType` is 'winner' or
 * 'podium', so dedupe is a lookup on those two and the resolver knows which
 * session to ask about from the market alone.
 */

import { sortBy, uniq } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect, log } from 'shared/utils'
import { anythingToRichText } from 'shared/tiptap'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
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
} from 'shared/balldontlie-f1-client'
import {
  buildF1MarketParams,
  F1_DAYS_AHEAD,
  F1_MARKETS_BY_SESSION,
  F1_RESOLVE_DELAY_HOURS,
  F1DriverStanding,
  f1EventTitle,
  F1MarketParams,
  f1SessionKind,
  f1SessionResolution,
  F1SessionResult,
  parseF1EventId,
} from 'common/f1-markets'
import {
  contractPath,
  CPMMMultiContract,
  MarketContract,
  SportsContract,
} from 'common/contract'
import { getAnte } from 'common/economy'
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
 * the next ROLLING_WINDOW_DAYS: race winner and podium, sprint winner, pole. The entry
 * list and the opening prices come from the season's driver standings. A
 * session already holding a market of a type is skipped, and the check is
 * repeated inside the creating transaction. `keys` narrows the run to the
 * markets an admin ticked in a dry run. With `switches` (the scheduler),
 * only sessions inside a phase switched on are created; without them (an
 * admin by hand) every phase counts. Throws only when the provider fails;
 * each market's own failure goes in the log.
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
  // A preview only reads; the creator and group are looked up on the first
  // insert.
  let creator = opts.creator
  let groupIds: string[] | undefined

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

/**
 * The daily run: every F1 competition with a phase switched on in
 * /admin/sports inside the next two weeks. All are off by default. A run
 * that can't read the switches creates nothing.
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
    calendarEntriesOverlapping(now, now + ROLLING_WINDOW_DAYS * DAY_MS)
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

export type F1ResolveStatus = 'resolved' | 'waiting' | 'attention' | 'error'

export interface F1ResolveResult {
  checked: number
  resolved: number
  waiting: number
  attention: number
  errors: number
  log: {
    contractId: string
    question: string
    status: F1ResolveStatus
    reason: string
  }[]
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
  const result: F1ResolveResult = {
    checked: 0,
    resolved: 0,
    waiting: 0,
    attention: 0,
    errors: 0,
    log: [],
  }
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
    contract: { id: string; question: string },
    reason: string
  ) => {
    add(contract, 'attention', reason)
    if (alerted.has(contract.id)) return
    alerted.add(contract.id)
    log.error(
      `[sports-f1-resolve] ${contract.id} (${contract.question}) needs a person: ${reason}`
    )
  }

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
