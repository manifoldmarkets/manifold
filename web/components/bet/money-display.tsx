import { TWOMBA_ENABLED } from 'common/envs/constants'
import { CoinNumber, NumberDisplayType } from '../widgets/manaCoinNumber'
import {
  formatMoney,
  formatMoneyWithDecimals,
  formatSweepies,
  formatWithToken,
} from 'common/util/format'

export function MoneyDisplay(props: {
  amount: number
  isCashContract: boolean
  numberType?: NumberDisplayType
  className?: string
  coloredCoin?: boolean
}) {
  const { amount, isCashContract, numberType, className, coloredCoin } = props

  if (coloredCoin) {
    return (
      <CoinNumber
        amount={amount}
        coinType={isCashContract ? 'sweepies' : 'mana'}
        isInline
        numberType={numberType}
        className={className}
      />
    )
  }

  const toDecimal =
    numberType === 'toDecimal' ? (isCashContract ? 4 : 2) : undefined

  return (
    <>{formatWithToken(amount, isCashContract ? 'CASH' : 'M$', toDecimal)}</>
  )
}
