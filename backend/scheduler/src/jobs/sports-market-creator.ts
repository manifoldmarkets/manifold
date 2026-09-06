/**
 * Rolling-window sports market creator.
 *
 * Runs daily. For each active sportsCalendar entry with autoCreate=true:
 *   1. Fetches upcoming events from The Odds API for the next ROLLING_WINDOW_DAYS.
 *   2. Skips events that already have a Manifold market (tracked in sportsMarketEvents).
 *   3. Creates a binary market with initial probability seeded from Vegas moneylines.
 *   4. Records the new market in sportsMarketEvents for deduplication on future runs.
 *
 * NOT YET REGISTERED — add to jobs/index.ts when ready:
 *   createJob('sports-market-creator', '0 6 * * *', createSportsMarkets)
 *   (runs daily at 6 AM PT)
 *
 * Required env vars:
 *   THE_ODDS_API_KEY  — The Odds API key
 *
 * Creator account: @ManifoldSports (prod: NnVY8olowYMYQGr346dfmHXBSpx2,
 *                                    dev:  t3R3HV2QFTRGnJxtxhzdesA4stw1)
 */

import { getFirestore } from 'firebase-admin/firestore'
import { log, getPrivateUser, isProd } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { anythingToRichText } from 'shared/tiptap'
import { createMarketHelper } from 'api/create-market'
import { PrivateUser } from 'common/user'
import { AuthedUser } from 'api/helpers/endpoint'
import { SportsCalendarEntry } from 'common/sports'
import {
  getUpcomingOdds,
  fairWinProb,
  oddsKeyForEntry,
  OddsApiEvent,
} from 'shared/the-odds-api-client'

// Maps our SportId to the sportsLeague string stored on the contract.
// This is what the /sports/<slug> dashboard pages query by.
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

const ROLLING_WINDOW_DAYS = 14

// Hours added to game start time before the market closes.
// Sized to cover the longest realistic game + overtime for each sport.
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

function marketCloseTime(sport: SportsCalendarEntry['sport'], commenceTime: string): number {
  const hours = CLOSE_BUFFER_HOURS[sport] ?? 3
  return new Date(commenceTime).getTime() + hours * 60 * 60 * 1000
}

function formatEventDate(commenceTime: string): string {
  return new Date(commenceTime).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function buildQuestion(event: OddsApiEvent, entry: SportsCalendarEntry): string {
  const date = formatEventDate(event.commence_time)
  return `Will the ${event.home_team} beat the ${event.away_team}? (${entry.competition}, ${date})`
}

function buildDescription(event: OddsApiEvent, initialProb: number): string {
  const lines = [
    `**${event.away_team}** at **${event.home_team}**`,
    ``,
    `Resolves YES if ${event.home_team} wins. Resolves NO if ${event.away_team} wins.`,
    `Resolves N/A if the game is cancelled or postponed.`,
    ``,
    `Opening probability: ${initialProb}% (seeded from Vegas moneyline odds).`,
  ]
  return lines.join('\n')
}

export async function createSportsMarkets() {
  const oddsApiKey = process.env.THE_ODDS_API_KEY ?? ''
  if (!oddsApiKey) {
    log('[sports-market-creator] THE_ODDS_API_KEY not set — skipping')
    return
  }

  const creatorId = isProd()
    ? 'NnVY8olowYMYQGr346dfmHXBSpx2' // @ManifoldSports prod
    : 't3R3HV2QFTRGnJxtxhzdesA4stw1' // @ManifoldSports dev

  const pg = createSupabaseDirectClient()
  const firestore = getFirestore()

  const privateUser = await getPrivateUser(creatorId)
  if (!privateUser) {
    log(`[sports-market-creator] Creator user ${creatorId} not found`)
    return
  }

  const auth: AuthedUser = {
    uid: creatorId,
    creds: { kind: 'key', data: '', privateUser: privateUser as PrivateUser },
  }

  // Load active autoCreate calendar entries from Firestore
  const calendarSnap = await firestore
    .collection('sportsCalendar')
    .where('autoCreate', '==', true)
    .where('status', '==', 'active')
    .get()

  const entries = calendarSnap.docs.map(
    (d) => d.data() as SportsCalendarEntry
  )
  log(`[sports-market-creator] ${entries.length} active autoCreate entries`)

  const eventsCol = firestore.collection('sportsMarketEvents')
  let created = 0
  let skipped = 0

  for (const entry of entries) {
    const oddsKey = oddsKeyForEntry(entry)
    if (!oddsKey) {
      log(
        `[sports-market-creator] No Odds API key for ${entry.competitionId} — skipping`
      )
      continue
    }

    let events: OddsApiEvent[]
    try {
      events = await getUpcomingOdds(oddsKey, ROLLING_WINDOW_DAYS)
    } catch (e) {
      log(
        `[sports-market-creator] Failed to fetch odds for ${oddsKey}: ${e}`
      )
      continue
    }

    log(
      `[sports-market-creator] ${entry.competitionId}: ${events.length} events in ${ROLLING_WINDOW_DAYS}-day window`
    )

    for (const event of events) {
      // Dedup: check sportsMarketEvents before creating
      const existing = await eventsCol.doc(event.id).get()
      if (existing.exists) {
        skipped++
        continue
      }

      const prob = fairWinProb(event, event.home_team)
      const initialProb = prob !== null ? Math.round(prob * 100) : 50

      const question = buildQuestion(event, entry)
      const closeTime = marketCloseTime(entry.sport, event.commence_time)
      const description = anythingToRichText({
        raw: buildDescription(event, initialProb),
      })

      try {
        const sportsLeague = SPORT_LEAGUE_LABEL[entry.sport]
        const contract = await createMarketHelper(
          {
            question,
            outcomeType: 'BINARY',
            initialProb,
            closeTime,
            description,
            visibility: 'public',
            sportsLeague,
            // TODO: add groupIds once ManifoldSports groups are set up per sport
          },
          auth,
          pg,
          firestore
        )

        // Record in Firestore so we don't create a duplicate on the next run
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
        })

        log(`[sports-market-creator] Created: ${question}`)
        created++
      } catch (e) {
        log(
          `[sports-market-creator] Failed to create market for ${event.id}: ${e}`
        )
      }
    }
  }

  log(
    `[sports-market-creator] Done — ${created} created, ${skipped} already existed`
  )
}
