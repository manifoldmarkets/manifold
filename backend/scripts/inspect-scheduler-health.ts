import { log } from 'shared/utils'
import { runScript } from './run-script'

// When did each perps scheduler job last leave a trace in the DB?
// - update-oracle-feeds (15s): latest btc-usd oracle row
// - update-perps (hourly): latest contract_perp_funding_events row per contract
// - update-eci / update-trump-approval (daily): latest oracle row per feed

if (require.main === module)
  runScript(async ({ pg }) => {
    log('=== funding events: last per contract (all time) ===')
    const funding = await pg.manyOrNone(
      `select c.slug, count(*) as total, max(f.ts) as last
       from contract_perp_funding_events f
       join contracts c on c.id = f.contract_id
       group by c.slug order by max(f.ts) desc`
    )
    for (const f of funding)
      log(
        `  ${f.slug}: total=${f.total} last=${new Date(f.last).toISOString()}`
      )

    log('=== per-user funding events in contract_perp_events: last 5 ===')
    const userFunding = await pg.manyOrNone(
      `select contract_id, ts, count(*) as n
       from contract_perp_events where event_type = 'funding'
       group by contract_id, ts order by ts desc limit 5`
    )
    for (const u of userFunding)
      log(`  ${new Date(u.ts).toISOString()} contract=${u.contract_id} users=${u.n}`)

    log('=== oracle rows per feed per day, last 7 days ===')
    const daily = await pg.manyOrNone(
      `select feed_id, date_trunc('day', ts) as day, count(*) as n
       from oracle_prices
       where ts > now() - interval '7 days'
       group by 1, 2 order by feed_id, day`
    )
    for (const d of daily)
      log(
        `  ${d.feed_id} ${new Date(d.day).toISOString().slice(0, 10)}: ${d.n}`
      )

    log('=== live contracts: cached price age ===')
    const perps = await pg.manyOrNone(
      `select slug, data->>'oraclePrice' as price,
              round(extract(epoch from (now() - to_timestamp(((data->>'oraclePriceTime')::bigint)/1000)))) as age_s
       from contracts where mechanism = 'perp' and resolution_time is null`
    )
    for (const p of perps) log(`  ${p.slug}: price=${p.price} age=${p.age_s}s`)
  })
