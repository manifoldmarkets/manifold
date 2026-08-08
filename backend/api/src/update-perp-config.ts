import { getPerpTakerFeeBps } from 'common/perps/fees'
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
export const updatePerpConfig: APIHandler<'update-perp-config'> = async (
  body,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const { contractId, maxLeverage, maxFundingRate, takerFeeBps } = body

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.mechanism !== 'perp')
    throw new APIError(400, 'Only perp markets have a perp risk config')
  if (contract.isResolved)
    throw new APIError(403, 'Cannot update a resolved market')

  const lastUpdatedTime = Date.now()
  const patch = removeUndefinedProps({
    maxLeverage,
    maxFundingRate,
    takerFeeBps,
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
      `admin ${auth.uid} set takerFeeBps on ${contract.slug}: ${getPerpTakerFeeBps(
        contract
      )} -> ${takerFeeBps}`
    )
  broadcastUpdatedContract(contract.visibility, { id: contractId, ...patch })

  const editedFields = Object.keys(
    removeUndefinedProps({ maxLeverage, maxFundingRate, takerFeeBps })
  )
  return {
    result: {
      success: true as const,
      maxLeverage: maxLeverage ?? contract.maxLeverage,
      maxFundingRate: maxFundingRate ?? contract.maxFundingRate,
      takerFeeBps: takerFeeBps ?? getPerpTakerFeeBps(contract),
    },
    continue: async () => {
      await recordContractEdit(contract, auth.uid, editedFields)
      await revalidateContractStaticProps(contract)
    },
  }
}
