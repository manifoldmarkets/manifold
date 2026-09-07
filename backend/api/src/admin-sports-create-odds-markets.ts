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
  MANIFOLD_SPORTS_CREATOR_ID,
  SPORT_LEAGUE_LABEL,
  marketCloseTime,
  buildOddsMarketQuestion,
  buildOddsMarketDescription,
} from 'shared/the-odds-api-client'
import { ensureOfficialGroup } from 'shared/sports-markets'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const ROLLING_WINDOW_DAYS = 14

export const adminSportsCreateOddsMarkets: APIHandler<
  'admin-sports-create-odds-markets'
> = async (props, auth) => {
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
    ? MANIFOLD_SPORTS_CREATOR_ID.prod
    : MANIFOLD_SPORTS_CREATOR_ID.dev

  const privateUser = await getPrivateUser(creatorId)
  if (!privateUser) {
    throw new Error(`ManifoldSports creator user ${creatorId} not found`)
  }

  const authedUser = {
    uid: creatorId,
    creds: {
      kind: 'key' as const,
      data: '',
      privateUser: privateUser as PrivateUser,
    },
  }

  const pg = createSupabaseDirectClient()
  const groupResult = await ensureOfficialGroup(
    {
      officialGroupSlug: `ms-official-${entry.competitionId}`,
      officialGroupName: `MS Official: ${entry.competition}`,
    } as any,
    creatorId,
    pg
  )
  const groupId = groupResult.id

  const eventsCol = firestore.collection('sportsMarketEvents')
  const results: Array<{
    eventId: string
    question: string
    status: 'created' | 'skipped' | 'dry-run' | 'error'
    reason: string | null
  }> = []

  for (const event of events) {
    const question = buildOddsMarketQuestion(event, entry)

    const existing = await eventsCol.doc(event.id).get()
    if (existing.exists) {
      results.push({
        eventId: event.id,
        question,
        status: 'skipped',
        reason: 'market already exists',
      })
      continue
    }

    const prob = fairWinProb(event, event.home_team)
    const initialProb = prob !== null ? Math.round(prob * 100) : 50

    if (dryRun) {
      results.push({
        eventId: event.id,
        question,
        status: 'dry-run',
        reason: `initialProb=${initialProb}%`,
      })
      continue
    }

    try {
      const closeTime = marketCloseTime(entry.sport, event.commence_time)
      const sportsLeague = SPORT_LEAGUE_LABEL[entry.sport]

      const { contract } = await createMarketHelper(
        {
          question,
          outcomeType: 'BINARY',
          initialProb,
          closeTime,
          description: anythingToRichText({
            raw: buildOddsMarketDescription(event, initialProb),
          }),
          visibility: 'public',
          liquidityTier: 1000,
          sportsLeague,
          sportsHomeTeam: event.home_team,
          sportsAwayTeam: event.away_team,
          groupIds: [groupId],
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

      results.push({
        eventId: event.id,
        question,
        status: 'created',
        reason: null,
      })
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
