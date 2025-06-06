import { BetFillData, Notification } from 'common/notification'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import { getPrivateUser } from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Answer } from 'common/answer'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createPushNotifications } from '../create-push-notifications' // Adjusted path
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { nanoid } from 'common/util/random'
import { last, orderBy, sum } from 'lodash'
import { formatMoneyEmail } from '../emails' // Adjusted path
import { floatingEqual } from 'common/util/math'

export const createBetFillNotification = async (
  toUser: User,
  fromUser: User,
  bet: Bet,
  limitBet: LimitBet,
  contract: Contract
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'bet_fill'
  )
  if (!sendToBrowser && !sendToMobile) return

  // The limit order fills array has a matchedBetId that does not match this bet id
  // (even though this bet has a fills array that is matched to the limit order)
  // This is likely bc this bet is an arbitrage bet. This should be fixed.
  // This matches based on timestamp because of the above bug.
  const fill =
    limitBet.fills.find((fill) => fill.timestamp === bet.createdTime) ??
    last(orderBy(limitBet.fills, 'timestamp', 'asc'))
  // const fill = limitBet.fills.find((f) => f.matchedBetId === bet.id)

  const fillAmount = fill?.amount ?? 0
  const remainingAmount =
    limitBet.orderAmount - sum(limitBet.fills.map((f) => f.amount))
  const limitAt =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? limitBet.limitProb * (contract.max - contract.min) + contract.min
      : Math.round(limitBet.limitProb * 100) + '%'
  const betAnswer =
    'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id === bet.answerId)?.text
      : undefined

  if (fillAmount < 1) {
    return
  }

  const notification: Notification = {
    id: nanoid(6),
    userId: toUser.id,
    reason: 'bet_fill',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: limitBet.id,
    sourceType: 'bet',
    sourceUpdateType: 'updated',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: fillAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    data: {
      betAnswer,
      creatorOutcome: limitBet.outcome,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
      limitAt: limitAt.toString(),
      outcomeType: contract.outcomeType,
      mechanism: contract.mechanism,
    } as BetFillData,
  }
  if (sendToBrowser) {
    const pg = createSupabaseDirectClient()
    await insertNotificationToSupabase(notification, pg)
  }
  if (sendToMobile) {
    await createPushNotifications([
      [
        privateUser,
        notification,
        `Fill on ${limitBet.outcome} order at ${limitAt}: ${contract.question}`,
        `${formatMoneyEmail(fillAmount)} filled by ${fromUser.name}: ${
          floatingEqual(remainingAmount, 0)
            ? 'Order complete.'
            : `${formatMoneyEmail(remainingAmount)} remaining.`
        }`,
      ],
    ])
  }
}
