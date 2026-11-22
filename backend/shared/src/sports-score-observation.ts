import type { Answer } from 'common/answer'
import type { FDMatch } from 'common/sports'
import { isMultiCpmm, MarketContract, Sports } from 'common/contract'
import {
  ScoreFixture,
  SportsLiveScore,
  splitFlag,
} from 'common/sports-schedule'
import type { SupabaseDirectClient } from './supabase/init'

export type ScoreSource = ScoreFixture & {
  provider: 'odds' | 'football-data'
  creatorId: string
  league: string
}

type ScoreMarket = MarketContract &
  Partial<Sports & Observation> & {
    sportsScoreReadCompletedAt?: number
    sportsScoreConflictStamp?: number | null
    sportsScoreReadStartedAt?: number
    sportsScoreProviderWatermark?: number | null
    sportsScoreAnswers?: [string, number, string][] | null
    sportsScoreConflict?: boolean
  }
type ScoreAnswer = Pick<
  Answer,
  'id' | 'text' | 'index' | 'resolution' | 'resolutionTime'
>
type Observation = SportsLiveScore & {
  sportsScoreWinner?: FDMatch['score']['winner']
  sportsScoreDuration?: string | null
  sportsPenHome?: number | null
  sportsPenAway?: number | null
}

export function boundScore(
  source: ScoreSource,
  patch: Observation
): SportsLiveScore {
  const { eventId, home, away, homeId, awayId } = source
  return { ...patch, scoreFixture: { eventId, home, away, homeId, awayId } }
}

export function sameNames(left: string, right: string) {
  return (
    splitFlag(left).name.trim().toLowerCase() ===
    splitFlag(right).name.trim().toLowerCase()
  )
}

function sameFixture(a: ScoreFixture | undefined, b: ScoreFixture) {
  return (
    a?.eventId === b.eventId &&
    typeof a.home === 'string' &&
    typeof a.away === 'string' &&
    typeof b.home === 'string' &&
    typeof b.away === 'string' &&
    sameNames(a.home, b.home) &&
    sameNames(a.away, b.away) &&
    a.homeId === b.homeId &&
    a.awayId === b.awayId
  )
}

function validScore(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
}

function terminal(status: string | undefined) {
  return status === 'FINISHED' || status === 'AWARDED'
}

/** Native tournament markets are home, away, then optionally Draw, ordered by answer index. */
export function confirmedTournamentAnswer(
  patch: Observation,
  answers: readonly ScoreAnswer[]
) {
  const {
    sportsHomeScore: home,
    sportsAwayScore: away,
    sportsScoreDuration: duration,
    sportsScoreWinner: winner,
    sportsPenHome: penHome,
    sportsPenAway: penAway,
  } = patch
  if (
    !terminal(patch.sportsLiveStatus) ||
    !validScore(home) ||
    !validScore(away)
  )
    return
  let left = home
  let right = away
  if (duration === 'PENALTY_SHOOTOUT') {
    if (
      answers.length !== 2 ||
      home !== away ||
      !validScore(penHome) ||
      !validScore(penAway) ||
      penHome === penAway
    )
      return
    left = penHome
    right = penAway
  } else if (
    (duration !== 'REGULAR' &&
      !(duration === 'EXTRA_TIME' && answers.length === 2)) ||
    penHome != null ||
    penAway != null
  ) {
    return
  }
  const result =
    left > right ? 'HOME_TEAM' : left < right ? 'AWAY_TEAM' : 'DRAW'
  if (winner !== result) return
  return [...answers].sort((a, b) => a.index - b.index)[
    result === 'HOME_TEAM' ? 0 : result === 'AWAY_TEAM' ? 1 : 2
  ]
}

function identifiesGame(
  c: ScoreMarket,
  source: ScoreSource,
  answers: readonly ScoreAnswer[]
) {
  if (
    typeof source.home !== 'string' ||
    typeof source.away !== 'string' ||
    !source.home.trim() ||
    !source.away.trim() ||
    sameNames(source.home, source.away) ||
    c.creatorId !== source.creatorId ||
    c.token !== 'MANA' ||
    c.deleted ||
    c.isResolved ||
    c.visibility !== 'public' ||
    c.sportsFixture ||
    c.sportsEventId !== source.eventId ||
    (c.sportsProvider != null && c.sportsProvider !== source.provider) ||
    c.sportsLeague !== source.league ||
    (c.sportsMarketType != null && c.sportsMarketType !== 'moneyline') ||
    c.outcomeType !== 'MULTIPLE_CHOICE' ||
    !isMultiCpmm(c) ||
    !c.shouldAnswersSumToOne ||
    (c.sportsHomeTeam != null && c.sportsHomeTeam !== source.home) ||
    (c.sportsAwayTeam != null && c.sportsAwayTeam !== source.away) ||
    c.sportsHomeTeamId !== source.homeId ||
    c.sportsAwayTeamId !== source.awayId ||
    answers.length < 2 ||
    answers.length > 3 ||
    answers.some(
      (a) => a.resolution != null || a.resolutionTime != null || !a.text?.trim()
    )
  )
    return false

  const ordered = [...answers].sort((a, b) => a.index - b.index)
  const names = ordered.map((a) => a.text)
  if (
    new Set(ordered.map((a) => a.id)).size !== answers.length ||
    new Set(ordered.map((a) => a.index)).size !== answers.length
  )
    return false
  if (source.provider === 'football-data') {
    // Historical tournament contracts store sides in creation-order answers, often with flag prefixes.
    return (
      sameNames(names[0], source.home) &&
      sameNames(names[1], source.away) &&
      (names.length === 2 || sameNames(names[2], 'Draw'))
    )
  }
  return (
    c.sportsHomeTeam === source.home &&
    c.sportsAwayTeam === source.away &&
    names.filter((n) => sameNames(n, source.home)).length === 1 &&
    names.filter((n) => sameNames(n, source.away)).length === 1 &&
    (names.length === 2 ||
      names.some((n) => sameNames(n, 'Draw') || sameNames(n, 'Tie')))
  )
}

function comparableTime(value: number | null | undefined) {
  return value != null && Number.isSafeInteger(value) && value > 0 ? value : 0
}

function sameResult(data: ScoreMarket, patch: Observation) {
  return (
    data.sportsLiveStatus === patch.sportsLiveStatus &&
    data.sportsHomeScore === patch.sportsHomeScore &&
    data.sportsAwayScore === patch.sportsAwayScore &&
    (data.sportsScoreWinner ?? null) === (patch.sportsScoreWinner ?? null) &&
    (data.sportsScoreDuration ?? null) ===
      (patch.sportsScoreDuration ?? null) &&
    (data.sportsPenHome ?? null) === (patch.sportsPenHome ?? null) &&
    (data.sportsPenAway ?? null) === (patch.sportsPenAway ?? null)
  )
}

// An independent later fetch can order undated observations. Overlapping or
// tied conflicting results invalidate a pending payout until their order is known.
export type ScoreEvidence = {
  conflict?: boolean
  undatedConflict?: boolean
  providerWatermark?: number
  dated?: {
    stamp: number
    completed: boolean
    home: number | null
    away: number | null
  }
  terminalOnly?: boolean
}

function scoreDecision(
  data: ScoreMarket,
  source: ScoreSource,
  patch: Observation,
  startedAt: number,
  replacement: boolean,
  evidence: ScoreEvidence,
  seenStamp: number
) {
  const previous = data.sportsLiveUpdatedTime
  const conflicted = data.sportsScoreConflict === true
  const pending = terminal(data.sportsLiveStatus)
  if (evidence.terminalOnly && (replacement || (!pending && !conflicted)))
    return 'skip'
  if (previous == null || replacement)
    return evidence.conflict ? 'hold' : 'write'
  if (!Number.isSafeInteger(previous)) return 'skip'
  const odds = source.provider === 'odds'
  const priorStamp = odds
    ? Math.max(
        comparableTime(data.sportsScoreProviderWatermark),
        comparableTime(data.sportsScoreUpdatedTime)
      )
    : 0
  const stamp = odds ? comparableTime(patch.sportsScoreUpdatedTime) : 0
  if (
    priorStamp &&
    seenStamp &&
    seenStamp < priorStamp &&
    !evidence.undatedConflict
  )
    return 'skip'
  const newer = priorStamp > 0 && seenStamp > priorStamp
  const equalStamp = priorStamp > 0 && seenStamp === priorStamp
  const same = sameResult(data, patch)
  const start = data.sportsScoreReadStartedAt ?? 0
  const end = data.sportsScoreReadCompletedAt ?? previous
  const receipt = patch.sportsLiveUpdatedTime
  const later = startedAt >= end && receipt > end
  const earlier = receipt <= start && receipt < end
  if (!data.scoreFixture && !later) return 'skip'
  // The latest undated read can supersede a stale copy, but cannot erase a
  // direct disagreement at the stored result's own vendor timestamp.
  const dated = evidence.dated
  if (
    !conflicted &&
    dated &&
    dated.stamp === data.sportsScoreUpdatedTime &&
    (dated.completed !== pending ||
      dated.home !== data.sportsHomeScore ||
      dated.away !== data.sportsAwayScore)
  )
    return 'hold'
  // Verified vendor chronology outranks local commit and processing order.
  if (equalStamp && !conflicted && (evidence.conflict || !same)) return 'hold'
  if (!newer && earlier) return 'skip'
  if (evidence.conflict) return 'hold'
  if (conflicted) {
    if (evidence.terminalOnly && !terminal(patch.sportsLiveStatus))
      return later || newer ? 'hold' : 'skip'
    const disputeStamp =
      data.sportsScoreConflictStamp === undefined
        ? priorStamp
        : comparableTime(data.sportsScoreConflictStamp)
    return (disputeStamp > 0 ? stamp > disputeStamp : newer || later)
      ? 'write'
      : 'skip'
  }
  if (pending && !terminal(patch.sportsLiveStatus)) {
    const withdrawn = ['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(
      patch.sportsLiveStatus
    )
    return odds
      ? newer || equalStamp
        ? 'hold'
        : 'skip'
      : withdrawn
      ? 'hold'
      : 'skip'
  }
  if (newer) return 'write'
  if (
    same &&
    terminal(patch.sportsLiveStatus) &&
    sameFixture(data.scoreFixture, source) &&
    (equalStamp || (receipt === previous && startedAt === start))
  ) {
    if (!Array.isArray(data.sportsScoreAnswers)) return later ? 'write' : 'skip'
    return 'replay'
  }
  if (!later)
    return !same && pending && terminal(patch.sportsLiveStatus)
      ? 'hold'
      : 'skip'
  return 'write'
}

function answerBindings(answers: readonly ScoreAnswer[]) {
  return [...answers]
    .sort((a, b) => a.index - b.index)
    .map(({ id, index, text }): [string, number, string] => [id, index, text])
}

export type WrittenScore = {
  id: string
  old_home: number | null
  old_away: number | null
  held?: SportsLiveScore
  replayedAt?: number
  answers: ScoreAnswer[]
}

// Locks in the same order as native market operations. The event index bounds
// the lookup for tournaments; an Odds poll additionally knows the contract ID.
export async function writeFixtureScore(
  pg: SupabaseDirectClient,
  source: ScoreSource,
  patch: Observation,
  startedAt: number,
  contractId?: string,
  isCurrent: () => boolean = () => true,
  preview = false,
  evidence: ScoreEvidence = {}
): Promise<WrittenScore[]> {
  if (
    !(patch.sportsHomeScore === null || validScore(patch.sportsHomeScore)) ||
    !(patch.sportsAwayScore === null || validScore(patch.sportsAwayScore)) ||
    (patch.sportsPenHome != null && !validScore(patch.sportsPenHome)) ||
    (patch.sportsPenAway != null && !validScore(patch.sportsPenAway)) ||
    !Number.isSafeInteger(startedAt) ||
    startedAt < 0 ||
    !Number.isSafeInteger(patch.sportsLiveUpdatedTime) ||
    startedAt > patch.sportsLiveUpdatedTime
  )
    return []
  return pg.tx(async (tx) => {
    if (!isCurrent()) return []
    const markets = await tx.manyOrNone<{
      id: string
      data: ScoreMarket
      token: 'MANA'
    }>(
      `select id, data, token from contracts
       where data->>'sportsEventId' = $1 and creator_id = $2 and token = 'MANA'
         and resolution is null and visibility = 'public' and deleted = false
         and ($3::text is null or id = $3)
       order by id ${preview ? '' : 'for update'}`,
      [source.eventId, source.creatorId, contractId ?? null]
    )
    const accepted: WrittenScore[] = []
    for (const { id, data, token } of markets) {
      const replacement =
        data.scoreFixture != null && !sameFixture(data.scoreFixture, source)
      const watermark =
        source.provider === 'odds'
          ? Math.max(
              comparableTime(patch.sportsScoreUpdatedTime),
              comparableTime(evidence.providerWatermark)
            )
          : 0
      const decision = scoreDecision(
        data,
        source,
        patch,
        startedAt,
        replacement,
        evidence,
        watermark
      )
      if (decision === 'skip') continue
      const answers = await tx.manyOrNone<ScoreAnswer>(
        `select id, text, index, resolution, extract(epoch from resolution_time) * 1000 as "resolutionTime" from answers where contract_id = $1 order by id ${
          preview ? '' : 'for share'
        }`,
        [id]
      )
      if (!isCurrent() || !identifiesGame({ ...data, token }, source, answers))
        continue
      const bindings = answerBindings(answers)
      const replay = decision === 'replay'
      if (
        replay &&
        (!Array.isArray(data.sportsScoreAnswers) ||
          data.sportsScoreAnswers.length !== bindings.length ||
          !data.sportsScoreAnswers.every(
            (row, i) =>
              Array.isArray(row) &&
              row.length === 3 &&
              row.every((value, j) => value === bindings[i][j])
          ))
      )
        continue
      const priorStarted = replacement ? 0 : data.sportsScoreReadStartedAt ?? 0
      const priorCompleted = replacement
        ? 0
        : data.sportsScoreReadCompletedAt ?? data.sportsLiveUpdatedTime ?? 0
      // A later independent confirmation advances acquisition ordering while the
      // original payout receipt and its native answers remain bound.
      if (
        !preview &&
        replay &&
        startedAt >= priorCompleted &&
        patch.sportsLiveUpdatedTime > priorCompleted
      ) {
        await tx.none(
          'update contracts set data=data || $1::jsonb where id=$2',
          [
            JSON.stringify({
              sportsScoreReadStartedAt: startedAt,
              sportsScoreReadCompletedAt: patch.sportsLiveUpdatedTime,
            }),
            id,
          ]
        )
      }
      const held: Observation | undefined =
        decision === 'hold'
          ? {
              sportsHomeScore: null,
              sportsAwayScore: null,
              sportsLiveMinute: null,
              sportsLiveStatus: 'UNKNOWN',
              sportsScoreUpdatedTime: null,
              sportsLiveUpdatedTime: Math.max(
                replacement ? 0 : data.sportsLiveUpdatedTime ?? 0,
                patch.sportsLiveUpdatedTime
              ),
              sportsScoreWinner: null,
              sportsScoreDuration: null,
              sportsPenHome: null,
              sportsPenAway: null,
            }
          : undefined
      if (!preview && !replay) {
        const cleared = replacement
          ? {
              sportsScoreWinner: null,
              sportsScoreDuration: null,
              sportsPenHome: null,
              sportsPenAway: null,
              sportsLivePeriod: null,
              sportsLiveClock: null,
              sportsLiveDetail: null,
              sportsFinalQualifier: null,
              sportsScoreUpdatedTime: null,
              sportsResumptionTime: null,
            }
          : {}
        await tx.none(
          `update contracts set data=data || $1::jsonb where id=$2`,
          [
            JSON.stringify({
              ...cleared,
              ...boundScore(source, held ?? patch),
              sportsScoreReadStartedAt: held
                ? Math.max(startedAt, priorStarted)
                : startedAt,
              sportsScoreReadCompletedAt: held
                ? Math.max(patch.sportsLiveUpdatedTime, priorCompleted)
                : patch.sportsLiveUpdatedTime,
              sportsScoreConflictStamp:
                held && source.provider === 'odds'
                  ? Math.max(
                      watermark,
                      replacement
                        ? 0
                        : comparableTime(data.sportsScoreUpdatedTime),
                      !replacement && data.sportsScoreConflict
                        ? comparableTime(data.sportsScoreConflictStamp)
                        : 0
                    ) || null
                  : null,
              sportsScoreConflict: !!held,
              sportsScoreAnswers:
                !held && terminal(patch.sportsLiveStatus) ? bindings : null,
              ...(source.provider === 'odds' || replacement
                ? {
                    sportsScoreProviderWatermark:
                      Math.max(
                        watermark,
                        comparableTime(evidence.dated?.stamp),
                        replacement
                          ? 0
                          : comparableTime(data.sportsScoreProviderWatermark),
                        replacement
                          ? 0
                          : comparableTime(data.sportsScoreUpdatedTime)
                      ) || null,
                  }
                : {}),
            }),
            id,
          ]
        )
      }
      accepted.push({
        id,
        answers,
        ...(held && { held: boundScore(source, held) }),
        ...(replay && { replayedAt: data.sportsLiveUpdatedTime }),
        old_home: replacement ? null : data.sportsHomeScore ?? null,
        old_away: replacement ? null : data.sportsAwayScore ?? null,
      })
    }
    return accepted
  })
}

/** The platform runs this callback on its serializable, freshly loaded contract and native answers before any payout. */
export function assertObservedResult(
  current: MarketContract,
  source: ScoreSource,
  patch: Observation,
  previous: readonly ScoreAnswer[]
) {
  const c: ScoreMarket = current
  if (
    c.sportsScoreConflict ||
    !isMultiCpmm(c) ||
    !identifiesGame(c, source, c.answers) ||
    !sameFixture(c.scoreFixture, source) ||
    !terminal(patch.sportsLiveStatus) ||
    c.sportsLiveStatus !== patch.sportsLiveStatus ||
    c.sportsLiveUpdatedTime !== patch.sportsLiveUpdatedTime ||
    c.sportsHomeScore !== patch.sportsHomeScore ||
    c.sportsAwayScore !== patch.sportsAwayScore ||
    (source.provider === 'football-data' &&
      (c.sportsScoreWinner !== patch.sportsScoreWinner ||
        c.sportsScoreDuration !== patch.sportsScoreDuration ||
        c.sportsPenHome !== patch.sportsPenHome ||
        c.sportsPenAway !== patch.sportsPenAway)) ||
    c.answers.length !== previous.length ||
    !previous.every((old) =>
      c.answers.some(
        (a) => a.id === old.id && a.text === old.text && a.index === old.index
      )
    )
  ) {
    throw new Error(
      'The observed sports fixture or result changed before settlement'
    )
  }
}
