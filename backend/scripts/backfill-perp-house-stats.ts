import { runScript } from './run-script'
import {
  calculatePerpHouseBackfill,
  PERP_HOUSE_BACKFILL_QUERY,
  PERP_HOUSE_BACKFILL_UPDATE,
  PerpHouseBackfillInput,
} from 'shared/perps/pool-stats-backfill'

// Dry run by default. Pass --write to persist successfully reconstructed values.
runScript(async ({ pg }) => {
  const contracts = await pg.manyOrNone<{ contract_id: string }>(
    `select distinct contract_id from contract_perp_hourly_stats
     where source = 'backfill' and marked_position_value is null`
  )
  for (const { contract_id } of contracts) {
    const input = await pg.one<PerpHouseBackfillInput>(
      PERP_HOUSE_BACKFILL_QUERY,
      [contract_id]
    )
    const values = calculatePerpHouseBackfill(input)
    const reconstructed = values.filter((v) => v.marked_position_value != null)
    if (process.argv.includes('--write') && reconstructed.length > 0)
      await pg.none(PERP_HOUSE_BACKFILL_UPDATE, [
        contract_id,
        JSON.stringify(reconstructed),
      ])
    console.log(
      `${contract_id}: ${reconstructed.length}/${
        values.length
      } house-value observations reconstructed${
        process.argv.includes('--write') ? ' and saved' : ' (dry run)'
      }`
    )
  }
})
