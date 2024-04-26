import { formatMoneyNoMoniker } from 'common/util/format'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Row } from '../layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'

export function CoinNumber(props: {
  amount?: number
  isSpice?: boolean
  numberType?: 'short' | 'animated'
  className?: string
  isInline?: boolean
}) {
  const { amount, isSpice, numberType, className, isInline } = props
  return (
    <Row
      className={clsx(
        'items-center whitespace-nowrap',
        className,
        isSpice ? 'text-sky-600 dark:text-sky-400' : '',
        isInline && 'relative ml-[1.1em] inline-flex items-baseline'
      )}
    >
      {amount !== undefined && amount <= -1 && '-'}
      {!!isSpice ? (
        <SpiceCoin
          className={clsx(isInline && 'absolute -left-[1.1em] top-[0.25em]')}
        />
      ) : (
        <ManaCoin
          className={clsx(isInline && 'absolute -left-[1.1em] top-[0.25em]')}
        />
      )}
      {amount == undefined ? (
        '---'
      ) : numberType == 'short' ? (
        shortenNumber(
          +formatMoneyNoMoniker(Math.abs(amount ?? 0)).replaceAll(',', '')
        )
      ) : numberType == 'animated' ? (
        <AnimatedNumber amount={amount} />
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
