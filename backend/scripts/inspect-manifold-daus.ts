import { log } from 'shared/utils'
import { runScript } from './run-script'

// The April manifold-daus dev perp sits on a feed dead since June 10 and its
// hourly staleness ERROR is the main source of alert emails. Look before we
// resolve it: who holds positions, what would they be paid?

if (require.main === module)
  runScript(async ({ pg }) => {
    const c = await pg.one(
      `select id, slug, creator_id,
              data->>'oraclePrice' as price,
              to_timestamp(((data->>'oraclePriceTime')::bigint)/1000) as price_time,
              (data->>'poolLong')::numeric as l, (data->>'poolShort')::numeric as s,
              data->>'maxOraclePriceAgeMs' as max_age
       from contracts where slug = 'manifold-daus' and mechanism = 'perp'`
    )
    log(
      `${c.id} price=${c.price} @ ${new Date(c.price_time).toISOString()} L=${Math.round(
        c.l
      )} S=${Math.round(c.s)} maxAge=${c.max_age}`
    )
    const positions = await pg.manyOrNone(
      `select p.user_id, u.username, p.direction, p.size, p.cost_basis, p.entry_price
       from contract_perp_positions p join users u on u.id = p.user_id
       where p.contract_id = $1 and p.size > 0`,
      [c.id]
    )
    if (positions.length === 0) log('no open positions')
    for (const p of positions)
      log(
        `  ${p.username} ${p.direction} size=${Math.round(p.size)} cost=${Math.round(
          p.cost_basis
        )} entry=${p.entry_price}`
      )
  })
