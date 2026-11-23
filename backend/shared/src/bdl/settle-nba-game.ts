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
import { nbaAnswerIds } from './nba-answers'

const finishedNba = {
  sportsProvider: 'bdl',
  sportsLeagueKey: 'nba',
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
    !isMatch(observation, finishedNba) ||
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
    event.league !== 'nba' ||
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
    home === away ||
    !isEqual(
      market.sportsFundedAnswerIds,
      c.answers.map((a) => a.id)
    )
  )
    return
  const phase = calendarEntriesOverlapping(start, start).find(
    (p) =>
      p.bdlLeagueKey === 'nba' &&
      p.competitionId === observation.sportsCompetitionId &&
      p.autoResolve &&
      !p.locked
  )
  if (!phase) return
  const answers = nbaAnswerIds(c, observation)
  if (!answers) return
  const winner = home > away ? answers.home : answers.away
  return { winner, phase, closeTime: c.closeTime, observation, answers }
}

/** Restart-safe: the only inputs are the committed final and the funded native answers. */
export async function settleNbaGame(pg: SupabaseDirectClient, id: string) {
  if (!isSportsBdlEnabled()) return
  const contract = await getContract(pg, id)
  if (!contract || !isMultiCpmm(contract) || contract.id !== id) return
  const proposal = payout(contract)
  if (!proposal) return
  const { winner, phase } = proposal
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
    { outcome: winner, resolutions: { [winner]: 100 } },
    undefined,
    async (current, tx) => {
      if (
        !isSportsBdlEnabled() ||
        current.id !== id ||
        current.creatorId !== creator.id ||
        !isEqual(proposal, payout(current))
      )
        throw new Error('NBA final or funded answers changed')
      const enabled = await tx.oneOrNone(
        'select 1 from sports_competition_switches where competition_id=$1 and phase=$2 and enabled for share',
        [phase.competitionId, phase.phase]
      )
      if (!enabled || !isSportsBdlEnabled())
        throw new Error('NBA settlement disabled')
    }
  )
}

// Rotate through the unresolved candidates so a manual hold cannot starve the next page.
export async function settlePendingNbaGames(
  pg: SupabaseDirectClient,
  afterId = ''
) {
  if (!isSportsBdlEnabled()) return ''
  const rows = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where creator_id = any($1) and id > $2
      and token = 'MANA' and visibility = 'public' and deleted is not true
      and resolution is null and close_time < now()
      and data @> $3::jsonb
      and data ? 'sportsFinalObservation' and data ? 'sportsFundedAnswerIds'
      order by id limit 20`,
    [MANIFOLD_SPORTS_USER_IDS, afterId, JSON.stringify(finishedNba)]
  )
  for (const { id } of rows) {
    if (!isSportsBdlEnabled()) break
    try {
      await settleNbaGame(pg, id)
    } catch (error) {
      log.error('[sports-bdl-nba] settlement failed for ' + id + ': ' + error)
    }
  }
  return rows.length === 20 ? rows[rows.length - 1].id : ''
}
