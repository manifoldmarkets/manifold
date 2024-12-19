import { type APIHandler } from './helpers/endpoint'
import { SportsGames } from 'common/sports-info'
import { log } from 'shared/utils'

const apiKey = process.env.SPORTSDB_KEY
if (!apiKey) {
  throw new Error(
    'SPORTSDB_KEY environment variable is missing. Please set it in the environment.'
  )
}

const leagueIds = [
  '4328', // EPL
  '4387', // NBA
  '4391', // NFL
  '4380', // NHL
]

async function fetchSportsGamesForLeague(
  leagueId: string
): Promise<SportsGames[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${leagueId}`

  if (!apiKey) {
    throw new Error('SPORTSDB_KEY is undefined.')
  }

  try {
    log(`Fetching games for league ${leagueId}...`)
    const response = await fetch(API_URL, {
      headers: {
        'X-API-KEY': apiKey,
      } as HeadersInit, // Explicitly cast to HeadersInit
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

      return schedule.filter((sportsGame: SportsGames) => {
        const sportsGameDate = new Date(sportsGame.dateEvent)
        return sportsGameDate >= today && sportsGameDate <= oneWeekLater
      })
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
