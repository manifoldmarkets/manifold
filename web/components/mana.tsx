import clsx from 'clsx'
import { formatMoney } from 'common/lib/util/format'
import { Row } from './layout/row'

export function ManaSymbol(props: { className?: string }) {
  const { className } = props
  return (
    <div className="font-mana inline-flex align-bottom text-inherit">M$</div>
  )
}

export function FormattedMana(props: {
  amount: number
  absolute?: boolean
  className?: string
}) {
  const { amount, absolute, className } = props
  let manaAmount = amount
  if (absolute) {
    manaAmount = Math.abs(amount)
  }
  return (
    <Row className={clsx('inline-flex align-bottom', className)}>
      <ManaSymbol />
      {formatMoney(manaAmount)}
    </Row>
  )
}
