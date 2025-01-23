import { NotificationFrame } from '../notification-frame'
import { Notification, PaymentCompletedData } from 'common/notification'
import { ThemedText } from 'components/themed-text'
import { formatMoneyUSD } from 'common/util/format'
import { IconSymbol } from 'components/ui/icon-symbol'
import { imageSizeMap } from 'components/user/avatar-circle'
import { useColor } from 'hooks/use-color'

export function PaymentSuccessNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { amount, currency, paymentMethodType } =
    notification.data as PaymentCompletedData
  const color = useColor()
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <IconSymbol
          name="dollarsign.circle.fill"
          size={imageSizeMap.md}
          color={color.cashText}
        />
      }
      subtitle={'You should receive your funds within the next couple days.'}
    >
      <ThemedText>
        Your {paymentMethodType} payment for {formatMoneyUSD(amount)} {currency}{' '}
        was approved!
      </ThemedText>
    </NotificationFrame>
  )
}
