import { PerpContract } from 'common/contract'
import { PERPS_ENABLED } from 'common/envs/constants'
import { mapAsync } from 'common/util/promise'
import {
  createPerpAdlNotification,
  createPerpLiquidationNotification,
} from 'shared/notifications/perps'
import {
  FUNDING_PERIOD_MS,
  getLatestOraclePriceForFeed,
  runFunding,
  runOracleUpdate,
} from 'shared/perps/engine'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Runs hourly. For each live perp contract:
//   1. Pull latest oracle price (skip if stale beyond maxOraclePriceAgeMs).
//   2. runOracleUpdate -> applies liquidations + ADL + updates oraclePrice.
//   3. runFunding -> applies funding event, emits per-user funding events.
//   4. Emit per-user liquidation/ADL notifications.
// Each perp is processed under its own advisory lock inside the engine, so
// this scheduler is safe to run concurrently with open/close API calls.
export const updatePerps = async () => {
  if (!PERPS_ENABLED) {
    log('perps disabled, skipping update-perps')
    return
  }
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone<{ data: PerpContract }>(
    `select data from contracts
     where data->>'mechanism' = 'perp'
       and (data->>'isResolved')::boolean is not true`
  )
  const contracts = rows.map((r) => r.data)
  log('update-perps found', contracts.length, 'live perp markets')

  await mapAsync(contracts, (c) => updateOnePerp(c), 5)
}

const updateOnePerp = async (contract: PerpContract) => {
  const pg = createSupabaseDirectClient()
  try {
    const latest = await getLatestOraclePriceForFeed(contract.oracleFeedId)
    const now = Date.now()
    if (!latest) {
      log(`skipping ${contract.slug}: no oracle price for feed`)
      return
    }
    if (now - latest.ts > contract.maxOraclePriceAgeMs) {
      log(
        `skipping ${contract.slug}: oracle feed ${contract.oracleFeedId} stale (${
          now - latest.ts
        }ms)`
      )
      return
    }

    const oracleResult = await runOracleUpdate(
      contract.id,
      latest.price,
      latest.ts
    )
    if (oracleResult) {
      for (const liq of oracleResult.liquidated) {
        await createPerpLiquidationNotification(pg, contract, liq.userId, {
          direction: liq.direction,
          liquidationPrice: liq.liquidationPrice,
          oraclePrice: latest.price,
          size: liq.size,
          originalCostBasis: liq.originalCostBasis,
        })
      }
      // Only notify users whose positions were actually scaled — applyADL
      // only shrinks profitable positions on the winning side, so a blanket
      // "everyone on this side" notification would mislead losers.
      for (const adj of oracleResult.adlAdjusted) {
        await createPerpAdlNotification(
          pg,
          contract,
          adj.position.userId,
          {
            direction: adj.position.direction,
            scaleFactor: adj.scaleFactor,
            oraclePrice: latest.price,
          }
        )
      }
    }

    // Funding: only run if at least FUNDING_PERIOD_MS has elapsed since last
    // funding event, to allow the scheduler to run more frequently without
    // drifting funding cadence.
    const lastFunding = await pg.oneOrNone<{ ts: string }>(
      `select ts from contract_perp_funding_events
       where contract_id = $1 order by ts desc limit 1`,
      [contract.id]
    )
    const lastFundingMs = lastFunding
      ? new Date(lastFunding.ts).getTime()
      : 0
    if (now - lastFundingMs >= FUNDING_PERIOD_MS) {
      await runFunding(contract.id, now, oracleResult)
    }
  } catch (err) {
    log(`error updating perp ${contract.slug}:`, err)
  }
}
