import { formatMoneyNoMoniker } from 'common/util/format'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Row } from '../layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'

export function SpiceCoinNumber(props: { amount?: number }) {
  const { amount } = props
  return (
    <Row className="items-center whitespace-nowrap">
      {amount !== undefined && amount < 0 && '-'}
      <SpiceCoin />
      {amount !== undefined ? formatMoneyNoMoniker(Math.abs(amount)) : '---'}
    </Row>
  )
}

export function ShortSpiceCoinNumber(props: {
  amount?: number
  className?: string
}) {
  const { amount, className } = props
  return (
    <Row className={clsx('items-center whitespace-nowrap', className)}>
      {amount !== undefined && amount < 0 && (
        <span className="pr-[0.1em]">-</span>
      )}
      <SpiceCoin />
      {amount !== undefined
        ? shortenNumber(+formatMoneyNoMoniker(Math.abs(amount ?? 0)))
        : '---'}
    </Row>
  )
}

export function AnimatedSpiceCoinNumber(props: {
  amount: number
  className?: string
}) {
  const { amount, className } = props
  const balance = useAnimatedNumber(amount)
  return (
    <Row className={clsx('items-center', className)}>
      <SpiceCoin />
      <animated.div>{balance.to((b) => formatMoneyNoMoniker(b))}</animated.div>
    </Row>
  )
}