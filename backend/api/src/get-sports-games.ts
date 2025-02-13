import { type APIHandler } from './helpers/endpoint'
import { SportsGames, TeamMetadata } from 'common/sports-info'
import { log } from 'shared/utils'

const leagueIds = [
  '4328', // EPL
  '4387', // NBA
  '4391', // NFL
  '4380', // NHL
]

async function fetchTeamMetadata(teamId: string): Promise<TeamMetadata | null> {
  const apiKey = process.env.SPORTSDB_KEY

  const API_URL = `https://www.thesportsdb.com/api/v2/json/lookup/team/${encodeURIComponent(
    parseInt(teamId)
  )}`

  try {
    const response = await fetch(API_URL, {
      headers: {
        'X-API-KEY': apiKey,
      } as HeadersInit,
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch team metadata: ${response.statusText}`)
    }
    const data = await response.json()
    const team = data.lookup?.[0]
    if (!team) return null
    const { strTeam, strTeamShort } = team as TeamMetadata
    return {
      strTeam,
      strTeamShort,
    }
  } catch (error) {
    log(`Error fetching team metadata for ${teamId}: ${error}`)
    return null
  }
}

async function fetchSportsGamesForLeague(
  leagueId: string
): Promise<SportsGames[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${leagueId}`
  const apiKey = process.env.SPORTSDB_KEY

  if (!apiKey) {
    throw new Error('SPORTSDB_KEY is undefined.')
  }

  try {
    log(`Fetching games for league ${leagueId}...`)
    const response = await fetch(API_URL, {
      headers: {
        'X-API-KEY': apiKey,
      } as HeadersInit,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`)
    }

    const data = await response.json()
    const schedule = data?.schedule
    if (schedule?.length) {
      const [today, oneWeekLater] = [
        new Date(),
        new Date(Date.now() + 7 * 86400000),
      ]

      const filteredGames = schedule.filter((sportsGame: SportsGames) => {
        const sportsGameDate = new Date(sportsGame.dateEvent)
        return sportsGameDate >= today && sportsGameDate <= oneWeekLater
      })

      // Fetch team metadata for each game
      const gamesWithMetadata = await Promise.all(
        filteredGames.map(async (game: SportsGames) => {
          const [homeTeamMetadata, awayTeamMetadata] = await Promise.all([
            fetchTeamMetadata(game.idHomeTeam),
            fetchTeamMetadata(game.idAwayTeam),
          ])

          return {
            ...game,
            homeTeamMetadata,
            awayTeamMetadata,
          }
        })
      )

      return gamesWithMetadata
    } else {
      log(`No games found for league ${leagueId}.`)
      return []
    }
  } catch (error) {
    log(`Error fetching games for league ${leagueId}: ${error}`)
    return []
  }
}

export const getSportsGames: APIHandler<'get-sports-games'> = async () => {
  log('Fetching sports games from multiple leagues...')

  const allSportsGames = await Promise.all(
    leagueIds.map((leagueId) => fetchSportsGamesForLeague(leagueId))
  )
  const flattenedSportsGames = allSportsGames.flat()

  log(`Total Games fetched: ${flattenedSportsGames.length}`)
  return { schedule: flattenedSportsGames }
}
