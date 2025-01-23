import { REFERRAL_AMOUNT } from 'common/economy'
import { getSourceUrl, ReferralData } from 'common/notification'
import { NotificationFrame } from '../notification-frame'
import { ThemedText } from 'components/themed-text'
import { imageSizeMap } from 'components/user/avatar-circle'
import { Token } from 'components/token/token'
import { Notification } from 'common/notification'
import { WrittenAmount } from 'components/number/writtenCurrency'

export function ReferralNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceId, sourceUserName, sourceUserUsername, data } = notification
  const { manaAmount, cashAmount } = (data ?? {
    manaAmount: REFERRAL_AMOUNT,
    cashAmount: 0,
  }) as ReferralData

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <Token
          overrideToken={'MANA'}
          style={{ width: imageSizeMap.md, height: imageSizeMap.md }}
        />
      }
      subtitle={`@${sourceUserUsername}`}
      link={getSourceUrl(notification)}
    >
      <ThemedText>
        {cashAmount > 0 && (
          <>
            <WrittenAmount amount={cashAmount} token="CASH" />
            {' + '}
          </>
        )}
        <WrittenAmount amount={manaAmount} token="M$" /> for referring a new
        user!
      </ThemedText>
    </NotificationFrame>
  )
}
