import { formatMoneyNoMoniker } from 'common/util/format'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Row } from '../layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { shortenNumber } from 'web/lib/util/formatNumber'

export function ManaCoinNumber(props: { amount?: number }) {
  const { amount } = props
  return (
    <Row className="items-center whitespace-nowrap">
      {amount !== undefined && amount < 0 && '-'}
      <ManaCoin />
      {amount !== undefined ? formatMoneyNoMoniker(Math.abs(amount)) : '---'}
    </Row>
  )
}

export function ShortManaCoinNumber(props: {
  amount?: number
  className?: string
}) {
  const { amount, className } = props
  return (
    <Row className={clsx('items-center whitespace-nowrap', className)}>
      {amount !== undefined && amount < 0 && (
        <span className="pr-[0.1em]">-</span>
      )}
      <ManaCoin />
      {amount !== undefined ? shortenNumber(Math.abs(amount)) : '---'}
    </Row>
  )
}

export function AnimatedManaCoinNumber(props: {
  amount: number
  className?: string
}) {
  const { amount, className } = props
  const balance = useAnimatedNumber(amount)
  return (
    <Row className={clsx('items-center', className)}>
      <ManaCoin />
      <animated.div>{balance.to((b) => formatMoneyNoMoniker(b))}</animated.div>
    </Row>
  )
}
