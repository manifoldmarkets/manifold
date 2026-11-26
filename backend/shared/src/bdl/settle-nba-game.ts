import {
  isMajorLeague,
  MAJOR_LEAGUES,
  MajorLeague,
} from 'common/bdl/major-leagues'
import { isEqual, isMatch } from 'lodash'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { Contract, isMultiCpmm, Sports } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  calendarEntriesOverlapping,
  calendarPhaseKey,
  competitionSwitchError,
} from 'common/sports-calendar'
import { parseBdlEventId } from 'common/sports-ids'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import type { SportsLiveScore } from 'common/sports-schedule'
import { sportsCreator } from '../odds-markets'
import { resolveMarketHelper } from '../resolve-market-helpers'
import type { SupabaseDirectClient } from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { getContract, log } from '../utils'
import { majorAnswerIds } from './nba-answers'

const finishedMajor = {
  sportsProvider: 'bdl',
  sportsMarketType: 'moneyline',
  sportsStartKnown: true,
  sportsLiveStatus: 'FINISHED',
} as const
const scoreIsValid = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function payout(c: Contract) {
  const market = c as Contract &
    Partial<Sports> & {
      sportsFinalObservation?: Partial<Sports & SportsLiveScore>
    }
  // Read the certified fixture and score, then check they still match the
  // public row. A historical FINISHED badge or a later edit cannot certify a payout.
  const observation = market.sportsFinalObservation
  if (
    !observation ||
    !isMatch(observation, finishedMajor) ||
    !isMatch(c, observation)
  )
    return
  const event =
    typeof observation.sportsEventId === 'string' &&
    parseBdlEventId(observation.sportsEventId)
  const start = parseSportsKickoffMs(observation.sportsStartTimestamp)
  const {
    sportsLiveUpdatedTime: received,
    sportsHomeScore: home,
    sportsAwayScore: away,
  } = observation
  if (
    !event ||
    !isMajorLeague(event.league) ||
    event.league !== observation.sportsLeagueKey ||
    event.suffix ||
    market.sportsFixture ||
    market.sportsAttentionReason ||
    c.visibility !== 'public' ||
    c.token !== 'MANA' ||
    c.deleted ||
    c.isResolved ||
    c.resolution != null ||
    !isMultiCpmm(c) ||
    c.outcomeType !== 'MULTIPLE_CHOICE' ||
    c.shouldAnswersSumToOne !== true ||
    c.addAnswersMode !== 'DISABLED' ||
    c.answers.length !== 2 ||
    typeof received !== 'number' ||
    !Number.isSafeInteger(received) ||
    received > Date.now() ||
    !(start <= received) ||
    typeof c.closeTime !== 'number' ||
    !Number.isSafeInteger(c.closeTime) ||
    c.closeTime >= received ||
    !scoreIsValid(home) ||
    !scoreIsValid(away) ||
    (home === away && event.league !== 'nfl') ||
    !isEqual(
      market.sportsFundedAnswerIds,
      c.answers.map((a) => a.id)
    )
  )
    return
  const phases = calendarEntriesOverlapping(start, start).filter(
    (p) =>
      p.bdlLeagueKey === event.league &&
      p.competitionId === observation.sportsCompetitionId &&
      (observation.sportsCompetitionPhase === undefined ||
        p.phase === observation.sportsCompetitionPhase) &&
      p.autoResolve &&
      !p.locked
  )
  const phase = phases.length === 1 ? phases[0] : undefined
  if (!phase || (home === away && !/regular season/i.test(phase.phase))) return
  const answers = majorAnswerIds(c, observation)
  if (!answers) return
  const winner = home > away ? answers.home : answers.away
  const resolution =
    home === away
      ? {
          outcome: 'CHOOSE_MULTIPLE',
          resolutions: { [answers.home]: 50, [answers.away]: 50 },
        }
      : { outcome: winner, resolutions: { [winner]: 100 } }
  return { resolution, phase, closeTime: c.closeTime, observation, answers }
}

/** Restart-safe: the only inputs are the committed final and the funded native answers. */
export async function settleMajorGame(
  pg: SupabaseDirectClient,
  id: string,
  league?: MajorLeague
) {
  if (!isSportsBdlEnabled()) return
  const contract = await getContract(pg, id)
  if (!contract || !isMultiCpmm(contract) || contract.id !== id) return
  const proposal = payout(contract)
  if (!proposal || (league && proposal.phase.bdlLeagueKey !== league)) return
  const { resolution, phase } = proposal
  const switches = await getCompetitionSwitches(pg)
  if (
    switches[calendarPhaseKey(phase)] !== true ||
    competitionSwitchError(phase.competitionId, phase.phase, true, switches)
  )
    return
  const creator = await sportsCreator()
  if (contract.creatorId !== creator.id || !isSportsBdlEnabled()) return
  await resolveMarketHelper(
    contract,
    creator,
    creator,
    resolution,
    undefined,
    async (current, tx) => {
      if (
        !isSportsBdlEnabled() ||
        current.id !== id ||
        current.creatorId !== creator.id ||
        !isEqual(proposal, payout(current))
      )
        throw new Error('Major game final or funded answers changed')
      const enabled = await tx.oneOrNone(
        'select 1 from sports_competition_switches where competition_id=$1 and phase=$2 and enabled for share',
        [phase.competitionId, phase.phase]
      )
      if (!enabled || !isSportsBdlEnabled())
        throw new Error('Major game settlement disabled')
    }
  )
}

// Rotate through the unresolved candidates so a manual hold cannot starve the next page.
export async function settlePendingMajorGames(
  pg: SupabaseDirectClient,
  afterId = '',
  leagues: readonly MajorLeague[] = MAJOR_LEAGUES
) {
  if (!isSportsBdlEnabled()) return ''
  const rows = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where creator_id = any($1) and id > $2
      and token = 'MANA' and visibility = 'public' and deleted is not true
      and resolution is null and close_time < now()
      and data @> $3::jsonb and data->>'sportsLeagueKey' = any($4::text[])
      and data ? 'sportsFinalObservation' and data ? 'sportsFundedAnswerIds'
      order by id limit 20`,
    [MANIFOLD_SPORTS_USER_IDS, afterId, JSON.stringify(finishedMajor), leagues]
  )
  for (const { id } of rows) {
    if (!isSportsBdlEnabled()) break
    try {
      await settleMajorGame(pg, id)
    } catch (error) {
      log.error('[sports-bdl-major] settlement failed for ' + id + ': ' + error)
    }
  }
  return rows.length === 20 ? rows[rows.length - 1].id : ''
}

export const settleNbaGame = (pg: SupabaseDirectClient, id: string) =>
  settleMajorGame(pg, id, 'nba')
export const settlePendingNbaGames = (pg: SupabaseDirectClient, afterId = '') =>
  settlePendingMajorGames(pg, afterId, ['nba'])
