import { formatMoneyNoMoniker } from 'common/util/format'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Row } from '../layout/row'

export function ManaCoinNumber(props: { amount: number }) {
  return (
    <Row className="items-center">
      <ManaCoin />
      {formatMoneyNoMoniker(props.amount)}
    </Row>
  )
}
