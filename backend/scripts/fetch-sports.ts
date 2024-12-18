import axios from 'axios'

interface Fixture {
  idEvent: string
  strLeague: string
  strEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string
  strTime: string
}

function calculateCloseTime(date: string, time?: string): string {
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
    eventDate.setHours(23, 59)
    return eventDate.toISOString().replace('T', ' ').slice(0, 16)
  }
}

async function fetchUpcomingFixturesForLeague(
  leagueId: string
): Promise<Fixture[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${leagueId}`

  try {
    console.log(`Fetching data for league ${leagueId}...`)
    const response = await axios.get(API_URL, {
      headers: {
        'X-API-KEY': '', // see Notion
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
      console.log(`No fixtures found for league ${leagueId}.`)
      return []
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        `Error fetching fixtures for league ${leagueId}:`,
        error.message
      )
    } else {
      console.error(
        `An unknown error occurred while fetching league ${leagueId}.`
      )
    }
    return []
  }
}

async function fetchUpcomingFixtures() {
  const leagueIds = [
    '4328', //EPL
    '4387', //NBA
    '4391', // NFL
  ]

  try {
    const allFixtures = await Promise.all(
      leagueIds.map((leagueId) => fetchUpcomingFixturesForLeague(leagueId))
    )

    const flattenedFixtures = allFixtures.flat()
    if (flattenedFixtures.length === 0) {
      console.log('No fixtures found for the next week across all leagues.')
      return
    }

    flattenedFixtures.forEach((fixture: Fixture) => {
      console.log('Match ID:', fixture.idEvent)
      console.log('League:', fixture.strLeague)
      console.log('Match:', fixture.strEvent)
      console.log('Home Team:', fixture.strHomeTeam)
      console.log('Away Team:', fixture.strAwayTeam)
      console.log('Date:', fixture.dateEvent)
      console.log('Start Time:', fixture.strTime)
      const closeTime = calculateCloseTime(fixture.dateEvent, fixture.strTime)
      console.log('Expected Close Time:', closeTime)
      console.log('-----------------------------------------')
    })
  } catch (error) {
    console.error('Error fetching fixtures for multiple leagues:', error)
  }
}

fetchUpcomingFixtures()
