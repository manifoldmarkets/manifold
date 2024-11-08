import { DailyProfitModal } from '../home/daily-profit'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { User } from 'common/user'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Spacer } from '../layout/spacer'

export function ProfitWidget(props: { user: User }) {
  const { user } = props
  const [open, setOpen] = useState(false)

  const { data } = useAPIGetter('get-daily-changed-metrics-and-contracts', {
    limit: 22,
  })

  const contractMetrics = data?.manaMetrics ?? []
  const dailyProfit = data?.manaProfit ?? 0
  const netWorth = (data?.manaInvestmentValue ?? 0) + user.balance

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
