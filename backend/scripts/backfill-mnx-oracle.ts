import { MNX_API_URL, MNX_LIVE_INSTRUMENTS } from 'common/perps/mnx'
import { normalizeOraclePointBatch } from 'common/perps/oracle'
import { DAY_MS } from 'common/util/time'
import { ENV } from 'common/envs/constants'
import { fetchMnxSnapshot, parseMnxCandles } from 'shared/mnx'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { insertOraclePrices } from 'shared/oracle'
import { advisoryLockQuery } from 'shared/perps/queries'
import { getLocalEnv } from 'shared/init-admin'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Dry-run by default in DEV and PROD; never applies prices to live markets.
//
// A feed that already backs a live market can still be backfilled, but only
// with history from before that market existed. The shared backfill guard
// refuses any live feed because a backfill there would add points among
// history a market has already priced against. This one cannot: it inserts
// only completed MNX candles older than the feed's first stored point. Orders,
// funding, liquidation and portfolio metrics all read points from after the
// market was created. So every point must also predate the creation of every
// live market on the feed, or the run stops. There is no --force.
export const getPreMarketBackfillBlocker = (
  points: readonly { ts: number }[],
  liveMarkets: readonly { slug: string; createdTime: number }[]
): string | undefined => {
  if (!liveMarkets.length || !points.length) return undefined
  if (liveMarkets.some((m) => !Number.isFinite(m.createdTime)))
    return 'a live market on this feed has no valid creation time'
  const earliest = liveMarkets.reduce((a, b) =>
    a.createdTime <= b.createdTime ? a : b
  )
  const latest = Math.max(...points.map((p) => p.ts))
  if (!Number.isFinite(latest) || latest >= earliest.createdTime)
    return `candle at ${new Date(
      latest
    ).toISOString()} is not older than live market ${
      earliest.slug
    } (created ${new Date(earliest.createdTime).toISOString()})`
  return undefined
}
if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    if (
      !['DEV', 'PROD'].includes(process.env.NEXT_PUBLIC_FIREBASE_ENV ?? '') ||
      ENV !== getLocalEnv()
    )
      throw new Error(
        'Set NEXT_PUBLIC_FIREBASE_ENV explicitly to DEV or PROD and select the matching Firebase project'
      )
    const requested = process.argv
      .find((arg) => arg.startsWith('--feed='))
      ?.slice(7)
    const specs = MNX_LIVE_INSTRUMENTS.filter(
      (i) => !requested || i.feedId === requested
    )
    if (!specs.length) throw new Error('Unknown MNX feed')
    const snapshot = await fetchMnxSnapshot()
    for (const spec of specs) {
      const live = snapshot.feeds[spec.feedId]
      if (live.health.status !== 'available' || live.point?.sourceTs == null)
        throw new Error(
          `${spec.feedId}: a validated live source timestamp is required before backfill`
        )
      const marketId = spec.marketId
      const response = await fetch(
        `${MNX_API_URL}/markets/${marketId}/candlesticks?interval=1h&source=mark_price&limit=768&lookback_ms=${
          32 * DAY_MS
        }`,
        {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'Manifold-oracle/1.0' },
        }
      )
      if (!response.ok) throw new Error(`MNX candles: HTTP ${response.status}`)
      const candles = parseMnxCandles(
        await response.json(),
        spec,
        marketId,
        // A completed candle is not a live provider check. Keep its bucket
        // end older than the live source stamp, including hourly H100, so the
        // first live observation cannot look like a chronology regression.
        Math.min(Date.now(), live.point.sourceTs)
      )
      await pg.tx(async (tx) => {
        // Excludes a concurrent market creation and a live collector commit.
        await tx.one(advisoryLockQuery(`create-perp:${spec.feedId}`))
        await tx.one(advisoryLockQuery(`oracle-publish:${spec.feedId}`))
        const liveMarkets = (
          await tx.manyOrNone<{ slug: string; created_time: string }>(
            `select slug, created_time from contracts
             where mechanism = 'perp' and resolution_time is null
               and data->>'oracleFeedId' = $1`,
            [spec.feedId]
          )
        ).map((m) => ({
          slug: m.slug,
          createdTime: Date.parse(m.created_time),
        }))
        const first = await tx.one<{ ts: string | null }>(
          `select min(ts) as ts from oracle_prices where feed_id = $1`,
          [spec.feedId]
        )
        const cutoff = first.ts ? Date.parse(first.ts) : Date.now()
        const batch = normalizeOraclePointBatch(
          candles.filter((p) => p.ts < cutoff)
        )
        if (!batch.ok) throw new Error(batch.reason)
        for (const point of batch.points) {
          const rejection = validateOraclePoint(
            getOracleFeed(spec.feedId)!,
            null,
            point
          )
          if (rejection) throw new Error(rejection)
        }
        const blocker = getPreMarketBackfillBlocker(batch.points, liveMarkets)
        if (blocker)
          throw new Error(
            `refusing to backfill ${spec.feedId}: ${blocker}. Only history from before every live market on the feed may be added.`
          )
        if (liveMarkets.length && batch.points.length)
          log(
            `${spec.feedId} backs live market(s) ${liveMarkets
              .map((m) => m.slug)
              .join(', ')}; every candle predates their creation`
          )
        log(
          `${apply ? 'Writing' : 'Would write'} ${
            batch.points.length
          } hourly candles to ${spec.feedId}`
        )
        if (!batch.points.length)
          log.warn(
            `${spec.feedId}: no earlier candles available within MNX's 32-day window; verify stored history before launch`
          )
        if (apply) await insertOraclePrices(tx, spec.feedId, batch.points)
      })
    }
  })
