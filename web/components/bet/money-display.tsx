import { TWOMBA_ENABLED } from 'common/envs/constants'
import { CoinNumber, NumberDisplayType } from '../widgets/manaCoinNumber'
import { formatMoney, formatSweepies } from 'common/util/format'

export function MoneyDisplay(props: {
  amount: number
  isCashContract: boolean
  numberType?: NumberDisplayType
  className?: string
  coloredCoin?: boolean
}) {
  const { amount, isCashContract, numberType, className, coloredCoin } = props

  if (TWOMBA_ENABLED) {
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
    if (isCashContract) {
      return <>{formatSweepies(amount)}</>
    }
    return <>{formatMoney(amount)}</>
  }
  return <>{formatMoney(amount)}</>
}
