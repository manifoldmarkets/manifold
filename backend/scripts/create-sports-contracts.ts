import axios from 'axios'

interface Fixture {
  idEvent: string
  strLeague: string
  strEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string
  strEventTime?: string
}

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

async function fetchUpcomingFixtures() {
  const API_URL =
    'https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php'
  const LEAGUE_ID = '4328' // Premier League ID
  const apiParams = {
    id: LEAGUE_ID,
  }

  try {
    const response = await axios.get<{ events: Fixture[] }>(API_URL, {
      params: apiParams,
    })

    if (response.data.events) {
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
      })
    } else {
      console.error('No fixtures found.')
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error fetching fixtures:', error.message)
    } else {
      console.error('An unknown error occurred:', error)
    }
  }
}

fetchUpcomingFixtures()
