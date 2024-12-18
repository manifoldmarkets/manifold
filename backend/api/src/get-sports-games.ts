import { type APIHandler } from './helpers/endpoint'
import axios from 'axios'
import { SportsGames } from 'common/sports-info'
import { log } from 'shared/utils'

const apiKey = process.env.SPORTSDB_KEY
if (!apiKey) {
  throw new Error(
    'SPORTSDB_KEY environment variable is missing. Please set it in the environment.'
  )
}

const leagueIds = [
  '4328', //EPL
  '4387', //NBA
  '4391', // NFL
]

async function fetchSportsGamesForLeague(leagueId: string): Promise<SportsGames[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${leagueId}`

  try {
    log(`Fetching games for league ${leagueId}...`)
    const response = await axios.get(API_URL, {
      headers: {
        'X-API-KEY': apiKey,
      },
    })

    const schedule = response.data?.schedule
    if (schedule && Array.isArray(schedule)) {
      const today = new Date()
      const oneWeekLater = new Date()
      oneWeekLater.setDate(today.getDate() + 7)

      return schedule.filter((sportsGames: SportsGames) => {
        const sportsGamesDate = new Date(sportsGames.dateEvent)
        return sportsGamesDate >= today && sportsGamesDate <= oneWeekLater
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

export const getSportsGames: APIHandler<
  'get-sports-games'
> = async () => {
  log('Fetching sports games from multiple leagues...')

  const allSportsGames = await Promise.all(
    leagueIds.map((leagueId) => fetchSportsGamesForLeague(leagueId))
  )
  const flattenedSportsGames = allSportsGames.flat()

  log(`Total Games fetched: ${flattenedSportsGames.length}`)
  return { schedule: flattenedSportsGames }
}
