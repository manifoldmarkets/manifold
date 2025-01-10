import { type APIHandler } from './helpers/endpoint'
import { SportsGames } from 'common/sports-info'
import { log } from 'shared/utils'

const leagueIds = [
  '4328', // EPL
  '4387', // NBA
  '4391', // NFL
  '4380', // NHL
]

async function fetchCompletedSportsGamesForLeague(
  leagueId: string
): Promise<SportsGames[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/previous/league/${leagueId}`
  const apiKey = process.env.SPORTSDB_KEY

  if (!apiKey) {
    throw new Error('SPORTSDB_KEY is undefined.')
  }

  try {
    log(`Fetching completed games for league ${leagueId}...`)
    const response = await fetch(API_URL, {
      headers: {
        'X-API-KEY': apiKey,
      } as HeadersInit,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch completed game data: ${response.statusText}`)
    }

    const data = await response.json()
    const schedule = data?.schedule
    if (schedule?.length) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const recentCompletedGames = schedule.filter((sportsGame: SportsGames) => {
        const gameDate = new Date(sportsGame.dateEvent)
        return gameDate >= oneDayAgo
      })

      return recentCompletedGames
    } else {
      log(`No completed games found for league ${leagueId}.`)
      return []
    }
  } catch (error) {
    log(`Error fetching completed games for league ${leagueId}: ${error}`)
    return []
  }
}

// Add export keyword here
export const getCompletedSportsGames: APIHandler<'get-completed-sports-games'> = async () => {
  log('Fetching completed sports games from multiple leagues...')

  const allSportsGames = await Promise.all(
    leagueIds.map((leagueId) => fetchCompletedSportsGamesForLeague(leagueId))
  )
  const flattenedSportsGames = allSportsGames.flat()

  log(`Total completed games fetched: ${flattenedSportsGames.length}`)
  return { schedule: flattenedSportsGames }
}
