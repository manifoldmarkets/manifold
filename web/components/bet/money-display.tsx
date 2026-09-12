import { formatWithToken } from 'common/util/format'
import { NumberDisplayType } from '../widgets/token-number'

export function MoneyDisplay(props: {
  amount: number
  isCashContract?: boolean
  numberType?: NumberDisplayType
}) {
  const { amount, isCashContract = false, numberType } = props

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
