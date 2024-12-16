import axios from 'axios'

// Define the Fixture interface for type safety
interface Fixture {
  idEvent: string
  strLeague: string
  strEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string
  strEventTime?: string
}

// Function to calculate the close time of a match
function calculateCloseTime(date: string, time?: string): string {
  const PST_OFFSET_HOURS = -8
  const CLOSE_TIME_HOURS = 2
  const CLOSE_TIME_MINUTES = 15

  if (time) {
    const [hours, minutes] = time.split(':').map(Number)
    const eventDate = new Date(`${date}T00:00:00`)
    eventDate.setHours(hours, minutes)
    eventDate.setMinutes(
      eventDate.getMinutes() + CLOSE_TIME_HOURS * 60 + CLOSE_TIME_MINUTES
    )
    return eventDate.toISOString().replace('T', ' ').slice(0, 16)
  } else {
    const eventDate = new Date(`${date}T00:00:00`)
    eventDate.setHours(23 + PST_OFFSET_HOURS, 59)
    return eventDate.toISOString().replace('T', ' ').slice(0, 16)
  }
}

// Function to fetch upcoming fixtures
async function fetchUpcomingFixtures() {
  const LEAGUE_ID = '4328' // Premier League ID
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${LEAGUE_ID}`
  const API_KEY = '560436' // Replace this with your valid API key

  try {
    console.log('Fetching data from the API...')
    const response = await axios.get(API_URL, {
      headers: {
        'X-API-KEY': API_KEY,
      },
    })

    // Log the full response for debugging
    console.log('API Response:', JSON.stringify(response.data, null, 2))

    // Check if the events field exists and contains data
    if (response.data && response.data.events) {
      const fixtures: Fixture[] = response.data.events

      fixtures.forEach((fixture) => {
        console.log('Match ID:', fixture.idEvent)
        console.log('League:', fixture.strLeague)
        console.log('Match:', fixture.strEvent)
        console.log('Home Team:', fixture.strHomeTeam)
        console.log('Away Team:', fixture.strAwayTeam)
        console.log('Date:', fixture.dateEvent)
        console.log('Start Time:', fixture.strEventTime || 'Unknown')
        const closeTime = calculateCloseTime(
          fixture.dateEvent,
          fixture.strEventTime
        )
        console.log('Expected Close Time:', closeTime)
        console.log('-----------------------------------------')
      })
    } else {
      console.error('No fixtures found.')
    }
  } catch (error) {
    // Handle errors
    if (error instanceof Error) {
      console.error('Error fetching fixtures:', error.message)
    } else {
      console.error('An unknown error occurred:', error)
    }
  }
}

// Execute the function
fetchUpcomingFixtures()
