import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getTrophyDefinition,
  getTrophyTierConfig,
  getNextUnclaimedTier,
  TROPHY_TIER_INDEX,
  type TrophyTier,
} from 'common/trophies'

export const claimTrophyTier: APIHandler<'claim-trophy-tier'> = async (
  props,
  auth
) => {
  const { trophyId, tier } = props
  const pg = createSupabaseDirectClient()

  // Validate trophy exists
  const def = getTrophyDefinition(trophyId)
  if (!def) {
    throw new APIError(404, `Trophy not found: ${trophyId}`)
  }

  // Validate tier exists on this trophy
  const tierConfig = getTrophyTierConfig(trophyId, tier as TrophyTier)
  if (!tierConfig) {
    throw new APIError(400, `Invalid tier '${tier}' for trophy ${trophyId}`)
  }

  return await pg.tx(async (tx) => {
    // Lock the row to prevent race conditions
    const row = await tx.oneOrNone<{
      current_value: string
      highest_claimed_tier: string | null
    }>(
      `select current_value, highest_claimed_tier
       from user_trophy_progress
       where user_id = $1 and trophy_id = $2
       for update`,
      [auth.uid, trophyId]
    )

    if (!row) {
      throw new APIError(
        400,
        'No progress found for this trophy. Progress is updated nightly.'
      )
    }

    const currentValue = Number(row.current_value)
    const highestClaimed = row.highest_claimed_tier as TrophyTier | null

    // Check sequential ordering: must claim the next tier in sequence
    const nextTier = getNextUnclaimedTier(trophyId, highestClaimed)
    if (!nextTier || nextTier.tier !== tier) {
      const expectedTier = nextTier?.tier ?? '(all claimed)'
      throw new APIError(
        400,
        `Must claim tiers sequentially. Next claimable tier: ${expectedTier}`
      )
    }

    // Check threshold
    if (currentValue < tierConfig.threshold) {
      throw new APIError(
        400,
        `Insufficient progress: ${currentValue} / ${tierConfig.threshold}`
      )
    }

    // Update claimed tier
    await tx.none(
      `update user_trophy_progress
       set highest_claimed_tier = $1, last_claimed_time = now()
       where user_id = $2 and trophy_id = $3`,
      [tier, auth.uid, trophyId]
    )

    // Phase 2: reward hooks will go here
    // - runTxnFromBank for mana rewards
    // - streak freeze grants
    // - shop entitlement unlocks

    // Compute next tier info for the response
    const afterClaimNext = getNextUnclaimedTier(
      trophyId,
      tier as TrophyTier
    )

    return {
      success: true as const,
      nextTier: afterClaimNext
        ? {
            tier: afterClaimNext.tier,
            threshold: afterClaimNext.threshold,
            currentValue,
          }
        : null,
    }
  })
}
