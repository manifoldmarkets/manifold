import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxnInBetQueue, type TxnData } from 'shared/txn/run-txn'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  getShopItem,
  getEntitlementId,
  EXCLUSIVE_SLOTS,
  getEntitlementIdsForSlot,
  SHOP_ITEMS,
  isSeasonalItemAvailable,
  getSeasonalAvailabilityText,
  AchievementRequirement,
} from 'common/shop/items'
import { convertEntitlement, UserEntitlement } from 'common/shop/types'
import {
  SUPPORTER_ENTITLEMENT_IDS,
  getBenefit,
  getMaxStreakFreezes,
} from 'common/supporter-config'
import { DAY_MS } from 'common/util/time'

// Runs large read-only aggregate queries OUTSIDE the write transaction to avoid
// holding locks open during expensive scans.
async function checkItemRequirement(
  pg: SupabaseDirectClient,
  userId: string,
  requirement: AchievementRequirement
): Promise<void> {
  const { type, threshold, description } = requirement
  let userValue = 0
  let valueName = ''

  switch (type) {
    case 'streak': {
      const row = await pg.oneOrNone<{ currentBettingStreak: number }>(
        `SELECT COALESCE((data->>'currentBettingStreak')::int, 0) as "currentBettingStreak" FROM users WHERE id = $1`,
        [userId]
      )
      userValue = row?.currentBettingStreak ?? 0
      valueName = 'streak'
      break
    }
    case 'profit': {
      const row = await pg.oneOrNone<{ profit: number }>(
        `SELECT COALESCE(SUM(profit), 0) as profit FROM user_contract_metrics WHERE user_id = $1 AND profit > 0`,
        [userId]
      )
      userValue = row?.profit ?? 0
      valueName = 'profit'
      break
    }
    case 'loss': {
      const row = await pg.oneOrNone<{ loss: number }>(
        `SELECT COALESCE(SUM(ABS(profit)), 0) as loss FROM user_contract_metrics WHERE user_id = $1 AND profit < 0`,
        [userId]
      )
      userValue = row?.loss ?? 0
      valueName = 'loss'
      break
    }
    case 'volume': {
      const row = await pg.oneOrNone<{ volume: number }>(
        `SELECT COALESCE(SUM(ABS(amount)), 0) as volume FROM contract_bets WHERE user_id = $1`,
        [userId]
      )
      userValue = row?.volume ?? 0
      valueName = 'volume'
      break
    }
    case 'donations': {
      const row = await pg.oneOrNone<{ donations: number }>(
        `SELECT COALESCE(SUM(num_tickets), 0) as donations FROM charity_giveaway_tickets WHERE user_id = $1`,
        [userId]
      )
      userValue = row?.donations ?? 0
      valueName = 'donations'
      break
    }
    case 'referrals': {
      const row = await pg.oneOrNone<{ referrals: number }>(
        `SELECT COUNT(*) as referrals FROM users WHERE (data->>'referredByUserId') = $1`,
        [userId]
      )
      userValue = row?.referrals ?? 0
      valueName = 'referrals'
      break
    }
    case 'loan': {
      const row = await pg.oneOrNone<{ balance: number }>(
        `SELECT balance FROM users WHERE id = $1`,
        [userId]
      )
      userValue = (row?.balance ?? 0) < 0 ? Math.abs(row!.balance) : 0
      valueName = 'loan balance'
      break
    }
    case 'seasonsPlatinum': {
      const row = await pg.oneOrNone<{ count: number }>(
        `SELECT COUNT(*) as count FROM leagues WHERE user_id = $1 AND division >= 4`,
        [userId]
      )
      userValue = row?.count ?? 0
      valueName = 'seasons at Platinum+'
      break
    }
  }

  if (userValue < threshold) {
    throw new APIError(
      403,
      `Requirement not met: ${description}. Your ${valueName}: ${Math.floor(userValue)}/${threshold}`
    )
  }
}

export const shopPurchase: APIHandler<'shop-purchase'> = async (
  { itemId },
  auth
) => {
  const item = getShopItem(itemId)
  if (!item) {
    throw new APIError(404, 'Item not found')
  }

  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  // Get the entitlement ID (may differ from item ID for shared entitlements)
  const entitlementId = getEntitlementId(item)

  const pg = createSupabaseDirectClient()

  // Check achievement requirement BEFORE entering the transaction.
  // These are large read-only aggregate queries that don't need transactional consistency
  // and should not hold a write lock open while they scan big tables.
  if (item.requirement) {
    await checkItemRequirement(pg, auth.uid, item.requirement)
  }

  const result = await pg.tx(async (tx) => {
    const user = await getUser(auth.uid, tx)
    if (!user) throw new APIError(401, 'Your account was not found')

    if (user.isBannedFromPosting) {
      throw new APIError(403, 'Your account is banned')
    }

    // Check one-time purchase limit via user_entitlements table
    if (item.limit === 'one-time') {
      const existingEntitlement = await tx.oneOrNone(
        `SELECT 1 FROM user_entitlements WHERE user_id = $1 AND entitlement_id = $2`,
        [auth.uid, entitlementId]
      )
      if (existingEntitlement) {
        throw new APIError(403, 'You already own this item')
      }
    }

    // Check seasonal availability
    if (item.seasonalAvailability && !isSeasonalItemAvailable(item)) {
      const availabilityText = getSeasonalAvailabilityText(item) ?? 'during its season'
      throw new APIError(
        403,
        `This item is only available ${availabilityText}`
      )
    }

    // Check streak freeze purchase cap based on supporter tier
    if (itemId === 'streak-forgiveness') {
      // Fetch user's supporter entitlements to determine max capacity
      const supporterEntitlements = await tx.manyOrNone(
        `SELECT * FROM user_entitlements
         WHERE user_id = $1
         AND entitlement_id = ANY($2)
         AND enabled = true
         AND (expires_time IS NULL OR expires_time > NOW())`,
        [auth.uid, [...SUPPORTER_ENTITLEMENT_IDS]]
      )
      const entitlements = supporterEntitlements.map(convertEntitlement)
      const maxFreezes = getMaxStreakFreezes(entitlements)

      // Get current streak freeze count
      const currentFreezes = user.streakForgiveness ?? 0

      if (currentFreezes >= maxFreezes) {
        throw new APIError(
          403,
          `MAX OWNED - You have ${currentFreezes}/${maxFreezes} streak freezes (your tier's maximum)`
        )
      }
    }

    // Check if user is a supporter for discount
    // Note: Don't apply discount to supporter tier purchases themselves
    const isSupporterTierPurchase = SUPPORTER_ENTITLEMENT_IDS.includes(
      entitlementId as (typeof SUPPORTER_ENTITLEMENT_IDS)[number]
    )

    // For supporter tier purchases, check for existing supporter entitlement to calculate upgrade credit
    let existingSupporter: {
      entitlement_id: string
      expires_time: Date | null
    } | null = null
    let upgradeCredit = 0

    if (isSupporterTierPurchase) {
      existingSupporter = await tx.oneOrNone<{
        entitlement_id: string
        expires_time: Date | null
      }>(
        `SELECT entitlement_id, expires_time FROM user_entitlements
         WHERE user_id = $1
         AND entitlement_id = ANY($2)
         AND enabled = true
         AND (expires_time IS NULL OR expires_time > NOW())`,
        [auth.uid, [...SUPPORTER_ENTITLEMENT_IDS]]
      )

      // Calculate prorated credit from remaining time on existing tier
      if (existingSupporter?.expires_time) {
        const msRemaining =
          existingSupporter.expires_time.getTime() - Date.now()
        const daysRemaining = Math.max(0, msRemaining / DAY_MS)

        // Get old tier price
        const oldTierPrice =
          SHOP_ITEMS.find((i) => i.id === existingSupporter!.entitlement_id)
            ?.price ?? 0

        // Credit = remaining days * (oldPrice / 30 days)
        // Only apply credit when upgrading to a different (higher) tier
        if (existingSupporter.entitlement_id !== entitlementId) {
          upgradeCredit = Math.floor(daysRemaining * (oldTierPrice / 30))
        }
      }
    }

    // Get current entitlements to check supporter status
    let currentEntitlements: UserEntitlement[] = []
    if (!isSupporterTierPurchase) {
      const entRows = await tx.manyOrNone(
        `SELECT * FROM user_entitlements
         WHERE user_id = $1
         AND enabled = true
         AND (expires_time IS NULL OR expires_time > NOW())`,
        [auth.uid]
      )
      currentEntitlements = entRows.map(convertEntitlement)
    }

    // Get discount from supporter benefits (0 for non-supporters)
    const shopDiscount = getBenefit(currentEntitlements, 'shopDiscount', 0)
    const basePrice =
      shopDiscount > 0
        ? Math.floor(item.price * (1 - shopDiscount))
        : item.price

    // Apply upgrade credit (for supporter tier upgrades)
    const price = Math.max(0, basePrice - upgradeCredit)

    // Check balance (runTxnInBetQueue will also check, but let's give a better error)
    if (user.balance < price) {
      throw new APIError(403, 'Insufficient balance')
    }

    // Create transaction using the standard pattern (skip if price is 0, e.g., downgrade fully covered by credit)
    let txnId: string | null = null
    if (price > 0) {
      const discountPercent = Math.round(shopDiscount * 100)
      const descriptionParts = [`Purchased ${item.name}`]
      if (discountPercent > 0) {
        descriptionParts.push(`(${discountPercent}% supporter discount)`)
      }
      if (upgradeCredit > 0) {
        descriptionParts.push(`(M$${upgradeCredit} credit from previous tier)`)
      }

      // Use different transaction types for memberships vs cosmetics
      const txnData: TxnData = isSupporterTierPurchase
        ? {
            category: 'MEMBERSHIP_PAYMENT',
            fromType: 'USER',
            fromId: auth.uid,
            toType: 'BANK',
            toId: 'BANK',
            amount: price,
            token: 'M$',
            description: descriptionParts.join(' '),
            data: { itemId, upgradeCredit },
          }
        : {
            category: 'SHOP_PURCHASE',
            fromType: 'USER',
            fromId: auth.uid,
            toType: 'BANK',
            toId: 'BANK',
            amount: price,
            token: 'M$',
            description: descriptionParts.join(' '),
            data: { itemId, supporterDiscount: shopDiscount },
          }

      const txn = await runTxnInBetQueue(tx, txnData)
      txnId = txn.id
    }

    // Create shop_order record
    await tx.none(
      `INSERT INTO shop_orders (user_id, item_id, price_mana, txn_id, status)
       VALUES ($1, $2, $3, $4, 'COMPLETED')`,
      [auth.uid, itemId, price, txnId]
    )

    // Create/update entitlement (for non-instant items)
    let entitlement: UserEntitlement | undefined
    if (item.type !== 'instant') {
      // For exclusive slots, disable other items in the same slot first
      if (EXCLUSIVE_SLOTS.includes(item.slot)) {
        const slotEntitlementIds = getEntitlementIdsForSlot(item.slot)
        // Disable all other entitlements in this slot (except the one we're about to enable)
        await tx.none(
          `UPDATE user_entitlements
           SET enabled = false
           WHERE user_id = $1
           AND entitlement_id = ANY($2)
           AND entitlement_id != $3`,
          [auth.uid, slotEntitlementIds, entitlementId]
        )
      }

      // For items with explicit conflicts, disable conflicting items
      if (item.conflicts?.length) {
        await tx.none(
          `UPDATE user_entitlements
           SET enabled = false
           WHERE user_id = $1
           AND entitlement_id = ANY($2)`,
          [auth.uid, item.conflicts]
        )
      }

      // For supporter tiers: DELETE all existing supporter entitlements (upgrade replaces, doesn't stack)
      if (isSupporterTierPurchase) {
        await tx.none(
          `DELETE FROM user_entitlements
           WHERE user_id = $1
           AND entitlement_id = ANY($2)`,
          [auth.uid, [...SUPPORTER_ENTITLEMENT_IDS]]
        )
      }

      // For time-limited items, calculate expiration
      let expiresTime: Date | null = null
      if (item.duration) {
        // For supporter tiers: stack time for same-tier renewals, fresh for upgrades
        // For other items, stack time on existing entitlement
        if (isSupporterTierPurchase) {
          const isSameTierRenewal =
            existingSupporter?.entitlement_id === entitlementId

          if (isSameTierRenewal && existingSupporter?.expires_time) {
            // Same tier renewal - stack time on existing expiration
            const currentExpires = existingSupporter.expires_time
            const baseTime =
              currentExpires > new Date()
                ? currentExpires.getTime()
                : Date.now()
            expiresTime = new Date(baseTime + item.duration)
          } else {
            // Different tier (upgrade) or no existing - fresh 30 days
            expiresTime = new Date(Date.now() + item.duration)
          }
        } else {
          // Check for existing entitlement to stack time
          const existing = await tx.oneOrNone<{ expires_time: Date | null }>(
            `SELECT expires_time FROM user_entitlements
             WHERE user_id = $1 AND entitlement_id = $2`,
            [auth.uid, entitlementId]
          )

          if (existing?.expires_time && existing.expires_time > new Date()) {
            // Add duration to existing expiration (stacking)
            expiresTime = new Date(existing.expires_time.getTime() + item.duration)
          } else {
            // No existing or expired - start fresh from now
            expiresTime = new Date(Date.now() + item.duration)
          }
        }
      }

      // For memberships: set auto_renew = true; for other items: default to false
      await tx.one(
        isSupporterTierPurchase
          ? `INSERT INTO user_entitlements (user_id, entitlement_id, expires_time, enabled, auto_renew)
             VALUES ($1, $2, $3, true, true)
             ON CONFLICT (user_id, entitlement_id) DO UPDATE SET
               expires_time = EXCLUDED.expires_time,
               enabled = true,
               auto_renew = true
             RETURNING *`
          : `INSERT INTO user_entitlements (user_id, entitlement_id, expires_time, enabled)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (user_id, entitlement_id) DO UPDATE SET
               expires_time = EXCLUDED.expires_time,
               enabled = true
             RETURNING *`,
        [auth.uid, entitlementId, expiresTime]
      )
    }

    // Fetch all entitlements after the transaction to return updated state
    const allEntitlements = await tx.manyOrNone(
      `SELECT * FROM user_entitlements WHERE user_id = $1`,
      [auth.uid]
    )
    const entitlements = allEntitlements.map(convertEntitlement)

    // Find the one we just created/updated for backwards compatibility
    if (item.type !== 'instant') {
      entitlement = entitlements.find((e) => e.entitlementId === entitlementId)
    }

    // Item-specific effects
    if (itemId === 'streak-forgiveness') {
      await tx.none(
        `UPDATE users
         SET data = jsonb_set(
           COALESCE(data, '{}'),
           '{streakForgiveness}',
           to_jsonb(COALESCE((data->>'streakForgiveness')::int, 0) + 1)
         )
         WHERE id = $1`,
        [auth.uid]
      )
    }

    return { success: true as const, entitlement, entitlements, upgradeCredit }
  })

  return result
}
