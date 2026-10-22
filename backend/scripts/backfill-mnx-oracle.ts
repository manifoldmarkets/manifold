import { MNX_API_URL, MNX_INSTRUMENTS } from 'common/perps/mnx'
import { normalizeOraclePointBatch } from 'common/perps/oracle'
import { DAY_MS } from 'common/util/time'
import { ENV } from 'common/envs/constants'
import { fetchMnxSnapshot, parseMnxCandles } from 'shared/mnx'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { insertOraclePrices } from 'shared/oracle'
import { advisoryLockQuery } from 'shared/perps/queries'
import { getLocalEnv } from 'shared/init-admin'
import { log } from 'shared/utils'
import { assertBackfillTarget } from './backfill-guard'
import { runScript } from './run-script'

// Dry-run by default in DEV and PROD; never applies prices to live markets.
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
    const specs = MNX_INSTRUMENTS.filter(
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
        await assertBackfillTarget(tx, spec.feedId, []) // no --force escape
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
