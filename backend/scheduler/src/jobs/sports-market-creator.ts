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
  MANIFOLD_SPORTS_CREATOR_ID,
  SPORT_LEAGUE_LABEL,
  marketCloseTime,
  buildOddsMarketQuestion,
  buildOddsMarketDescription,
} from 'shared/the-odds-api-client'
import { ensureOfficialGroup } from 'shared/sports-markets'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const ROLLING_WINDOW_DAYS = 14

export async function createSportsMarkets() {
  const oddsApiKey = process.env.THE_ODDS_API_KEY ?? ''
  if (!oddsApiKey) {
    log('[sports-market-creator] THE_ODDS_API_KEY not set — skipping')
    return
  }

  const creatorId = isProd()
    ? MANIFOLD_SPORTS_CREATOR_ID.prod
    : MANIFOLD_SPORTS_CREATOR_ID.dev

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

  const pg = createSupabaseDirectClient()
  const groupIdCache = new Map<string, string>() // competitionId → group id

  // Load active autoCreate calendar entries from Firestore
  const calendarSnap = await firestore
    .collection('sportsCalendar')
    .where('autoCreate', '==', true)
    .where('status', '==', 'active')
    .get()

  const entries = calendarSnap.docs.map((d) => d.data() as SportsCalendarEntry)
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
      log(`[sports-market-creator] Failed to fetch odds for ${oddsKey}: ${e}`)
      continue
    }

    log(
      `[sports-market-creator] ${entry.competitionId}: ${events.length} events in ${ROLLING_WINDOW_DAYS}-day window`
    )

    // Ensure the official group exists (idempotent). Cache per competitionId
    // so we don't hit Postgres for every single game in the same competition.
    let groupId = groupIdCache.get(entry.competitionId)
    if (!groupId) {
      const groupResult = await ensureOfficialGroup(
        {
          officialGroupSlug: `ms-official-${entry.competitionId}`,
          officialGroupName: `MS Official: ${entry.competition}`,
        } as any,
        creatorId,
        pg
      )
      groupId = groupResult.id
      groupIdCache.set(entry.competitionId, groupId)
    }

    for (const event of events) {
      // Dedup: check sportsMarketEvents before creating
      const existing = await eventsCol.doc(event.id).get()
      if (existing.exists) {
        skipped++
        continue
      }

      const prob = fairWinProb(event, event.home_team)
      const initialProb = prob !== null ? Math.round(prob * 100) : 50
      const question = buildOddsMarketQuestion(event, entry)
      const closeTime = marketCloseTime(entry.sport, event.commence_time)
      const sportsLeague = SPORT_LEAGUE_LABEL[entry.sport]

      try {
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
          auth
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
          resolved: false,
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
