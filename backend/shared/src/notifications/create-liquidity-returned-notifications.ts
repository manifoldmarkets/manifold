import { Notification } from 'common/notification'
import { Contract } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { User } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getPrivateUser } from 'shared/utils'

// Tells each provider whose share of a withdrawal came back to them, so they
// can add it again if they want to keep it in the market.
export const createLiquidityReturnedNotifications = async (
  contract: Contract,
  withdrawer: Pick<User, 'id' | 'name' | 'username' | 'avatarUrl'>,
  returned: LiquidityProvision[]
) => {
  const pg = createSupabaseDirectClient()
  for (const liquidity of returned) {
    const amount = -liquidity.amount
    // As for subsidies, too little to be worth a notification.
    if (amount < 1 || liquidity.userId === withdrawer.id) continue
    const privateUser = await getPrivateUser(liquidity.userId)
    if (!privateUser) continue
    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      'liquidity_returned'
    )
    if (!sendToBrowser) continue
    const notification: Notification = {
      id: `liquidity-returned-${liquidity.id}`,
      userId: liquidity.userId,
      reason: 'liquidity_returned',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: withdrawer.id,
      sourceType: 'liquidity',
      sourceUpdateType: 'deleted',
      sourceContractId: contract.id,
      sourceUserName: withdrawer.name,
      sourceUserUsername: withdrawer.username,
      sourceUserAvatarUrl: withdrawer.avatarUrl,
      sourceText: amount.toString(),
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
      data: { token: contract.token },
    }
    await insertNotificationToSupabase(notification, pg)
  }
}
