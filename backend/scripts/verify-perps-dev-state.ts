import { log } from 'shared/utils'
import { runScript } from './run-script'

// Read-only snapshot of perps state on dev, for the launch QA checklist:
//   1. liquidation/ADL events vs. their notification rows (delivery check)
//   2. funding cadence (exactly one event per contract per hour)
//   3. oracle feed freshness
//   4. live perp contracts: cached price age + pools
// Safe to run any time; writes nothing.

if (require.main === module)
  runScript(async ({ pg }) => {
    log('=== 1. liquidation / adl events (last 30 days) ===')
    const liqEvents = await pg.manyOrNone(
      `select e.contract_id, c.slug, e.user_id, e.event_type, e.ts,
              e.oracle_price, e.size_delta, e.original_cost_basis_delta
       from contract_perp_events e join contracts c on c.id = e.contract_id
       where e.event_type in ('liquidation', 'adl')
         and e.ts > now() - interval '30 days'
       order by e.ts desc`
    )
    for (const e of liqEvents)
      log(
        `  ${e.event_type} ${new Date(e.ts).toISOString()} ${e.slug} user=${
          e.user_id
        } price=${e.oracle_price} sizeDelta=${e.size_delta} marginDelta=${
          e.original_cost_basis_delta
        }`
      )

    log('=== 1b. perp_liquidation / perp_adl notification rows ===')
    const notifs = await pg.manyOrNone(
      `select user_id, data->>'reason' as reason,
              to_timestamp(((data->>'createdTime')::bigint)/1000) as created,
              data->>'sourceContractSlug' as slug,
              left(data->>'sourceText', 140) as text
       from user_notifications
       where data->>'reason' in ('perp_liquidation', 'perp_adl')
       order by (data->>'createdTime')::bigint desc
       limit 20`
    )
    if (notifs.length === 0) log('  NONE FOUND')
    for (const n of notifs)
      log(
        `  ${n.reason} ${new Date(n.created).toISOString()} ${n.slug} user=${
          n.user_id
        }`
      )
    for (const n of notifs) log(`    text: ${n.text}`)

    log('=== 2. funding cadence, last 48h (want: 1 event/contract/hour) ===')
    const funding = await pg.manyOrNone(
      `select c.slug, count(*) as events,
              min(f.ts) as first, max(f.ts) as last
       from contract_perp_funding_events f
       join contracts c on c.id = f.contract_id
       where f.ts > now() - interval '48 hours'
       group by c.slug order by c.slug`
    )
    for (const f of funding)
      log(
        `  ${f.slug}: ${f.events} events, ${new Date(
          f.first
        ).toISOString()} .. ${new Date(f.last).toISOString()}`
      )
    const dupes = await pg.manyOrNone(
      `select c.slug, date_trunc('hour', f.ts) as hr, count(*) as n
       from contract_perp_funding_events f
       join contracts c on c.id = f.contract_id
       where f.ts > now() - interval '48 hours'
       group by 1, 2 having count(*) > 1`
    )
    log(
      dupes.length === 0
        ? '  double-run check: PASS (no hour has >1 event per contract)'
        : `  double-run check: FAIL ${JSON.stringify(dupes)}`
    )

    log('=== 3. oracle feed freshness ===')
    const feeds = await pg.manyOrNone(
      `select feed_id, max(ts) as latest,
              round(extract(epoch from (now() - max(ts)))) as age_s,
              count(*) filter (where ts > now() - interval '1 hour') as rows_1h
       from oracle_prices group by feed_id order by feed_id`
    )
    for (const f of feeds)
      log(
        `  ${f.feed_id}: latest=${new Date(f.latest).toISOString()} age=${
          f.age_s
        }s rows_last_hour=${f.rows_1h}`
      )

    log('=== 4. live perp contracts ===')
    const perps = await pg.manyOrNone(
      `select slug, data->>'oraclePrice' as price,
              round(extract(epoch from (now() - to_timestamp(((data->>'oraclePriceTime')::bigint)/1000)))) as price_age_s,
              round((data->>'poolLong')::numeric) as pool_long,
              round((data->>'poolShort')::numeric) as pool_short,
              data->>'oracleFeedId' as feed,
              resolution_time is not null as resolved
       from contracts where mechanism = 'perp' order by created_time`
    )
    for (const p of perps)
      log(
        `  ${p.slug}: price=${p.price} (age ${p.price_age_s}s) L=${p.pool_long} S=${p.pool_short} feed=${p.feed} resolved=${p.resolved}`
      )
  })
