import { formatWithToken } from 'common/util/format'
import { TokenNumber, NumberDisplayType } from '../widgets/token-number'

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
      <TokenNumber
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
    <>
      {formatWithToken({
        amount: amount,
        token: isCashContract ? 'CASH' : 'M$',
        toDecimal: toDecimal,
        short: numberType === 'short',
      })}
    </>
  )
}
