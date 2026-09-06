/**
 * Admin-triggered market creation for Odds API sports (NFL, CFB, MLB, NBA, WNBA, etc.).
 * Replicates the logic of the sports-market-creator scheduler job but runs on-demand
 * so admins can create markets without waiting for the daily cron.
 *
 * POST /admin-sports-create-odds-markets
 * Body: { competitionId: string, dryRun?: boolean }
 */

import { APIHandler } from './helpers/endpoint'
import { getFirestore } from 'firebase-admin/firestore'
import { getPrivateUser, isProd } from 'shared/utils'
import { anythingToRichText } from 'shared/tiptap'
import { createMarketHelper } from './create-market'
import { PrivateUser } from 'common/user'
import { SportsCalendarEntry } from 'common/sports'
import {
  getUpcomingOdds,
  fairWinProb,
  oddsKeyForEntry,
  OddsApiEvent,
} from 'shared/the-odds-api-client'

const ROLLING_WINDOW_DAYS = 14

const CLOSE_BUFFER_HOURS: Partial<Record<SportsCalendarEntry['sport'], number>> =
  {
    nfl: 4,
    cfb: 4,
    mlb: 4,
    nba: 3,
    wnba: 3,
    soccer: 2.5,
    f1: 2,
    tdf: 1,
  }

const SPORT_LEAGUE_LABEL: Partial<Record<SportsCalendarEntry['sport'], string>> =
  {
    nfl: 'NFL',
    cfb: 'College Football',
    mlb: 'MLB',
    nba: 'NBA',
    wnba: 'WNBA',
    soccer: 'Soccer',
    f1: 'Formula 1',
    tdf: 'Tour de France',
  }

function marketCloseTime(sport: SportsCalendarEntry['sport'], commenceTime: string): number {
  const hours = CLOSE_BUFFER_HOURS[sport] ?? 3
  return new Date(commenceTime).getTime() + hours * 60 * 60 * 1000
}

function buildQuestion(event: OddsApiEvent, entry: SportsCalendarEntry): string {
  const date = new Date(event.commence_time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
  return `Will the ${event.home_team} beat the ${event.away_team}? (${entry.competition}, ${date})`
}

export const adminSportsCreateOddsMarkets: APIHandler<'admin-sports-create-odds-markets'> =
  async (props, auth) => {
    const { competitionId, dryRun = false } = props

    const oddsApiKey = process.env.THE_ODDS_API_KEY ?? ''
    if (!oddsApiKey) {
      throw new Error('THE_ODDS_API_KEY env var is not set on the server')
    }

    const firestore = getFirestore()

    // Load the calendar entry for this competition
    const calendarSnap = await firestore
      .collection('sportsCalendar')
      .where('competitionId', '==', competitionId)
      .get()

    if (calendarSnap.empty) {
      throw new Error(
        `No sportsCalendar entry found for competitionId: ${competitionId}. Run seed-sports-calendar.ts first.`
      )
    }

    // Merge phases — use the first doc for sport/competition metadata
    const entry = calendarSnap.docs[0].data() as SportsCalendarEntry

    const oddsKey = oddsKeyForEntry(entry)
    if (!oddsKey) {
      throw new Error(
        `No Odds API key mapped for competitionId: ${competitionId}`
      )
    }

    const events = await getUpcomingOdds(oddsKey, ROLLING_WINDOW_DAYS)

    const creatorId = isProd()
      ? 'NnVY8olowYMYQGr346dfmHXBSpx2'
      : 't3R3HV2QFTRGnJxtxhzdesA4stw1'

    const privateUser = await getPrivateUser(creatorId)
    if (!privateUser) {
      throw new Error(`ManifoldSports creator user ${creatorId} not found`)
    }

    const authedUser = {
      uid: creatorId,
      creds: { kind: 'key' as const, data: '', privateUser: privateUser as PrivateUser },
    }

    const eventsCol = firestore.collection('sportsMarketEvents')
    const results: Array<{
      eventId: string
      question: string
      status: 'created' | 'skipped' | 'dry-run' | 'error'
      reason: string | null
    }> = []

    for (const event of events) {
      const question = buildQuestion(event, entry)

      const existing = await eventsCol.doc(event.id).get()
      if (existing.exists) {
        results.push({ eventId: event.id, question, status: 'skipped', reason: 'market already exists' })
        continue
      }

      if (dryRun) {
        const prob = fairWinProb(event, event.home_team)
        results.push({
          eventId: event.id,
          question,
          status: 'dry-run',
          reason: `initialProb=${prob !== null ? Math.round(prob * 100) : 50}%`,
        })
        continue
      }

      try {
        const prob = fairWinProb(event, event.home_team)
        const initialProb = prob !== null ? Math.round(prob * 100) : 50
        const closeTime = marketCloseTime(entry.sport, event.commence_time)
        const sportsLeague = SPORT_LEAGUE_LABEL[entry.sport]

        const descLines = [
          `**${event.away_team}** at **${event.home_team}**`,
          ``,
          `Resolves YES if ${event.home_team} wins outright. Resolves NO if ${event.away_team} wins outright.`,
          `Resolves N/A if the game ends in a tie, or is cancelled or postponed.`,
          ``,
          `Opening probability: ${initialProb}% (seeded from Vegas moneyline odds).`,
        ]

        const { contract } = await createMarketHelper(
          {
            question,
            outcomeType: 'BINARY',
            initialProb,
            closeTime,
            description: anythingToRichText({ raw: descLines.join('\n') }),
            visibility: 'public',
            liquidityTier: 1000,
            sportsLeague,
            sportsHomeTeam: event.home_team,
            sportsAwayTeam: event.away_team,
          },
          authedUser
        )

        await eventsCol.doc(event.id).set({
          contractId: contract.id,
          question,
          sport: entry.sport,
          competitionId: entry.competitionId,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          commenceTime: event.commence_time,
          initialProb,
          createdAt: Date.now(),
          createdBy: auth.uid,
          resolved: false,
        })

        results.push({ eventId: event.id, question, status: 'created', reason: null })
      } catch (e) {
        results.push({
          eventId: event.id,
          question,
          status: 'error',
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return {
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    }
  }
