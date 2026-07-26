import { getOraclePriceSeries } from 'api/get-oracle-price'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Exercise the new bucketSeconds param against real dev data: each frame
// should span its full window instead of truncating at the 5000-point cap.

const span = (pts: { ts: number }[]) =>
  pts.length
    ? ((pts[pts.length - 1].ts - pts[0].ts) / DAY_MS).toFixed(2) + 'd'
    : 'empty'

if (require.main === module)
  runScript(async () => {
    const cases: [string, any][] = [
      ['1M raw (old behavior)', { feedId: 'btc-usd', since: Date.now() - 30 * DAY_MS, limit: 5000 }],
      ['1M bucketed 1200s', { feedId: 'btc-usd', since: Date.now() - 30 * DAY_MS, limit: 5000, bucketSeconds: 1200 }],
      ['1W bucketed 300s', { feedId: 'btc-usd', since: Date.now() - 7 * DAY_MS, limit: 5000, bucketSeconds: 300 }],
      ['ALL bucketed 7200s', { feedId: 'btc-usd', limit: 5000, bucketSeconds: 7200 }],
      ['carbon ALL bucketed 7200s', { feedId: 'uk-grid-carbon', limit: 5000, bucketSeconds: 7200 }],
    ]
    for (const [name, body] of cases) {
      const pts = await (getOraclePriceSeries as any)(body, {} as any, {} as any)
      const sorted = [...pts].every(
        (p: any, i: number) => i === 0 || p.ts >= pts[i - 1].ts
      )
      log(
        `${name}: ${pts.length} points, span ${span(pts)}, ascending=${sorted}, ` +
          `first=${new Date(pts[0]?.ts).toISOString().slice(0, 16)} last=${new Date(
            pts[pts.length - 1]?.ts
          )
            .toISOString()
            .slice(0, 16)}`
      )
    }
  })
