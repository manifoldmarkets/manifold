import { AnyBalanceChangeType } from 'common/balance-change'
import { DAY_MS } from 'common/util/time'
import { sumBy } from 'lodash'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { Button } from '../buttons/button'
import { CoinNumber } from '../widgets/manaCoinNumber'

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
      size="xs"
      className="gap-1 !px-1 !py-1"
    >
      <CoinNumber amount={earnedToday} />
      in and
      <CoinNumber amount={spentToday} />
      out today
    </Button>
  )
}
