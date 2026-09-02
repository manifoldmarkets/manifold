import {
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeBps,
  getPerpTakerFeeImpact,
} from 'common/perps/fees'
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
// - takerFeeBps: open-side fee on notional (closing is free, so this is the
//   round-trip cost), applied to the NEXT open or add. 0 disables. The
//   schema keeps it inside assertPerpTakerFeeConfig's [0, 100] domain;
//   outside it the engine fail-closes every trade.
// - takerFeeApiBps: base fee for API-KEY opens, applied as
//   max(takerFeeBps, takerFeeApiBps) from the NEXT open or add. Unset or 0
//   = API pays the web base. Its own wider [0, 300] domain — it prices
//   hostile bot flow (the 2026-08-19/20 BTC drain was all API-key trades).
// - takerFeeImpact: size-impact coefficient of the fee (marginal rate is
//   base + takerFeeImpact·(share of pool)² bps, integrated over the added
//   notional — see calcPerpSizeFee; NOT the paper's k, which is
//   fundingSensitivity). 0 keeps the fee flat at whichever base the channel
//   selected. Applied to the NEXT open or add; the schema keeps it inside
//   assertPerpTakerFeeConfig's [0, PERP_TAKER_FEE_IMPACT_MAX] domain.
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
    takerFeeApiBps,
    takerFeeImpact,
    maxOraclePriceAgeMs,
    perpRiskPolicyMode,
  } = body

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.mechanism !== 'perp')
    throw new APIError(400, 'Only perp markets have a perp risk config')
  if (contract.isResolved)
    throw new APIError(403, 'Cannot update a resolved market')

  if (takerFeeImpact !== undefined)
    log(
      `admin ${auth.uid} set takerFeeImpact on ${
        contract.slug
      }: ${getPerpTakerFeeImpact(contract)} -> ${takerFeeImpact}`
    )
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

  // What an API-key open will ACTUALLY be charged once max(base, api) is
  // applied. Echoing the submitted value alone is misleading: a rate at or
  // below the base is a silent no-op, and with no GET for perp config and no
  // admin-UI row, this response is the only feedback the operator gets.
  const nextTakerFeeBps = takerFeeBps ?? getPerpTakerFeeBps(contract)
  const effectiveTakerFeeApiBps = getPerpEffectiveTakerFeeBps(
    {
      takerFeeBps: nextTakerFeeBps,
      takerFeeApiBps: takerFeeApiBps ?? contract.takerFeeApiBps,
    },
    true
  )

  const lastUpdatedTime = Date.now()
  // Only the Workstream B shadow knob is tunable here. The accounting mode
  // (legacy | shadow | protected) is NOT: the database refuses a flip that
  // does not come through the guarded migration tooling, and this endpoint
  // never writes those keys.
  const patch = removeUndefinedProps({
    maxLeverage,
    maxFundingRate,
    takerFeeBps,
    takerFeeApiBps,
    takerFeeImpact,
    maxOraclePriceAgeMs,
    perpRiskPolicyMode,
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
  if (takerFeeApiBps !== undefined)
    log(
      `admin ${auth.uid} set takerFeeApiBps on ${contract.slug}: ${
        contract.takerFeeApiBps ?? 'unset'
      } -> ${takerFeeApiBps} (API opens will pay ${effectiveTakerFeeApiBps} bps${
        effectiveTakerFeeApiBps !== takerFeeApiBps
          ? ` — the ${nextTakerFeeBps} bps base is higher, so this value has no effect`
          : ''
      })`
    )
  if (maxOraclePriceAgeMs !== undefined)
    log(
      `admin ${auth.uid} set maxOraclePriceAgeMs on ${contract.slug}: ${contract.maxOraclePriceAgeMs} -> ${maxOraclePriceAgeMs}`
    )
  if (perpRiskPolicyMode !== undefined)
    log(
      `admin ${auth.uid} set perpRiskPolicyMode on ${contract.slug}: ${
        contract.perpRiskPolicyMode ?? 'off'
      } -> ${perpRiskPolicyMode} (shadow only; no decision changes)`
    )
  broadcastUpdatedContract(contract.visibility, { id: contractId, ...patch })

  const editedFields = Object.keys(
    removeUndefinedProps({
      maxLeverage,
      maxFundingRate,
      takerFeeBps,
      takerFeeApiBps,
      takerFeeImpact,
      maxOraclePriceAgeMs,
      perpRiskPolicyMode,
    })
  )
  return {
    result: {
      success: true as const,
      maxLeverage: maxLeverage ?? contract.maxLeverage,
      maxFundingRate: maxFundingRate ?? contract.maxFundingRate,
      takerFeeBps: nextTakerFeeBps,
      takerFeeApiBps: takerFeeApiBps ?? contract.takerFeeApiBps ?? null,
      effectiveTakerFeeApiBps,
      takerFeeImpact: takerFeeImpact ?? getPerpTakerFeeImpact(contract),
      maxOraclePriceAgeMs: maxOraclePriceAgeMs ?? contract.maxOraclePriceAgeMs,
      perpRiskPolicyMode:
        perpRiskPolicyMode ??
        (contract.perpRiskPolicyMode === 'shadow' ? 'shadow' : 'off'),
    },
    continue: async () => {
      await recordContractEdit(contract, auth.uid, editedFields)
      await revalidateContractStaticProps(contract)
    },
  }
}
