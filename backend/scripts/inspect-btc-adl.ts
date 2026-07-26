import { log } from 'shared/utils'
import { runScript } from './run-script'

// Focused read-only inspection of the persistent zero-delta ADL events on the
// dev BTC market: what factors is applyADL returning, who (if anyone) is
// affected, and what do the current positions/pools look like?

if (require.main === module)
  runScript(async ({ pg }) => {
    const contract = await pg.one(
      `select id, slug, data->>'oraclePrice' as price,
              (data->>'poolLong')::numeric as pool_long,
              (data->>'poolShort')::numeric as pool_short
       from contracts where slug = 'bitcoin-usd-perpetual'`
    )
    log(
      `contract ${contract.id} price=${contract.price} L=${contract.pool_long} S=${contract.pool_short}`
    )

    log('=== last 5 adl events, full data ===')
    const adls = await pg.manyOrNone(
      `select ts, oracle_price, data from contract_perp_events
       where contract_id = $1 and event_type = 'adl'
       order by ts desc limit 5`,
      [contract.id]
    )
    for (const a of adls)
      log(
        `  ${new Date(a.ts).toISOString()} price=${a.oracle_price} data=${JSON.stringify(
          a.data
        )}`
      )

    log('=== adl event count by day ===')
    const counts = await pg.manyOrNone(
      `select date_trunc('day', ts) as day, count(*) as n
       from contract_perp_events
       where contract_id = $1 and event_type = 'adl'
       group by 1 order by 1`,
      [contract.id]
    )
    for (const c of counts)
      log(`  ${new Date(c.day).toISOString().slice(0, 10)}: ${c.n}`)

    log('=== current positions ===')
    const positions = await pg.manyOrNone(
      `select user_id, direction, size, cost_basis, original_cost_basis,
              entry_price, liquidation_price, updated_time
       from contract_perp_positions where contract_id = $1
       order by size desc`,
      [contract.id]
    )
    for (const p of positions)
      log(
        `  ${p.direction} user=${p.user_id} size=${p.size} cost=${p.cost_basis} origCost=${p.original_cost_basis} entry=${p.entry_price} liq=${p.liquidation_price} updated=${new Date(
          p.updated_time
        ).toISOString()}`
      )

    log('=== size history of current position holders (last 30 events each) ===')
    const evts = await pg.manyOrNone(
      `select user_id, event_type, ts, size_delta, cost_basis_delta
       from contract_perp_events
       where contract_id = $1 and user_id is not null
       order by ts desc limit 30`,
      [contract.id]
    )
    for (const e of evts)
      log(
        `  ${new Date(e.ts).toISOString()} ${e.event_type} user=${e.user_id} sizeDelta=${e.size_delta} costDelta=${e.cost_basis_delta}`
      )
  })
