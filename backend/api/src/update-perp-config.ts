import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { recordContractEdit } from 'shared/record-contract-edit'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, log, revalidateContractStaticProps } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { APIError, APIHandler } from './helpers/endpoint'

// Admin-only live tuning of a perp's risk config. Takes effect on the NEXT
// trade with no deploy or restart: the engine re-reads the contract inside
// every trade transaction (engine.ts checks leverage > contract.maxLeverage
// under the advisory lock). Lowering the cap only constrains new opens and
// adds — leverage is checked at trade time, never retroactively — so
// existing positions above a lowered cap are grandfathered and a cut can
// never force-close or liquidate anyone by itself.
export const updatePerpConfig: APIHandler<'update-perp-config'> = async (
  body,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const { contractId, maxLeverage } = body

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.mechanism !== 'perp')
    throw new APIError(400, 'Only perp markets have a max leverage')
  if (contract.isResolved)
    throw new APIError(403, 'Cannot update a resolved market')

  const prev = contract.maxLeverage
  const lastUpdatedTime = Date.now()
  await updateContract(pg, contractId, { maxLeverage, lastUpdatedTime })
  log(
    `admin ${auth.uid} set maxLeverage on ${contract.slug}: ${prev} -> ${maxLeverage}`
  )
  broadcastUpdatedContract(contract.visibility, {
    id: contractId,
    maxLeverage,
    lastUpdatedTime,
  })

  return {
    result: { success: true as const, maxLeverage },
    continue: async () => {
      await recordContractEdit(contract, auth.uid, ['maxLeverage'])
      await revalidateContractStaticProps(contract)
    },
  }
}
