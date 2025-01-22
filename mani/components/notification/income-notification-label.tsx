import { Notification } from 'common/notification'
import { ThemedText } from 'components/themed-text'
import { CASH_NAME, MANA_NAME } from 'constants/token-names'

export function IncomeNotificationLabel(props: {
  notification: Notification
  token?: 'M$' | 'CASH'
}) {
  const { notification, token = 'M$' } = props
  const { sourceText } = notification
  const amount = new Intl.NumberFormat('en-US').format(
    Math.round(parseFloat(sourceText))
  )

  return (
    <ThemedText size="md">
      <ThemedText family={'JetBrainsMono'} size="md">
        {amount}
      </ThemedText>
      <ThemedText size="md">
        {' '}
        {token == 'M$' ? MANA_NAME : CASH_NAME}
      </ThemedText>
    </ThemedText>
  )
}
