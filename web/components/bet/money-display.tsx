import { animated } from '@react-spring/web'
import { formatWithToken } from 'common/util/format'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { NumberDisplayType } from '../widgets/token-number'

export function MoneyDisplay(props: {
  amount: number
  isCashContract?: boolean
  numberType?: NumberDisplayType
}) {
  const { amount, isCashContract = false, numberType } = props

  return <>{formatAmount(amount, isCashContract, numberType)}</>
}

/** Counts to the new value instead of snapping to it, the way the market
 * probability does. A quote can move while you're looking at it — someone
 * cancels an order, or takes the one you were about to trade against — and a
 * number that changes silently is a number nobody notices changing. */
export function AnimatedMoneyDisplay(props: {
  amount: number
  isCashContract?: boolean
  numberType?: NumberDisplayType
}) {
  const { amount, isCashContract = false, numberType } = props
  const spring = useAnimatedNumber(Number.isFinite(amount) ? amount : 0)

  return (
    <animated.span>
      {spring.to((value) => formatAmount(value, isCashContract, numberType))}
    </animated.span>
  )
}

function formatAmount(
  amount: number,
  isCashContract: boolean,
  numberType: NumberDisplayType | undefined
) {
  const toDecimal =
    numberType === 'toDecimal' ? (isCashContract ? 4 : 2) : undefined

  return formatWithToken({
    amount,
    token: isCashContract ? 'CASH' : 'M$',
    toDecimal,
    short: numberType === 'short',
  })
}
