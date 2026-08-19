import { getPerpTakerFeeBps, getPerpTakerFeeImpact } from 'common/perps/fees'
import { getMinTradingMarkAgeMs, getOracleFeed } from 'shared/oracle-feeds'
import { removeUndefinedProps } from 'common/util/object'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { recordContractEdit } from 'shared/record-contract-edit'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, log, revalidateContractStaticProps } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { APIError, APIHandler } from './helpers/endpoint'

// Admin-only live tuning of a perp's risk config. Takes effect with no
// deploy or restart: the engine re-reads the contract inside every trade and
// funding transaction under the advisory lock.
// - maxLeverage: lowering the cap only constrains new opens and adds —
//   leverage is checked at trade time, never retroactively — so existing
//   positions above a lowered cap are grandfathered and a cut can never
//   force-close or liquidate anyone by itself.
// - maxFundingRate: applies from the NEXT funding event. It is the
//   per-PERIOD cap on the imbalance haircut, so on an hourly market 0.02
//   means up to 2% of the crowded side's positions per hour at full
//   imbalance. The schema keeps it inside assertPerpFundingConfig's (0, 1)
//   domain; a value at or above 1 would make every funding tick fail closed.
// - takerFeeBps: open-side BASE fee on notional (closing is free), applied
//   to the NEXT open or add. 0 disables. The schema keeps it inside
//   assertPerpTakerFeeConfig's [0, 100] domain; outside it the engine
//   fail-closes every trade. Caps the base only — the size-dependent total
//   is intentionally uncapped.
// - takerFeeImpact: size-impact coefficient of the fee (marginal rate is
//   takerFeeBps + takerFeeImpact·(share of pool)² bps, integrated over the
//   added notional — see calcPerpSizeFee; NOT the paper's k, which is
//   fundingSensitivity). 0 keeps the fee flat at the base. Applied to the
//   NEXT open or add; the schema keeps it inside assertPerpTakerFeeConfig's
//   [0, PERP_TAKER_FEE_IMPACT_MAX] domain.
// - maxOraclePriceAgeMs: the age at which the engine stops accepting trades
//   AND closes against the cached mark. Lowering it is the direct lever on
//   latency arbitrage — every stale-mark window a bot can trade is bounded by
//   this number, not by the tick rate. It is floored at the feed's own cadence
//   (getMinTradingMarkAgeMs), because a gate tighter than a couple of update
//   periods would pause the market between perfectly healthy ticks. Note it
//   pauses honest closes too, so tighten it with the feed's observed
//   reliability in hand rather than by taste.
export const updatePerpConfig: APIHandler<'update-perp-config'> = async (
  body,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const {
    contractId,
    maxLeverage,
    maxFundingRate,
    takerFeeBps,
    takerFeeImpact,
    maxOraclePriceAgeMs,
  } = body

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.mechanism !== 'perp')
    throw new APIError(400, 'Only perp markets have a perp risk config')
  if (contract.isResolved)
    throw new APIError(403, 'Cannot update a resolved market')

  if (maxOraclePriceAgeMs !== undefined) {
    const feedDef = getOracleFeed(contract.oracleFeedId)
    if (!feedDef)
      throw new APIError(
        400,
        `Contract ${contractId} references unknown feed "${contract.oracleFeedId}"`
      )
    const minMarkAgeMs = getMinTradingMarkAgeMs(feedDef)
    if (maxOraclePriceAgeMs < minMarkAgeMs)
      throw new APIError(
        400,
        `maxOraclePriceAgeMs ${maxOraclePriceAgeMs} is below feed "${contract.oracleFeedId}" update cadence (min ${minMarkAgeMs}ms) — the market would pause between healthy ticks`
      )
  }

  const lastUpdatedTime = Date.now()
  const patch = removeUndefinedProps({
    maxLeverage,
    maxFundingRate,
    takerFeeBps,
    takerFeeImpact,
    maxOraclePriceAgeMs,
    lastUpdatedTime,
  })
  await updateContract(pg, contractId, patch)
  if (maxLeverage !== undefined)
    log(
      `admin ${auth.uid} set maxLeverage on ${contract.slug}: ${contract.maxLeverage} -> ${maxLeverage}`
    )
  if (maxFundingRate !== undefined)
    log(
      `admin ${auth.uid} set maxFundingRate on ${contract.slug}: ${contract.maxFundingRate} -> ${maxFundingRate}`
    )
  if (takerFeeBps !== undefined)
    log(
      `admin ${auth.uid} set takerFeeBps on ${
        contract.slug
      }: ${getPerpTakerFeeBps(contract)} -> ${takerFeeBps}`
    )
  if (takerFeeImpact !== undefined)
    log(
      `admin ${auth.uid} set takerFeeImpact on ${
        contract.slug
      }: ${getPerpTakerFeeImpact(contract)} -> ${takerFeeImpact}`
    )
  if (maxOraclePriceAgeMs !== undefined)
    log(
      `admin ${auth.uid} set maxOraclePriceAgeMs on ${contract.slug}: ${contract.maxOraclePriceAgeMs} -> ${maxOraclePriceAgeMs}`
    )
  broadcastUpdatedContract(contract.visibility, { id: contractId, ...patch })

  const editedFields = Object.keys(
    removeUndefinedProps({
      maxLeverage,
      maxFundingRate,
      takerFeeBps,
      takerFeeImpact,
      maxOraclePriceAgeMs,
    })
  )
  return {
    result: {
      success: true as const,
      maxLeverage: maxLeverage ?? contract.maxLeverage,
      maxFundingRate: maxFundingRate ?? contract.maxFundingRate,
      takerFeeBps: takerFeeBps ?? getPerpTakerFeeBps(contract),
      takerFeeImpact: takerFeeImpact ?? getPerpTakerFeeImpact(contract),
      maxOraclePriceAgeMs: maxOraclePriceAgeMs ?? contract.maxOraclePriceAgeMs,
    },
    continue: async () => {
      await recordContractEdit(contract, auth.uid, editedFields)
      await revalidateContractStaticProps(contract)
    },
  }
}
