import { SportsGames } from 'common/sports-info'

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

async function fetchUpcomingSportsGamesForLeague(
  leagueId: string
): Promise<SportsGames[]> {
  const API_URL = `https://www.thesportsdb.com/api/v2/json/schedule/next/league/${leagueId}`

  try {
    console.log(`Fetching data for league ${leagueId}...`)
    const response = await fetch(API_URL, {
      headers: {
        'X-API-KEY': '', // see Notion
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`)
    }

    const data = await response.json()
    const schedule = data?.schedule
    if (schedule && Array.isArray(schedule)) {
      return schedule
    } else {
      console.log(`No sports games found for league ${leagueId}.`)
      return []
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        `Error fetching sports games for league ${leagueId}:`,
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

async function fetchUpcomingSportsGames() {
  const leagueIds = [
    '4328', // EPL
    '4387', // NBA
    '4391', // NFL
  ]

  try {
    const allSportsGames = await Promise.all(
      leagueIds.map((leagueId) => fetchUpcomingSportsGamesForLeague(leagueId))
    )

    const flattenedSportsGames = allSportsGames.flat()
    if (flattenedSportsGames.length === 0) {
      console.log('No sports games found across all leagues.')
      return
    }

    flattenedSportsGames.forEach((sportsGame: SportsGames) => {
      console.log('Match ID:', sportsGame.idEvent)
      console.log('League:', sportsGame.strLeague)
      console.log('Match:', sportsGame.strEvent)
      console.log('Home Team:', sportsGame.strHomeTeam)
      console.log('Away Team:', sportsGame.strAwayTeam)
      console.log('Date:', sportsGame.dateEvent)
      console.log('Start Time:', sportsGame.strTime)
      const closeTime = calculateCloseTime(
        sportsGame.dateEvent,
        sportsGame.strTime
      )
      console.log('Expected Close Time:', closeTime)
      console.log('-----------------------------------------')
    })
  } catch (error) {
    console.error('Error fetching sports games for multiple leagues:', error)
  }
}

fetchUpcomingSportsGames()
