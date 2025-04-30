import { DailyProfitModal } from '../home/daily-profit'
import { useEffect, useState } from 'react'
import { Button } from '../buttons/button'
import { User } from 'common/user'
import { Spacer } from '../layout/spacer'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { api } from 'web/lib/api/api'
import { APIResponse } from 'common/api/schema'

export function ProfitWidget(props: { user: User | null | undefined }) {
  const { user } = props
  const [open, setOpen] = useState(false)
  const [data, setData] = usePersistentInMemoryState<
    APIResponse<'get-daily-changed-metrics-and-contracts'> | undefined
  >(undefined, 'daily-profit-' + user?.id)

  useEffect(() => {
    if (!user) return
    api('get-daily-changed-metrics-and-contracts', {
      limit: 24,
      userId: user.id,
      balance: Math.floor(user.balance),
    }).then(setData)
  }, [user?.id])

  const contractMetrics = data?.manaMetrics ?? []
  const dailyProfit = data?.manaProfit ?? 0
  const netWorth = (data?.manaInvestmentValue ?? 0) + (user?.balance ?? 0)

  const visibleMetrics = contractMetrics.filter(
    (m) => Math.floor(Math.abs(m.from?.day.profit ?? 0)) !== 0
  )
  const moreChanges = visibleMetrics.length

  if (moreChanges < 1) {
    return <Spacer h={10} />
  }
  return (
    <>
      <Button
        color={'gray-white'}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        size="xs"
        className="gap-1 !px-1 !py-1"
      >
        See {moreChanges} changes today
      </Button>
      {open && (
        <DailyProfitModal
          setOpen={setOpen}
          open={open}
          metrics={data?.manaMetrics}
          contracts={data?.contracts}
          dailyProfit={dailyProfit}
          netWorth={netWorth}
          token="MANA"
        />
      )}
    </>
  )
}
