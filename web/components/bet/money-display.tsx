import { TWOMBA_ENABLED } from 'common/envs/constants'
import { CoinNumber, NumberDisplayType } from '../widgets/manaCoinNumber'
import { formatMoney } from 'common/util/format'

export function MoneyDisplay(props: {
  amount: number
  isCashContract: boolean
  numberType?: NumberDisplayType
}) {
  const { amount, isCashContract, numberType } = props

  if (TWOMBA_ENABLED) {
    return (
      <CoinNumber
        amount={amount}
        coinType={isCashContract ? 'sweepies' : 'mana'}
        isInline
        numberType={numberType}
      />
    )
  }
  return <>{formatMoney(amount)}</>
}
