import {
  computeOpenWeightShare,
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_WINDOW_DAYS,
  openWeightWindowRange,
  validateOpenWeightPublication,
} from 'common/perps/open-weight-models'
import {
  recordUnclassifiedInRankings,
  resolveModelClassifications,
} from 'shared/perps/model-classifications'
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
  try {
    await updateOpenRouterShareInternal()
  } catch (err) {
    // Thrown fetch/parse errors otherwise surface only through croner's
    // generic catch, without the [openrouter] tag — which is how a feed
    // outage stays invisible to feed-specific log searches.
    log.error(`[openrouter] tick failed — ${err}`)
  }
}

const updateOpenRouterShareInternal = async () => {
  const pg = createSupabaseDirectClient()

  const now = Date.now()
  const { startDate, endDate } = openWeightWindowRange(now)
  const rankings = await fetchOpenRouterRankings(startDate, endDate)
  if (!rankings) return // no key configured; already warned
  if (!rankings.asOf) {
    log.error('[openrouter] response has no valid meta.as_of — skipping')
    return
  }

  // Seed list plus any operator/auto overrides that landed since the last
  // deploy, so a classification takes effect on the next tick rather than the
  // next release.
  const { classifications, expiredUnclassified } =
    await resolveModelClassifications(pg)

  const result = computeOpenWeightShare(
    rankings.rows,
    OPEN_WEIGHT_WINDOW_DAYS,
    classifications
  )

  // Start the grace clock for anything unknown that is actually in the ranked
  // window — creating the row if the catalog sweep never saw it, since the
  // rankings dataset carries models /models does not list.
  if (result.unclassified.length > 0)
    await recordUnclassifiedInRankings(pg, result.unclassified)

  const publication = validateOpenWeightPublication(result, {
    expiredUnclassified,
  })
  if (!publication.ok) {
    log.error(
      `[openrouter] unsafe index payload — ${publication.reason}; skipping publication`
    )
    return
  }
  if (publication.grace)
    log.warn(
      `[openrouter] publishing under grace — excluding ${publication.grace.unclassified.join(
        ', '
      )} (${(publication.grace.shareOfClassified * 100).toFixed(
        3
      )}% of classified tokens, index off by at most ${publication.grace.maxIndexError.toFixed(
        3
      )}pp)`
    )

  const point = {
    ts: now,
    price: publication.share,
    sourceTs: Date.parse(rankings.asOf),
  }
  const feed = getOracleFeed(OPENROUTER_OPEN_WEIGHT_FEED_ID)
  // Fetch the previous point so validateOraclePoint can enforce strictly
  // increasing timestamps against what is already stored.
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
    : `missing OracleFeedDef for ${OPENROUTER_OPEN_WEIGHT_FEED_ID}`
  if (rejection) {
    log.error(
      `[openrouter] rejected share ${publication.share.toFixed(
        3
      )} — ${rejection}`
    )
    return
  }

  await insertOraclePrices(pg, OPENROUTER_OPEN_WEIGHT_FEED_ID, [point])
  await applyOraclePointToLivePerps(pg, OPENROUTER_OPEN_WEIGHT_FEED_ID, point)
  log(
    `[openrouter] inserted ${publication.share.toFixed(
      3
    )}% open-weight share ` +
      `over ${result.dates[0]}..${result.dates[result.dates.length - 1]} ` +
      `(${result.dates.length}d, as_of ${rankings.asOf}, classification ${OPEN_WEIGHT_LIST_VERSION})`
  )
}
