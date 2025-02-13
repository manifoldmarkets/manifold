import { SportsGames } from 'common/sports-info'
import { log } from 'shared/utils'

export async function getLiveScores(): Promise<SportsGames[]> {
  const API_URL = 'https://www.thesportsdb.com/api/v2/json/livescore/all'
  const apiKey = process.env.SPORTSDB_KEY

  if (!apiKey) {
    throw new Error('SPORTSDB_KEY is undefined.')
  }

  try {
    log('Fetching all live and recently completed sports games...')

    const response = await fetch(API_URL, {
      headers: {
        'X-API-KEY': apiKey,
      } as HeadersInit,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch live scores: ${response.statusText}`)
    }

    const data = await response.json()
    const schedule: SportsGames[] = data?.livescore || []

    const relevantLeagues = [
      '4387', // NBA
      '4328', // EPL
      '4391', // NFL
      '4380', // NHL
      '5109', // Mexican Pacific League for testing
    ]

    const filteredGames = schedule.filter((game) =>
      relevantLeagues.includes(game.idLeague)
    )

    log(`Filtered games for relevant leagues: ${filteredGames.length}`)

    return filteredGames
  } catch (error) {
    log(`Error fetching live and recently completed games: ${error}`)
    return []
  }
}
