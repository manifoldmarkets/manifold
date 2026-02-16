import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createCharityChampionDethronedNotification } from 'shared/create-notification'
import {
  CHARITY_CHAMPION_ENTITLEMENT_ID,
  FORMER_CHARITY_CHAMPION_ENTITLEMENT_ID,
} from 'common/shop/items'
import { convertEntitlement } from 'common/shop/types'

export const claimCharityChampion: APIHandler<'claim-charity-champion'> = async (
  props,
  auth
) => {
  const { enabled = true } = props
  const pg = createSupabaseDirectClient()

  const result = await pg.tx(async (tx) => {
    // Get the current or most recent giveaway
    const giveaway = await tx.oneOrNone<{
      giveaway_num: number
      close_time: string
    }>(
      `SELECT giveaway_num, close_time FROM charity_giveaways
       ORDER BY
         CASE WHEN close_time > NOW() THEN 0 ELSE 1 END,
         close_time DESC
       LIMIT 1`
    )

    if (!giveaway) {
      throw new APIError(404, 'No charity giveaway found')
    }

    // Get the current champion (user with most tickets)
    const championRow = await tx.oneOrNone<{
      user_id: string
      total_tickets: string
    }>(
      `SELECT user_id, SUM(num_tickets) as total_tickets
       FROM charity_giveaway_tickets
       WHERE giveaway_num = $1
       GROUP BY user_id
       ORDER BY total_tickets DESC
       LIMIT 1`,
      [giveaway.giveaway_num]
    )

    if (!championRow) {
      throw new APIError(400, 'No tickets have been purchased yet')
    }

    // Check if the requesting user is the current champion
    if (championRow.user_id !== auth.uid) {
      throw new APIError(
        403,
        'Only the #1 ticket buyer can claim the Charity Champion Trophy'
      )
    }

    // Find the current trophy holder (if any) before removing them
    const previousHolder = await tx.oneOrNone<{
      user_id: string
      granted_time: string
    }>(
      `SELECT user_id, granted_time FROM user_entitlements
       WHERE entitlement_id = $1 AND user_id != $2`,
      [CHARITY_CHAMPION_ENTITLEMENT_ID, auth.uid]
    )

    // Delete the old holder's entitlement entirely
    await tx.none(
      `DELETE FROM user_entitlements
       WHERE entitlement_id = $1 AND user_id != $2`,
      [CHARITY_CHAMPION_ENTITLEMENT_ID, auth.uid]
    )

    // Build metadata with previous holder info for the log
    const metadata = previousHolder
      ? {
          previousHolderId: previousHolder.user_id,
          previousHolderClaimedAt: previousHolder.granted_time,
        }
      : null

    // Upsert the claiming user's trophy entitlement
    await tx.none(
      `INSERT INTO user_entitlements (user_id, entitlement_id, granted_time, enabled, metadata)
       VALUES ($1, $2, NOW(), $3, $4::jsonb)
       ON CONFLICT (user_id, entitlement_id)
       DO UPDATE SET enabled = $3, granted_time = NOW(), metadata = $4::jsonb`,
      [auth.uid, CHARITY_CHAMPION_ENTITLEMENT_ID, enabled, metadata ? JSON.stringify(metadata) : null]
    )

    // Grant permanent "former charity champion" entitlement (never revoked)
    await tx.none(
      `INSERT INTO user_entitlements (user_id, entitlement_id, granted_time, enabled)
       VALUES ($1, $2, NOW(), true)
       ON CONFLICT (user_id, entitlement_id) DO NOTHING`,
      [auth.uid, FORMER_CHARITY_CHAMPION_ENTITLEMENT_ID]
    )

    // Fetch updated entitlements for the user
    const entitlementRows = await tx.manyOrNone<{
      user_id: string
      entitlement_id: string
      granted_time: string
      expires_time: string | null
      enabled: boolean
    }>(
      `SELECT user_id, entitlement_id, granted_time, expires_time, enabled
       FROM user_entitlements
       WHERE user_id = $1
       AND (expires_time IS NULL OR expires_time > NOW())`,
      [auth.uid]
    )

    // Fetch claiming user info for notification (while still in tx)
    const claimingUser = previousHolder
      ? await tx.oneOrNone<{
          id: string
          name: string
          username: string
          avatar_url: string
        }>(
          `SELECT id, name, username, data->>'avatarUrl' as avatar_url FROM users WHERE id = $1`,
          [auth.uid]
        )
      : null

    return {
      previousHolderId: previousHolder?.user_id,
      claimingUser,
      entitlements: entitlementRows.map(convertEntitlement),
    }
  })

  // Send dethrone notification after transaction commits (fire and forget)
  if (result.previousHolderId && result.claimingUser) {
    createCharityChampionDethronedNotification(
      result.previousHolderId,
      {
        id: result.claimingUser.id,
        name: result.claimingUser.name,
        username: result.claimingUser.username,
        avatarUrl: result.claimingUser.avatar_url ?? '',
      } as any
    ).catch(() => {})
  }

  return {
    success: true,
    entitlements: result.entitlements,
  }
}
