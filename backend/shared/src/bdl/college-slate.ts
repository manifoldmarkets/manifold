import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  matchesCollegeBracketSlot,
  type CollegeBracket,
} from 'common/bdl/college-bracket'
import {
  collegeApRank,
  collegeGameScope,
  type CollegeScheduleWindow,
} from 'common/bdl/college-games'
import { identifyCollegeTeams, readCollegeGames } from './college-schedule'

/** Read-only sporting scope. The caller supplies the current league switch, verified calendar and AP issue. */
export async function readCollegeSlate(options: {
  client: Parameters<typeof readCollegeGames>[0]
  leagueEnabled: boolean
  policy: CollegeScheduleWindow
  from: string
  to: string
  canonicalNames: readonly string[]
  knownNames: ReadonlyMap<number, string>
  reportUnmatched: Parameters<typeof identifyCollegeTeams>[4]
  bracket?: CollegeBracket
}) {
  const { policy, bracket } = options
  if (
    !isSportsBdlEnabled() ||
    !options.leagueEnabled ||
    policy.league === 'cbb' ||
    (policy.league === 'ncaaf' && policy.season < 2027)
  )
    return []
  const games = await readCollegeGames(
    options.client,
    policy.league,
    policy.season,
    options.from,
    options.to
  )
  const matched = await identifyCollegeTeams(
    policy.league,
    games,
    options.canonicalNames,
    options.knownNames,
    options.reportUnmatched
  )
  const verifiedIds = new Set<string>()
  const current = new Map(games.map((game) => [game.eventId, game]))
  if (
    bracket &&
    bracket.league === policy.league &&
    bracket.season === policy.season
  )
    for (const round of bracket.rounds)
      for (const slot of round.slots) {
        const game = slot.eventId && current.get(slot.eventId)
        if (game && matchesCollegeBracketSlot(game, slot))
          verifiedIds.add(game.eventId)
      }
  return games.flatMap((game) => {
    const scope = collegeGameScope(game, policy, verifiedIds)
    if (!scope || !game.home || !game.away) return []
    const home = matched.get(game.home.id),
      away = matched.get(game.away.id)
    if (!home || !away) return []
    const ranks =
      scope === 'ranked-regular-season' ? policy.poll?.ranks : undefined
    return [
      {
        game,
        scope,
        homeName: home,
        awayName: away,
        homeApRank: collegeApRank(ranks, game.home.id),
        awayApRank: collegeApRank(ranks, game.away.id),
      },
    ]
  })
}
