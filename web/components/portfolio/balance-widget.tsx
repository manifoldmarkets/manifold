import { formatMoney } from 'common/util/format'
import { Row } from '../layout/row'
import { sumBy } from 'lodash'
import { AnyBalanceChangeType } from 'common/balance-change'
import { DAY_MS } from 'common/util/time'

export function BalanceWidget(props: {
  balanceChanges: AnyBalanceChangeType[]
}) {
  const { balanceChanges } = props
  const spentToday = sumBy(
    balanceChanges.filter(
      (change) => change.createdTime > Date.now() - DAY_MS && change.amount < 0
    ),
    'amount'
  )
  const earnedToday = sumBy(
    balanceChanges.filter(
      (change) => change.createdTime > Date.now() - DAY_MS && change.amount > 0
    ),
    'amount'
  )
  return (
    <Row className={'text-ink-600 mt-1 select-none gap-1 text-sm'}>
      {formatMoney(earnedToday)} in & {formatMoney(spentToday).replace('-', '')}{' '}
      out today
    </Row>
  )
}
