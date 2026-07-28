import { PerpContract } from 'common/contract'
import { Notification } from 'common/notification'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { getPrivateUser } from 'shared/utils'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { MANIFOLD_AVATAR_URL } from 'common/user'
import { formatMoney } from 'common/util/format'
import { nanoid } from 'common/util/random'
import type {
  AdlNotificationResult,
  OracleUpdateResult,
} from 'shared/perps/engine'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'

// Emit per-user notifications for one oracle update's liquidations and ADL
// adjustments. Shared by the hourly update-perps job and the fast
// update-oracle-feeds tick so the two paths can't drift. ADL notifications go
// only to users whose positions were actually scaled — applyADL only shrinks
// profitable positions on the winning side, so a blanket "everyone on this
// side" notification would mislead losers.
export const notifyPerpOracleResult = async (
  pg: SupabaseDirectClient,
  contract: PerpContract,
  oraclePrice: number,
  result: AdlNotificationResult & Pick<OracleUpdateResult, 'liquidated'>
) => {
  for (const liq of result.liquidated) {
    await createPerpLiquidationNotification(pg, contract, liq.userId, {
      direction: liq.direction,
      liquidationPrice: liq.liquidationPrice,
      oraclePrice,
      size: liq.size,
      originalCostBasis: liq.originalCostBasis,
    })
  }
  await notifyPerpAdlResult(pg, contract, oraclePrice, result)
}

export const notifyPerpAdlResult = async (
  pg: SupabaseDirectClient,
  contract: PerpContract,
  oraclePrice: number,
  result: AdlNotificationResult
) => {
  for (const adj of result.adlAdjusted) {
    const sizeAfter = adj.position.size
    const sizeBefore = adj.previousPosition.size
    await createPerpAdlNotification(pg, contract, adj.position.userId, {
      direction: adj.position.direction,
      scaleFactor: adj.scaleFactor,
      oraclePrice,
      sizeBefore,
      sizeAfter,
    })
  }
  for (const { position, payout } of result.adlSettled) {
    await createPerpAdlNotification(pg, contract, position.userId, {
      direction: position.direction,
      scaleFactor: 0,
      oraclePrice,
      sizeBefore: position.size,
      sizeAfter: 0,
      settlementPayout: payout,
    })
  }
}

// Notify a user that their perp position was liquidated.
export const createPerpLiquidationNotification = async (
  pg: SupabaseDirectClient,
  contract: PerpContract,
  userId: string,
  data: {
    direction: 'long' | 'short'
    liquidationPrice: number
    oraclePrice: number
    size: number
    originalCostBasis: number
  }
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'perp_liquidation'
  )
  if (!sendToBrowser) return

  // Lead with the money. The one number a liquidated trader cares about is
  // how much margin they lost; price context explains why. (QA feedback:
  // "no idea what happened except that I lost".)
  const leverage =
    data.originalCostBasis > 0 ? data.size / data.originalCostBasis : 0
  const levText = leverage >= 1.5 ? `${Math.round(leverage)}× ` : ''
  const decimals = inferPriceDecimals([data.oraclePrice, data.liquidationPrice])
  const sourceText = `Liquidated: your ${levText}${data.direction} on ${
    contract.question
  } lost its ${formatMoney(
    data.originalCostBasis
  )} margin. The price hit ${formatPrice(
    data.oraclePrice,
    decimals
  )}, past your liquidation price of ${formatPrice(
    data.liquidationPrice,
    decimals
  )}.`

  const notification: Notification = {
    id: nanoid(6),
    userId,
    reason: 'perp_liquidation',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'updated',
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceUserName: contract.creatorName,
    sourceUserUsername: contract.creatorUsername,
    sourceUserAvatarUrl: contract.creatorAvatarUrl ?? MANIFOLD_AVATAR_URL,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
    sourceText,
    data: data as any,
  }
  await insertNotificationToSupabase(notification, pg)
}

// Notify a user that ADL (auto-deleveraging) reduced their position.
export const createPerpAdlNotification = async (
  pg: SupabaseDirectClient,
  contract: PerpContract,
  userId: string,
  data: {
    direction: 'long' | 'short'
    scaleFactor: number
    oraclePrice: number
    sizeBefore?: number
    sizeAfter?: number
    settlementPayout?: number
  }
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'perp_adl'
  )
  if (!sendToBrowser) return

  // Throttle: while price grinds along the ADL boundary, every tick re-shaves
  // the same position — one dev position got 55 notifications in an
  // afternoon. One per user/contract/hour is signal; the rest is spam. The
  // position panel still shows the live size.
  if (data.settlementPayout == null) {
    const recent = await pg.oneOrNone(
      `select 1 from user_notifications
       where user_id = $1
         and data->>'reason' = 'perp_adl'
         and data->>'sourceContractId' = $2
         and ((data->>'createdTime')::bigint) > $3
       limit 1`,
      [userId, contract.id, Date.now() - 60 * 60 * 1000]
    )
    if (recent) return
  }

  // "Auto-deleveraged by 85.7%" is opaque to a normal user. Say what
  // happened, to which market, by how much, and why - and that their cost
  // basis is untouched (only the claim on future profit was scaled).
  const cutPct = ((1 - data.scaleFactor) * 100).toFixed(1)
  const sizes =
    data.sizeBefore != null && data.sizeAfter != null
      ? ` (${formatMoney(data.sizeBefore)} -> ${formatMoney(
          data.sizeAfter
        )} notional)`
      : ''
  const sourceText =
    data.settlementPayout != null
      ? `Your ${data.direction} on ${
          contract.question
        } was fully auto-deleveraged${sizes} to stay payable. The position is closed and its ${formatMoney(
          data.settlementPayout
        )} remaining margin was returned to your balance.`
      : `Your ${data.direction} on ${contract.question} was reduced ${cutPct}%${sizes} to stay payable: your unrealized profit exceeded what the other side's pool can pay. Your cost basis is unchanged.`

  const notification: Notification = {
    id: nanoid(6),
    userId,
    reason: 'perp_adl',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'updated',
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceUserName: contract.creatorName,
    sourceUserUsername: contract.creatorUsername,
    sourceUserAvatarUrl: contract.creatorAvatarUrl ?? MANIFOLD_AVATAR_URL,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
    sourceText,
    data: data as any,
  }
  await insertNotificationToSupabase(notification, pg)
}
