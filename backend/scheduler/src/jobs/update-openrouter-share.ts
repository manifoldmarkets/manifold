import {
  computeOpenWeightShare,
  openWeightWindowRange,
} from 'common/perps/open-weight-models'
import { fetchOpenRouterRankings } from 'shared/openrouter-tokens'
import {
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  insertOraclePrices,
} from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'

// Open-weight token share on OpenRouter. Runs HOURLY, despite the feed's
// `cadence: 'daily'` (which only means "written by its own job, not the 15s
// tick").
//
// Each run recomputes the trailing 7-day window from scratch and appends ONE
// point stamped at Date.now() — never at a day boundary. Three things follow
// from that, and all three are load-bearing:
//
//  1. Nothing is ever overwritten. insertOraclePrices leaves an existing
//     (feed_id, ts) unchanged, and a fresh ts per run makes every point an
//     immutable measurement of what the window looked like at that instant.
//     When OpenRouter restates an earlier day, the correction simply flows
//     into the next point.
//  2. We pick up a new upstream day within an hour of it landing instead of
//     at a fixed daily time, so the moment the index moves isn't a schedule
//     anyone can read off a clock and front-run.
//  3. Feed freshness reflects job health rather than upstream release
//     cadence, which is what staleAfterMs (3h) is checking.
//
// Upstream caveat: OpenRouter publishes whole UTC days only — no intraday
// data exists to fetch — so the VALUE typically changes once a day even
// though points are written hourly. The 7-day window dilutes that step ~7x.
// We do not manufacture intraday movement to paper over this; a synthesised
// price on a market people trade would be worse than a visible step.
export const updateOpenRouterShare = async () => {
  const pg = createSupabaseDirectClient()

  const now = Date.now()
  const { startDate, endDate } = openWeightWindowRange(now)
  const rankings = await fetchOpenRouterRankings(startDate, endDate)
  if (!rankings) return // no key configured; already warned

  const result = computeOpenWeightShare(rankings.rows)
  if (result.share == null) {
    log.error(
      `[openrouter] no classified tokens in ${startDate}..${endDate} — skipping`
    )
    return
  }

  // Rule 2: a model we can't classify is excluded from both sides. That keeps
  // the index honest automatically, but it also means the denominator quietly
  // shrinks — so this is an ERROR, not a warning. Someone has to add it to
  // common/perps/open-weight-models.ts.
  if (result.unclassified.length > 0)
    log.error(
      `[openrouter] unclassified model(s) excluded from the index: ${result.unclassified.join(
        ', '
      )} — add them to common/perps/open-weight-models.ts`
    )

  // The classified total must be strictly below the payload total, because
  // `other` is always present and never classified. If they ever match,
  // `other` has leaked into the denominator.
  if (result.classifiedTokens >= result.payloadTokens)
    log.error(
      `[openrouter] classified tokens (${result.classifiedTokens}) >= payload total (${result.payloadTokens}) — the "other" row may have leaked into the denominator`
    )

  const point = { ts: now, price: result.share }
  const feed = getOracleFeed(OPENROUTER_OPEN_WEIGHT_FEED_ID)
  // Fetch the previous point so the registry's jump guard is actually armed —
  // a sudden multi-point move here means a classification change, not news.
  const prev = await pg.oneOrNone<{ ts: string; price: number | string }>(
    `select ts, price from oracle_prices where feed_id = $1
     order by ts desc limit 1`,
    [OPENROUTER_OPEN_WEIGHT_FEED_ID]
  )
  const rejection = feed
    ? validateOraclePoint(
        feed,
        prev
          ? { ts: new Date(prev.ts).getTime(), price: Number(prev.price) }
          : null,
        point
      )
    : null
  if (rejection) {
    log.error(
      `[openrouter] rejected share ${result.share.toFixed(3)} — ${rejection}`
    )
    return
  }

  await insertOraclePrices(pg, OPENROUTER_OPEN_WEIGHT_FEED_ID, [point])
  await applyOraclePointToLivePerps(pg, OPENROUTER_OPEN_WEIGHT_FEED_ID, point)
  log(
    `[openrouter] inserted ${result.share.toFixed(3)}% open-weight share ` +
      `over ${result.dates[0]}..${result.dates[result.dates.length - 1]} ` +
      `(${result.dates.length}d, as_of ${rankings.asOf ?? 'unknown'})`
  )
}
