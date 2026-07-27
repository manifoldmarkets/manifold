import { PERP_LAUNCH_MARKETS } from 'shared/perps/launch-manifest'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Quick liveness check: is anything still writing the fast feeds, and has
// funding/daily-feed activity resumed (i.e. is a FIXED scheduler deployed)?

if (require.main === module)
  runScript(async ({ pg }) => {
    const feedIds = PERP_LAUNCH_MARKETS.map((market) => market.feedId)
    const feeds = await pg.manyOrNone(
      `select feed_id, max(ts) as latest,
              round(extract(epoch from (now() - max(ts)))) as age_s,
              count(*) filter (where ts > now() - interval '5 minutes') as rows_5m,
              count(*) filter (where ts > now() - interval '30 minutes') as rows_30m
       from oracle_prices
       where feed_id = any($1)
       group by feed_id order by feed_id`,
      [feedIds]
    )
    for (const f of feeds)
      log(
        `${f.feed_id}: age=${f.age_s}s rows_5m=${f.rows_5m} rows_30m=${f.rows_30m}`
      )
    const lastFunding = await pg.oneOrNone(
      `select max(ts) as last from contract_perp_funding_events`
    )
    log(
      `last funding event: ${
        lastFunding?.last ? new Date(lastFunding.last).toISOString() : 'none'
      }`
    )
  })
