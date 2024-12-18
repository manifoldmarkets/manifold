import axios from 'axios'
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

      return schedule.filter((sportsGames: SportsGames) => {
        const sportsGamesDate = new Date(sportsGames.dateEvent)
        return sportsGamesDate >= today && sportsGamesDate <= oneWeekLater
      })
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
    '4328', //EPL
    '4387', //NBA
    '4391', // NFL
  ]

  try {
    const allSportsGamess = await Promise.all(
      leagueIds.map((leagueId) => fetchUpcomingSportsGamesForLeague(leagueId))
    )

    const flattenedSportsGamess = allSportsGamess.flat()
    if (flattenedSportsGamess.length === 0) {
      console.log('No sports games found for the next week across all leagues.')
      return
    }

    flattenedSportsGamess.forEach((sportsGame: SportsGames) => {
      console.log('Match ID:', sportsGame.idEvent)
      console.log('League:', sportsGame.league)
      console.log('Match:', sportsGame.event)
      console.log('Home Team:', sportsGame.homeTeam)
      console.log('Away Team:', sportsGame.awayTeam)
      console.log('Date:', sportsGame.dateEvent)
      console.log('Start Time:', sportsGame.startTime)
      const closeTime = calculateCloseTime(sportsGame.dateEvent, sportsGame.startTime)
      console.log('Expected Close Time:', closeTime)
      console.log('-----------------------------------------')
    })
  } catch (error) {
    console.error('Error fetching sports games for multiple leagues:', error)
  }
}

fetchUpcomingSportsGames()
