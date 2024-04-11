import { formatMoneyNoMoniker } from 'common/util/format'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Row } from '../layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'
import clsx from 'clsx'

export function ManaCoinNumber(props: { amount: number }) {
  return (
    <Row className="items-center">
      <ManaCoin />
      {formatMoneyNoMoniker(props.amount)}
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
