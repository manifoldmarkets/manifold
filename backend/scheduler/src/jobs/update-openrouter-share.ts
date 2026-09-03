import {
  CHINESE_LAB_LIST_VERSION,
  LabShareFeed,
  computeLabShare,
  validateLabSharePublication,
} from 'common/perps/lab-share'
import {
  computeOpenWeightShare,
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_WINDOW_DAYS,
  openWeightWindowRange,
  validateOpenRouterSourceFreshness,
  validateOpenWeightPublication,
} from 'common/perps/open-weight-models'
import {
  recordUnclassifiedInRankings,
  resolveModelClassifications,
} from 'shared/perps/model-classifications'
import {
  OpenRouterRankings,
  fetchOpenRouterRankings,
} from 'shared/openrouter-tokens'
import {
  OPENROUTER_ANTHROPIC_SHARE_FEED_ID,
  OPENROUTER_CHINESE_LAB_SHARE_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  insertOraclePrices,
} from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { advisoryLockQuery } from 'shared/perps/queries'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
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
//
// THREE INDEXES, ONE FETCH. The same payload also prices the Anthropic-share
// and Chinese-lab-share feeds (common/perps/lab-share.ts): they use the same
// window and the same denominator exclusions, so computing them here costs
// zero additional OpenRouter calls against the 500/day account limit (this
// job spends 24). Each feed is published INDEPENDENTLY through the same
// lock → reread → validate → insert → apply sequence, with the previous
// point read per feed under that feed's advisory lock: a refusal or a thrown
// error on one feed must never withhold the others, and each has its own
// registry entry, bounds and market. The open-weight computation is
// unchanged and its log lines are kept verbatim.
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
  const sourceTs = Date.parse(rankings.asOf)

  // Points are stamped at Date.now(), so a frozen upstream response would
  // otherwise be relaid as fresh every hour and never trip the 3h staleness
  // or 6h trading gates. Checked once, before any of the three feeds: a
  // stale dataset is stale for all of them, and it pages.
  const staleness = validateOpenRouterSourceFreshness({
    rows: rankings.rows,
    now,
  })
  if (staleness) {
    log.error(`[openrouter] ${staleness} — skipping every feed`)
    return
  }

  await guarded('open-weight share', () =>
    publishOpenWeightShare(pg, rankings, now, sourceTs)
  )
  await guarded('anthropic share', () =>
    publishLabShare(
      pg,
      'anthropic',
      OPENROUTER_ANTHROPIC_SHARE_FEED_ID,
      rankings,
      now,
      sourceTs
    )
  )
  await guarded('chinese-lab share', () =>
    publishLabShare(
      pg,
      'chinese-lab',
      OPENROUTER_CHINESE_LAB_SHARE_FEED_ID,
      rankings,
      now,
      sourceTs
    )
  )
}

/** One feed's failure is that feed's ERROR line, not the tick's. */
const guarded = async (label: string, run: () => Promise<void>) => {
  try {
    await run()
  } catch (err) {
    log.error(`[openrouter] ${label} failed — ${err}`)
  }
}

const publishOpenWeightShare = async (
  pg: SupabaseDirectClient,
  rankings: OpenRouterRankings,
  now: number,
  sourceTs: number
) => {
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

  // Routers and floating aliases leave the denominator without ever being
  // adjudicated, so nothing else would mention them. Say so on every tick that
  // has one: an exclusion nobody can see is indistinguishable from full
  // coverage, and if one ever carries real volume that is the signal to
  // resolve it through OpenRouter's `alias_target` rather than keep dropping
  // it. Logged once here for all three indexes: they share the exclusion.
  if (result.compositeSlugs.length > 0)
    log.warn(
      `[openrouter] excluded ${result.compositeSlugs.length} router/alias slug(s) ` +
        `from both sides — ${result.compositeSlugs.join(', ')} (` +
        `${(
          (result.compositeTokens / Math.max(result.payloadTokens, 1)) *
          100
        ).toFixed(3)}% of payload tokens)`
    )

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

  await publishOpenRouterPoint(
    pg,
    OPENROUTER_OPEN_WEIGHT_FEED_ID,
    'open-weight share',
    publication.share,
    now,
    sourceTs,
    `over ${result.dates[0]}..${result.dates[result.dates.length - 1]} ` +
      `(${result.dates.length}d, as_of ${rankings.asOf}, classification ${OPEN_WEIGHT_LIST_VERSION})`
  )
}

const publishLabShare = async (
  pg: SupabaseDirectClient,
  feed: LabShareFeed,
  feedId: string,
  rankings: OpenRouterRankings,
  now: number,
  sourceTs: number
) => {
  const label = feed === 'anthropic' ? 'anthropic share' : 'chinese-lab share'
  const result = computeLabShare(feed, rankings.rows, OPEN_WEIGHT_WINDOW_DAYS)

  const publication = validateLabSharePublication(result)
  if (!publication.ok) {
    // For the Chinese-lab feed the reason names the unknown author(s), their
    // share of tokens, and the two constants one of which needs a line. That
    // is the whole maintenance path (see lab-share.ts), so it pages.
    log.error(`[openrouter] ${label} halted — ${publication.reason}`)
    return
  }
  if (publication.unknownAuthors.length > 0)
    log.warn(
      `[openrouter] ${label} publishing with unknown author(s) ` +
        `${publication.unknownAuthors.join(', ')} excluded from both sides (${(
          publication.unknownShareOfClassified * 100
        ).toFixed(3)}% of classified tokens); ` +
        `add to CHINESE_LAB_AUTHORS or KNOWN_NON_CHINESE_AUTHORS`
    )

  await publishOpenRouterPoint(
    pg,
    feedId,
    label,
    publication.share,
    now,
    sourceTs,
    `over ${result.dates[0]}..${result.dates[result.dates.length - 1]} ` +
      `(${result.dates.length}d, as_of ${rankings.asOf}, authors ${CHINESE_LAB_LIST_VERSION}; ` +
      `other ${result.otherTokens.toExponential(3)} and composite ` +
      `${result.compositeTokens.toExponential(3)} tokens excluded)`
  )
}

/**
 * The lock → reread → validate → insert → apply sequence, per feed — the
 * same shape as the VoteHub and Fear & Greed publishers.
 *
 * The previous point is read and both checks are made INSIDE a transaction
 * holding the feed's advisory lock, and the insert happens in that same
 * transaction. Read-check-insert as three unrelated statements let two
 * publishers (a second scheduler instance mid-deploy, a manual run) both pass
 * the checks and both write — which for the as_of guard means an older
 * dataset could become the executable mark after a newer one was already
 * published. Croner's `protect` only covers one Cron object in one process.
 *
 * Two checks under the lock: validateOraclePoint (bounds, positivity, and a
 * strictly newer `ts` than what is stored), and the dataset `as_of` may never
 * regress below the one already published — an older dataset re-served after
 * a newer one must not be published as a fresh observation. Equal is fine;
 * that is the same day's dataset re-stamped hourly, by design. `sourceTs` is
 * mandatory for these feeds (insertOraclePrices refuses a point without it,
 * per OpenRouter's terms).
 *
 * The apply runs OUTSIDE the transaction, exactly as the other publishers
 * and the fast tick do it: runOracleUpdate takes its own per-contract lock,
 * and nesting it here would hold both across engine work.
 */
const publishOpenRouterPoint = async (
  pg: SupabaseDirectClient,
  feedId: string,
  label: string,
  share: number,
  now: number,
  sourceTs: number,
  detail: string
) => {
  const point = { ts: now, price: share, sourceTs }
  const feed = getOracleFeed(feedId)
  if (!feed) {
    log.error(
      `[openrouter] rejected ${label} ${share.toFixed(
        3
      )} — missing OracleFeedDef for ${feedId}`
    )
    return
  }

  const outcome = await pg.tx(async (tx) => {
    await tx.one(advisoryLockQuery(`oracle-publish:${feedId}`))
    const prev = await tx.oneOrNone<{
      ts: string
      price: number | string
      source_ts: string | null
    }>(
      `select ts, price, source_ts from oracle_prices where feed_id = $1
       order by ts desc limit 1`,
      [feedId]
    )
    const prevSourceTs =
      prev?.source_ts == null ? null : new Date(prev.source_ts).getTime()
    const rejection =
      prevSourceTs != null &&
      Number.isFinite(prevSourceTs) &&
      sourceTs < prevSourceTs
        ? `dataset as_of ${new Date(
            sourceTs
          ).toISOString()} is older than the ` +
          `as_of already published (${new Date(
            prevSourceTs
          ).toISOString()}); not relaying a regressed dataset`
        : validateOraclePoint(
            feed,
            prev
              ? { ts: new Date(prev.ts).getTime(), price: Number(prev.price) }
              : null,
            point
          )
    if (rejection) return { ok: false as const, rejection }
    await insertOraclePrices(tx, feedId, [point])
    return { ok: true as const }
  })

  if (!outcome.ok) {
    log.error(
      `[openrouter] rejected ${label} ${share.toFixed(3)} — ${
        outcome.rejection
      }`
    )
    return
  }

  await applyOraclePointToLivePerps(pg, feedId, point)
  log(`[openrouter] inserted ${share.toFixed(3)}% ${label} ${detail}`)
}
