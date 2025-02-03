import { ThemedText, ThemedTextProps } from 'components/themed-text'
import { CASH_NAME, MANA_NAME } from 'constants/token-names'
import { NumberText } from 'components/number-text'

export function WrittenAmount({
  amount,
  token,
  ...rest
}: { amount: number; token: 'M$' | 'CASH' } & ThemedTextProps) {
  return (
    <ThemedText {...rest}>
      <NumberText {...rest}>{amount}</NumberText>
      <ThemedText {...rest}>
        {' '}
        {token == 'M$' ? MANA_NAME : CASH_NAME}
      </ThemedText>
    </ThemedText>
  )
}
