import { PerpContract } from 'common/contract'
import { PERPS_SKIP_ORACLE_FRESHNESS } from 'common/envs/constants'
import { getFundingPeriodMs, shouldApplyFunding } from 'common/perps/funding'
import { getOracleFreshness } from 'common/perps/oracle'
import { mapAsync } from 'common/util/promise'
import { DAY_MS } from 'common/util/time'
import {
  notifyPerpAdlResult,
  notifyPerpOracleResult,
} from 'shared/notifications/perps'
import { getOracleFeed } from 'shared/oracle-feeds'
import {
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
//      For fast-feed contracts the 5s tick has usually done this already,
//      in which case the engine's no-change fast path makes it a cheap no-op.
//   3. runFunding -> applies funding event, emits per-user funding events.
//      The authoritative once-per-period gate lives inside runFunding
//      (under the advisory lock); the check here is only a cheap prefilter.
//      Both are the same shouldApplyFunding predicate from
//      common/perps/funding, so they cannot drift apart.
//   4. Emit per-user liquidation/ADL notifications.
// Each perp is processed under its own advisory lock inside the engine, so
// this scheduler is safe to run concurrently with open/close API calls and
// with the fast tick.
export const updatePerps = async () => {
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
    const feedDef = getOracleFeed(contract.oracleFeedId)
    if (!feedDef) {
      log.error(
        `[update-perps] ${contract.slug}: feed ${contract.oracleFeedId} is not registered; refusing to mutate the market`
      )
      return
    }
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
    // log.error feeds GCP log-based alerting. But a feed dead for over a
    // week is no longer an incident, it's a lifecycle decision being
    // ignored (the manifold-daus zombie emailed hourly for weeks): drop to
    // WARN with a nag so the alert channel stays meaningful.
    const alertThreshold = Math.min(
      contract.maxOraclePriceAgeMs,
      feedDef.staleAfterMs
    )
    const staleAge = now - latest.ts
    if (staleAge > alertThreshold) {
      if (staleAge > 7 * DAY_MS) {
        log.warn(
          `[update-perps] ${contract.slug}: feed ${
            contract.oracleFeedId
          } dead for ${Math.round(
            staleAge / DAY_MS
          )}d — resolve the market or revive the feed`
        )
      } else {
        log.error(
          `[update-perps] ${contract.slug}: feed ${contract.oracleFeedId} is stale (age ${staleAge}ms > ${alertThreshold}ms)`
        )
      }
    }
    // Only skip the engine when the price exceeds what the MARKET tolerates;
    // an unhealthy-but-tolerable price should still apply.
    if (
      !PERPS_SKIP_ORACLE_FRESHNESS &&
      getOracleFreshness(latest.ts, contract.maxOraclePriceAgeMs, now)
        .status !== 'fresh'
    ) {
      return
    }

    const oracleResult = await runOracleUpdate(
      contract.id,
      latest.price,
      latest.ts,
      latest.sourceTs
    )
    if (oracleResult) {
      // Best-effort, like apply-oracle-point does. This only touches the DB
      // when liquidations or ADL occurred, i.e. exactly the runs whose
      // funding we least want to skip: a throw here used to fall through to
      // the per-contract catch below, and because funding is charged per
      // event rather than accrued, the imbalanced side then kept a whole
      // period of carry it owed.
      try {
        await notifyPerpOracleResult(pg, contract, latest.price, oracleResult)
      } catch (error) {
        log.error(
          `[update-perps] failed to notify oracle result for ${contract.id}; continuing to funding`,
          { error }
        )
      }
    }

    // Cheap prefilter; the authoritative gate is inside runFunding. Both
    // call the same shouldApplyFunding — the tolerances CANNOT differ (a
    // hand-rolled full-period comparison here once silently skipped
    // alternate hours; see the predicate's docs for the observed case).
    // The oracle-anchor side (slow-period contracts only) passes the feed's
    // latest ts; by this point runOracleUpdate has applied it, so a pass
    // here implies the engine's view (contract.oraclePriceTime) is the same
    // or newer.
    const lastFunding = await pg.oneOrNone<{ ts: string }>(
      `select ts from contract_perp_funding_events
       where contract_id = $1 order by ts desc limit 1`,
      [contract.id]
    )
    if (
      shouldApplyFunding({
        now,
        lastFundingTime: lastFunding
          ? new Date(lastFunding.ts).getTime()
          : undefined,
        fundingStartTime: contract.createdTime,
        latestOracleTime: latest.ts,
        fundingPeriodMs: getFundingPeriodMs(contract),
      })
    ) {
      const fundingResult = await runFunding(contract.id, now, oracleResult)
      if (fundingResult) {
        await notifyPerpAdlResult(
          pg,
          contract,
          fundingResult.fundingEvent.oraclePrice,
          fundingResult
        )
      }
    }
  } catch (err) {
    log.error(`[update-perps] error updating ${contract.slug}: ${err}`)
  }
}
