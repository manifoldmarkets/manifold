import { getPerpConfig, PerpConfigPatch } from 'common/perps/management'
import { getMnxInstrument } from 'common/perps/mnx'
import { PerpContract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'
import { fetchMnxSnapshot, requireMnxReady } from 'shared/mnx'
import { getMinTradingMarkAgeMs, getOracleFeed } from 'shared/oracle-feeds'
import { requirePerpManager } from 'shared/perps/management-auth'
import { advisoryLockQuery, mergeContractDataQuery } from 'shared/perps/queries'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getContract } from 'shared/utils'
import { APIError } from 'common/api/utils'
import type { ValidatedAPIParams } from 'common/api/schema'

// Config edits serialize with trades, funding, and settlement. Fees apply to
// subsequent opens/adds; funding changes apply to the next funding event.
// Lower leverage caps grandfather existing positions. Freshness gates affect
// closes too, and may never go below the provider's cadence floor.
export const setPerpConfig = async (
  body: ValidatedAPIParams<'update-perp-config'>,
  userId: string
): Promise<PerpContract> => {
  const { contractId, expectedConfig, expectedManagerId, ...fields } = body
  if (expectedManagerId !== undefined && expectedManagerId !== userId)
    throw new APIError(
      409,
      'The signed-in account changed. Sign back in before retrying.'
    )
  const patch = removeUndefinedProps(fields)
  const keys = Object.keys(patch) as (keyof PerpConfigPatch)[]
  const pg = createSupabaseDirectClient()
  await requirePerpManager(pg, userId)
  const before = await getContract(pg, contractId)
  if (!before) throw new APIError(404, `Contract ${contractId} not found`)
  if (before.mechanism !== 'perp')
    throw new APIError(400, 'Only perp markets have a perp risk config')
  await requirePerpManager(pg, userId, before)

  // Fetch before taking the database lock. Reducing leverage remains possible
  // during a provider outage; increases require the same capability as creation.
  const snapshot =
    getMnxInstrument(before.oracleFeedId) &&
    patch.maxLeverage !== undefined &&
    patch.maxLeverage > before.maxLeverage
      ? await fetchMnxSnapshot()
      : null

  const updated = await runTransactionWithRetries(async (tx) => {
    await tx.one(advisoryLockQuery(contractId))
    const contract = await tx.oneOrNone(
      'select * from contracts where id = $1 for update',
      [contractId],
      convertContract
    )
    if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
    if (contract.mechanism !== 'perp')
      throw new APIError(400, 'Only perp markets have a perp risk config')
    await requirePerpManager(tx, userId, contract)
    if (contract.isResolved)
      throw new APIError(403, 'Cannot update a resolved market')
    // A replay of an already-applied patch is successful, without a second
    // edit. Compare the stored fields, not the defaults they resolve to: an
    // explicit default must still be stamped onto an unset or out-of-range
    // field, or the market keeps failing closed (or follows a later default
    // change) while the dashboard reports success.
    if (keys.every((key) => patch[key] === contract[key])) return contract
    const current = getPerpConfig(contract)
    for (const [key, value] of Object.entries(expectedConfig ?? {})) {
      if (value !== undefined && current[key as keyof typeof current] !== value)
        throw new APIError(
          409,
          'Market rules changed since this preview. Refresh and review again.'
        )
    }
    if (
      patch.maxLeverage !== undefined &&
      patch.maxLeverage > contract.maxLeverage &&
      getMnxInstrument(contract.oracleFeedId)
    ) {
      if (!snapshot)
        throw new APIError(
          409,
          'Leverage changed since this request. Refresh and review again.'
        )
      let supported: number
      try {
        supported = requireMnxReady(snapshot, contract.oracleFeedId)
          .supportedLeverage!
      } catch (error) {
        throw new APIError(
          400,
          error instanceof Error ? error.message : String(error)
        )
      }
      if (
        !Number.isFinite(supported) ||
        supported <= 1 ||
        patch.maxLeverage > supported
      )
        throw new APIError(
          400,
          `MNX currently supports at most ${supported}x leverage on this feed.`
        )
    }
    if (patch.maxOraclePriceAgeMs !== undefined) {
      const feed = getOracleFeed(contract.oracleFeedId)
      if (!feed) throw new APIError(400, 'Unknown oracle feed')
      const min = getMinTradingMarkAgeMs(feed)
      if (patch.maxOraclePriceAgeMs < min)
        throw new APIError(
          400,
          `Oracle age must be at least ${min / 1000} seconds for this feed.`
        )
    }
    const changes = { ...patch, lastUpdatedTime: Date.now() }
    await tx.one(mergeContractDataQuery(contractId, changes))
    // Audit is committed with the edit, so a post-response failure cannot lose it.
    await tx.none(
      `insert into contract_edits (contract_id, editor_id, data, updated_keys)
       values ($1, $2, $3, $4)`,
      [contractId, userId, contract, keys]
    )
    return { ...contract, ...changes } as PerpContract
  }, 8)

  return updated
}
