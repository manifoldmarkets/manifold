import type { Answer } from 'common/answer'
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

type ScoreMarket = MarketContract & Partial<Sports & SportsLiveScore>
type ScoreAnswer = Pick<
  Answer,
  'id' | 'text' | 'index' | 'resolution' | 'resolutionTime'
>
type Observation = SportsLiveScore & {
  sportsScoreDuration?: string
  sportsPenHome?: number
  sportsPenAway?: number
}

export function boundScore(
  source: ScoreSource,
  patch: Observation
): SportsLiveScore {
  const { eventId, home, away, homeId, awayId } = source
  return { ...patch, scoreFixture: { eventId, home, away, homeId, awayId } }
}

function sameNames(left: string, right: string) {
  return (
    splitFlag(left).name.trim().toLowerCase() ===
    splitFlag(right).name.trim().toLowerCase()
  )
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

export type WrittenScore = {
  id: string
  old_home: number | null
  old_away: number | null
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
  isCurrent: () => boolean = () => true
): Promise<WrittenScore[]> {
  if (
    !Number.isSafeInteger(startedAt) ||
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
       order by id for update`,
      [source.eventId, source.creatorId, contractId ?? null]
    )
    const accepted: WrittenScore[] = []
    for (const { id, data, token } of markets) {
      const previous = data.sportsLiveUpdatedTime
      if (
        previous != null &&
        (!Number.isSafeInteger(previous) ||
          previous > startedAt ||
          previous >= patch.sportsLiveUpdatedTime)
      )
        continue
      const terminal = (status: unknown) =>
        status === 'FINISHED' || status === 'AWARDED'
      if (terminal(data.sportsLiveStatus) && !terminal(patch.sportsLiveStatus))
        continue
      const answers = await tx.manyOrNone<ScoreAnswer>(
        `select id, text, index, resolution, extract(epoch from resolution_time) * 1000 as "resolutionTime" from answers where contract_id = $1 order by id for share`,
        [id]
      )
      if (!isCurrent() || !identifiesGame({ ...data, token }, source, answers))
        continue
      await tx.none(`update contracts set data=data || $1::jsonb where id=$2`, [
        JSON.stringify(patch),
        id,
      ])
      accepted.push({
        id,
        answers,
        old_home: data.sportsHomeScore ?? null,
        old_away: data.sportsAwayScore ?? null,
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
    !isMultiCpmm(c) ||
    !identifiesGame(c, source, c.answers) ||
    c.sportsLiveStatus !== patch.sportsLiveStatus ||
    c.sportsLiveUpdatedTime !== patch.sportsLiveUpdatedTime ||
    c.sportsHomeScore !== patch.sportsHomeScore ||
    c.sportsAwayScore !== patch.sportsAwayScore ||
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
