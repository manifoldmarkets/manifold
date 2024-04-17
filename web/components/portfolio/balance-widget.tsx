import { formatMoney } from 'common/util/format'
import { Row } from '../layout/row'
import { sumBy } from 'lodash'
import { AnyBalanceChangeType } from 'common/balance-change'
import { DAY_MS } from 'common/util/time'
import { ManaCoinNumber } from '../widgets/manaCoinNumber'
import { Button } from '../buttons/button'
import { useRouter } from 'next/router'
import { usePathname } from 'next/navigation'

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

  const balanceChangesKey = 'balance-changes'
  const router = useRouter()
  const pathName = usePathname()
  return (
    <Button
      color={'gray-white'}
      onClick={(e) => {
        e.stopPropagation()
        router.replace(pathName + '?tab=' + balanceChangesKey, undefined, {
          shallow: true,
        })
      }}
      className="gap-1"
    >
      <ManaCoinNumber amount={earnedToday} />
      in and
      <ManaCoinNumber amount={spentToday} />
      out today
    </Button>
    // </Row>
  )
}
