import { PerpContract } from 'common/contract'
import {
  PERPS_ENABLED,
  PERPS_SKIP_ORACLE_FRESHNESS,
} from 'common/envs/constants'
import { mapAsync } from 'common/util/promise'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import { getOracleFeed } from 'shared/oracle-feeds'
import {
  FUNDING_PERIOD_MS,
  getLatestOraclePriceForFeed,
  runFunding,
  runOracleUpdate,
} from 'shared/perps/engine'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Runs hourly. For each live perp contract:
//   1. Pull latest oracle price (skip + ALERT if stale beyond
//      maxOraclePriceAgeMs — this is the health check for daily feeds; fast
//      feeds are additionally watched every tick by update-oracle-feeds).
//   2. runOracleUpdate -> applies liquidations + ADL + updates oraclePrice.
//      For fast-feed contracts the 15s tick has usually done this already,
//      in which case the engine's no-change fast path makes it a cheap no-op.
//   3. runFunding -> applies funding event, emits per-user funding events.
//      The authoritative once-per-FUNDING_PERIOD_MS gate lives inside
//      runFunding (under the advisory lock); the check here is only a cheap
//      prefilter.
//   4. Emit per-user liquidation/ADL notifications.
// Each perp is processed under its own advisory lock inside the engine, so
// this scheduler is safe to run concurrently with open/close API calls and
// with the fast tick.
export const updatePerps = async () => {
  if (!PERPS_ENABLED) {
    log('perps disabled, skipping update-perps')
    return
  }
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone<{ data: PerpContract }>(
    `select data from contracts
     where mechanism = 'perp'
       and resolution_time is null`
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
      log.error(
        `[update-perps] ${contract.slug}: feed ${contract.oracleFeedId} has no data at all`
      )
      return
    }
    // Alert at the earlier of the feed's health threshold and the market's
    // tolerance — a live market heading toward a freeze is an incident.
    // log.error feeds GCP log-based alerting.
    const feedDef = getOracleFeed(contract.oracleFeedId)
    const alertThreshold = Math.min(
      contract.maxOraclePriceAgeMs,
      feedDef?.staleAfterMs ?? Infinity
    )
    if (now - latest.ts > alertThreshold) {
      log.error(
        `[update-perps] ${contract.slug}: feed ${
          contract.oracleFeedId
        } is stale (age ${now - latest.ts}ms > ${alertThreshold}ms)`
      )
    }
    // Only skip the engine when the price exceeds what the MARKET tolerates;
    // an unhealthy-but-tolerable price should still apply.
    if (
      !PERPS_SKIP_ORACLE_FRESHNESS &&
      now - latest.ts > contract.maxOraclePriceAgeMs
    ) {
      return
    }

    const oracleResult = await runOracleUpdate(
      contract.id,
      latest.price,
      latest.ts
    )
    if (oracleResult) {
      await notifyPerpOracleResult(pg, contract, latest.price, oracleResult)
    }

    // Cheap prefilter; the authoritative gate is inside runFunding.
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
    log.error(`[update-perps] error updating ${contract.slug}: ${err}`)
  }
}
