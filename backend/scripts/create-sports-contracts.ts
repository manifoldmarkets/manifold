import axios from 'axios'
import { argv } from 'process' // To access command-line arguments

interface Fixture {
  idEvent: string
  strLeague: string
  strEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string
  strEventTime: string
}

async function fetchUpcomingFixtures(
  leagueId: string,
  apiKey: string
): Promise<Fixture[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/${apiKey}/eventsnextleague.php`

  try {
    const response = await axios.get<{ events: Fixture[] }>(API_URL, {
      params: { id: leagueId },
    })

    return response.data.events || []
  } catch (error) {
    console.error('Error fetching fixtures:', error)
    return []
  }
}

function calculateCloseTime(date: string, time: string): number {
  if (date && time) {
    const matchTime = new Date(`${date}T${time}:00Z`)
    return matchTime.getTime() + 2.5 * 60 * 60 * 1000
  } else if (date) {
    const endOfDay = new Date(`${date}T23:59:59Z`)
    return endOfDay.getTime()
  } else {
    throw new Error('Missing date information for close time calculation.')
  }
}

async function createMarketOnManifold(
  apiUrl: string,
  apiKey: string,
  body: Record<string, any>
) {
  try {
    const response = await axios.post(apiUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
    })
    console.log('Market created successfully:', response.data)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        'Error creating market:',
        error.response?.data || error.message
      )
    } else {
      console.error('Unknown error:', error)
    }
  }
}

async function createMarketsFromFixtures() {
  const SPORTSDB_KEY = process.env.SPORTSDB_KEY
  const MANIFOLD_API_KEY = process.env.MANIFOLD_API_KEY
  const MANIFOLD_API_KEY_DEV = process.env.MANIFOLD_API_KEY_DEV

  if (!SPORTSDB_KEY) {
    throw new Error('SportsDB API key is missing. Set it in your environment.')
  }

  const env = argv[2]
  if (!env || (env !== 'dev' && env !== 'prod')) {
    throw new Error(
      'Invalid environment. Pass "dev" or "prod" as a command-line argument.'
    )
  }

  const apiUrl =
    env === 'dev'
      ? 'https://localhost:3000/api/v0/market'
      : 'https://api.manifold.markets/v0/market'

  const apiKey = env === 'dev' ? MANIFOLD_API_KEY_DEV : MANIFOLD_API_KEY

  console.log(`Environment: ${env}`)
  console.log(`API URL: ${apiUrl}`)
  console.log(`API Key: ${apiKey}`)

  if (!apiKey) {
    throw new Error(
      `Manifold API key is missing. Ensure ${
        env === 'dev' ? 'MANIFOLD_API_KEY_DEV' : 'MANIFOLD_API_KEY'
      } is set in your environment.`
    )
  }

  const LEAGUE_ID = '4328'
  const fixtures = await fetchUpcomingFixtures(LEAGUE_ID, SPORTSDB_KEY)

  for (const fixture of fixtures) {
    const closeTime = calculateCloseTime(
      fixture.dateEvent,
      fixture.strEventTime
    )

    const body = {
      question: `Who will win: ${fixture.strHomeTeam} or ${fixture.strAwayTeam}?`,
      description: `The match between ${fixture.strHomeTeam} and ${fixture.strAwayTeam} in the ${fixture.strLeague} is scheduled for ${fixture.dateEvent} at ${fixture.strEventTime}.`,
      outcomeType: 'MULTIPLE_CHOICE',
      closeTime,
      answers: [fixture.strHomeTeam, fixture.strAwayTeam, 'Draw'],
      visibility: 'public',
      addAnswersMode: 'DISABLED',
      idempotencyKey: fixture.idEvent,
    }

    console.log(`Creating market for fixture: ${fixture.strEvent}`)

    await createMarketOnManifold(apiUrl, apiKey, body)
  }
}

createMarketsFromFixtures()
  .then(() => console.log('Finished creating markets.'))
  .catch((error) => console.error('Error running the script:', error))
