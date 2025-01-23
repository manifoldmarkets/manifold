import { Notification } from 'common/notification'
import { WrittenAmount } from 'components/number/writtenCurrency'

export function IncomeNotificationLabel(props: {
  notification: Notification
  token?: 'M$' | 'CASH'
}) {
  const { notification, token = 'M$' } = props
  const { sourceText } = notification

  return (
    <WrittenAmount amount={Math.round(parseFloat(sourceText))} token={token} />
  )
}
