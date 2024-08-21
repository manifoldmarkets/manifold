import { formatMoneyNoMoniker } from 'common/util/format'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Row } from '../layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function CoinNumber(props: {
  amount?: number
  coinType?: 'mana' | 'spice' | 'sweepies'
  numberType?: 'short' | 'animated'
  className?: string
  isInline?: boolean
  coinClassName?: string
  style?: React.CSSProperties
}) {
  const {
    amount,
    coinType = 'mana',
    numberType,
    className,
    isInline,
    coinClassName,
    style,
  } = props

  return (
    <Row
      className={clsx(
        'items-center whitespace-nowrap',
        isInline && 'relative ml-[1.1em] inline-flex items-baseline',
        className
      )}
      style={style}
    >
      {amount !== undefined && amount <= -1 && '-'}
      {coinType == 'spice' ? (
        <SpiceCoin
          className={clsx(
            isInline && 'absolute -left-[1.1em] top-[0.25em]',
            coinClassName
          )}
        />
      ) : coinType == 'sweepies' ? (
        <SweepiesCoin
          className={clsx(
            isInline && 'absolute -left-[1.1em] top-[0.25em]',
            coinClassName
          )}
        />
      ) : (
        <ManaCoin
          className={clsx(
            isInline && 'absolute -left-[1.1em] top-[0.25em] shrink-0',
            coinClassName
          )}
        />
      )}
      {amount == undefined ? (
        '---'
      ) : numberType == 'short' ? (
        shortenNumber(
          +formatMoneyNoMoniker(Math.abs(amount ?? 0)).replaceAll(',', '')
        )
      ) : numberType == 'animated' ? (
        <AnimatedNumber amount={Math.abs(amount ?? 0)} />
      ) : (
        formatMoneyNoMoniker(Math.abs(amount))
      )}
    </Row>
  )
}

function AnimatedNumber(props: { amount?: number }) {
  const { amount } = props
  const balance = useAnimatedNumber(amount ?? 0)
  return (
    <animated.div>{balance.to((b) => formatMoneyNoMoniker(b))}</animated.div>
  )
}
