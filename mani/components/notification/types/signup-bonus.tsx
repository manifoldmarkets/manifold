import { getNotificationColor, NotificationFrame } from '../notification-frame'
import { getSourceUrl, Notification } from 'common/notification'
import { WrittenAmount } from 'components/number/writtenCurrency'
import { Token } from 'components/token/token'
import { imageSizeMap } from 'components/user/avatar-circle'

export function SignupBonusNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceText } = notification

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <Token
          overrideToken="MANA"
          style={{ width: imageSizeMap.md, height: imageSizeMap.md }}
        />
      }
      link={getSourceUrl(notification)}
      subtitle={
        <>
          Thank you for using Manifold! This is for being a valuable new
          predictor.
        </>
      }
    >
      <>
        <WrittenAmount
          amount={parseInt(sourceText ?? '')}
          token={'M$'}
          color={getNotificationColor(notification)}
        />{' '}
        added
      </>
    </NotificationFrame>
  )
}
