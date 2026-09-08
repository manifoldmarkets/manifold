import { MNX_API_URL, MNX_INSTRUMENTS } from 'common/perps/mnx'
import { normalizeOraclePointBatch } from 'common/perps/oracle'
import { DAY_MS } from 'common/util/time'
import { ENV } from 'common/envs/constants'
import { parseMnxCandles } from 'shared/mnx'
import { insertOraclePrices } from 'shared/oracle'
import { readMnxSnapshot } from 'shared/perps/publish-mnx'
import { advisoryLockQuery } from 'shared/perps/queries'
import { getLocalEnv } from 'shared/init-admin'
import { log } from 'shared/utils'
import { assertBackfillTarget } from './backfill-guard'
import { runScript } from './run-script'

// Dry-run by default. Production writes are deliberately unavailable in this
// rollout; this command never calls the engine or creates markets.
if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    if (ENV !== getLocalEnv())
      throw new Error('Firebase and backend environments disagree')
    if (apply && ENV !== 'DEV')
      throw new Error('MNX backfill writes are DEV-only')
    const requested = process.argv
      .find((arg) => arg.startsWith('--feed='))
      ?.slice(7)
    const specs = MNX_INSTRUMENTS.filter(
      (i) => !requested || i.feedId === requested
    )
    if (!specs.length) throw new Error('Unknown MNX feed')
    const snapshot = await readMnxSnapshot(pg)
    for (const spec of specs) {
      const marketId = snapshot?.feeds[spec.feedId]?.marketId
      if (!marketId)
        throw new Error(`Collect ${spec.feedId} before backfilling`)
      const response = await fetch(
        `${MNX_API_URL}/markets/${marketId}/candlesticks?interval=1h&source=mark_price&limit=768&lookback_ms=${
          32 * DAY_MS
        }`,
        { signal: AbortSignal.timeout(10_000) }
      )
      if (!response.ok) throw new Error(`MNX candles: HTTP ${response.status}`)
      const candles = parseMnxCandles(
        await response.json(),
        spec,
        marketId,
        Date.now()
      )
      await pg.tx(async (tx) => {
        // Excludes a concurrent market creation and a live collector commit.
        await tx.one(advisoryLockQuery(`create-perp:${spec.feedId}`))
        await tx.one(advisoryLockQuery('mnx:markets'))
        await assertBackfillTarget(tx, spec.feedId, []) // no --force escape
        const first = await tx.one<{ ts: string | null }>(
          `select min(ts) as ts from oracle_prices where feed_id = $1 and source_data->>'kind' = 'live'`,
          [spec.feedId]
        )
        const cutoff = first.ts ? Date.parse(first.ts) : Date.now()
        const batch = normalizeOraclePointBatch(
          candles.filter((p) => p.ts < cutoff)
        )
        if (!batch.ok) throw new Error(batch.reason)
        log(
          `${apply ? 'Writing' : 'Would write'} ${
            batch.points.length
          } hourly candles to ${spec.feedId}`
        )
        if (apply) await insertOraclePrices(tx, spec.feedId, batch.points)
      })
    }
  })
