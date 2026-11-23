import type { Answer } from 'common/answer'
import { Contract, isMultiCpmm, Sports } from 'common/contract'
import { gameResolution } from 'common/odds-markets'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import type { SportsLiveScore } from 'common/sports-schedule'
import { sportsCreator } from '../odds-markets'
import { resolveMarketHelper } from '../resolve-market-helpers'
import type { SupabaseDirectClient } from '../supabase/init'
import { getContract } from '../utils'

type FinalIdentity = Required<
  Pick<
    Sports,
    | 'sportsEventId'
    | 'sportsCompetitionId'
    | 'sportsStartTimestamp'
    | 'sportsHomeTeamId'
    | 'sportsAwayTeamId'
    | 'sportsHomeTeam'
    | 'sportsAwayTeam'
  >
>

function namedTeams(answers: Answer[], homeName: string, awayName: string) {
  if (
    answers.length !== 2 ||
    answers.some((a) => a.isOther || a.resolution || a.resolutionTime)
  )
    return null
  const named = (name: string) =>
    answers.find(
      (a) => a.text.trim().toLowerCase() === name.trim().toLowerCase()
    )
  const home = named(homeName)
  const away = named(awayName)
  return home?.id && away?.id && home.id !== away.id ? { home, away } : null
}

/** The native resolver reads the scored fixture and its answers again inside the
 * payout transaction. A correction, rebind or answer edit must cancel this payout. */
export async function settleNbaGame(
  pg: SupabaseDirectClient,
  id: string,
  identity: FinalIdentity,
  score: SportsLiveScore,
  enabled: () => Promise<boolean>,
  signal?: AbortSignal
) {
  const { sportsHomeScore: home, sportsAwayScore: away } = score
  if (
    score.sportsLiveStatus !== 'FINISHED' ||
    home === null ||
    away === null ||
    !Number.isSafeInteger(home) ||
    !Number.isSafeInteger(away) ||
    home < 0 ||
    away < 0 ||
    home === away
  )
    return
  const contract = await getContract(pg, id)
  if (
    !contract ||
    !isMultiCpmm(contract) ||
    contract.outcomeType !== 'MULTIPLE_CHOICE'
  )
    return
  const creator = await sportsCreator()

  function acceptedTeams(c: Contract) {
    const s = c as Contract & Partial<Sports & SportsLiveScore>
    if (
      signal?.aborted ||
      !isSportsBdlEnabled() ||
      c.id !== id ||
      c.creatorId !== creator.id ||
      c.token !== 'MANA' ||
      c.visibility !== 'public' ||
      c.deleted ||
      c.isResolved ||
      c.resolution != null ||
      !isMultiCpmm(c) ||
      c.outcomeType !== 'MULTIPLE_CHOICE' ||
      !c.shouldAnswersSumToOne ||
      !Number.isFinite(c.closeTime) ||
      c.closeTime! >= score.sportsLiveUpdatedTime ||
      s.sportsFixture ||
      s.sportsProvider !== 'bdl' ||
      s.sportsLeagueKey !== 'nba' ||
      s.sportsMarketType !== 'moneyline' ||
      s.sportsStartKnown !== true ||
      s.sportsAttentionReason ||
      s.sportsLiveStatus !== 'FINISHED' ||
      s.sportsLiveUpdatedTime !== score.sportsLiveUpdatedTime ||
      s.sportsHomeScore !== home ||
      s.sportsAwayScore !== away ||
      !Object.entries(identity).every(
        ([key, value]) => Reflect.get(s, key) === value
      )
    )
      return null
    return namedTeams(
      c.answers,
      identity.sportsHomeTeam,
      identity.sportsAwayTeam
    )
  }

  const expected = acceptedTeams(contract)
  if (!expected)
    throw new Error('Final or native team answers no longer match the NBA game')
  // gameResolution supports historical positional fallbacks. Both team names
  // must independently identify different funded answers for this producer.
  const args = gameResolution(
    contract.answers,
    home > away ? 'home' : 'away',
    identity.sportsHomeTeam,
    identity.sportsAwayTeam
  )
  if (!args || !(await enabled()) || signal?.aborted) return
  await resolveMarketHelper(
    contract,
    creator,
    creator,
    args,
    undefined,
    (current) => {
      const teams = acceptedTeams(current)
      if (
        !teams ||
        teams.home.id !== expected.home.id ||
        teams.away.id !== expected.away.id ||
        current.closeTime !== contract.closeTime
      )
        throw new Error(
          'NBA game, final or funded answers changed before settlement'
        )
    }
  )
}
