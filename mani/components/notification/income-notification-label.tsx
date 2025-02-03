import { Notification } from 'common/notification'
import { WrittenAmount } from 'components/number/writtenCurrency'
import { ThemedTextProps } from 'components/themed-text'

export function IncomeNotificationLabel({
  notification,
  token = 'M$',
  ...rest
}: {
  notification: Notification
  token?: 'M$' | 'CASH'
} & ThemedTextProps) {
  const { sourceText } = notification

  return (
    <WrittenAmount
      amount={Math.round(parseFloat(sourceText))}
      token={token}
      {...rest}
    />
  )
}
