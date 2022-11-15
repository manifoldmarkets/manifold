import { formatMoney } from 'common/lib/util/format'
import { Row } from './layout/row'

export function ManaSymbol(props: { className?: string }) {
  const { className } = props
  return <div className="font-mana text-inherit">M$</div>
}

export function FormattedMana(props: { amount: number }) {
  const { amount } = props
  return (
    <Row className="inline-flex gap-0.5">
      <ManaSymbol />
      {formatMoney(amount)}
    </Row>
  )
}
