import { type APIHandler } from './helpers/endpoint'
import axios from 'axios'
import { Fixture } from 'common/sports-info'
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

async function fetchFixturesForLeague(leagueId: string): Promise<Fixture[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${leagueId}`

  try {
    log(`Fetching fixtures for league ${leagueId}...`)
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

      return schedule.filter((fixture: Fixture) => {
        const fixtureDate = new Date(fixture.dateEvent)
        return fixtureDate >= today && fixtureDate <= oneWeekLater
      })
    } else {
      log(`No fixtures found for league ${leagueId}.`)
      return []
    }
  } catch (error) {
    log(`Error fetching fixtures for league ${leagueId}: ${error}`)
    return []
  }
}

export const getSportsFixtures: APIHandler<
  'get-sports-fixtures'
> = async () => {
  log('Fetching sports fixtures from multiple leagues...')

  const allFixtures = await Promise.all(
    leagueIds.map((leagueId) => fetchFixturesForLeague(leagueId))
  )
  const flattenedFixtures = allFixtures.flat()

  log(`Total fixtures fetched: ${flattenedFixtures.length}`)
  return { schedule: flattenedFixtures }
}
