import { formatMoney } from 'common/util/format'
import { Row } from '../layout/row'
import { DailyProfitModal } from '../home/daily-profit'
import { useMemo, useState } from 'react'
import { Button } from '../buttons/button'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { ContractMetric } from 'common/contract-metric'
import { CPMMContract } from 'common/contract'
import { User } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { sum, minBy } from 'lodash'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { Spacer } from '../layout/spacer'

export function ProfitWidget(props: {
  user: User
  portfolio: PortfolioSnapshot | undefined
}) {
  const { user, portfolio } = props
  const [contractMetrics, setContractMetrics] = usePersistentInMemoryState<
    { metrics: ContractMetric[]; contracts: CPMMContract[] } | undefined
  >(undefined, `daily-profit-${user.id}`)
  const visibleMetrics = (contractMetrics?.metrics ?? []).filter(
    (m) => Math.floor(Math.abs(m.from?.day.profit ?? 0)) !== 0
  )

  const dailyPortfolioData = usePortfolioHistory(user.id, 'daily') ?? []
  const dayAgoPortfolio = minBy(dailyPortfolioData, 'timestamp')
  const moreChanges = visibleMetrics.length

  const [openProfitModal, setOpenProfitModal] = useState(false)

  const dailyProfitFromMetrics = Math.round(
    useMemo(() => {
      if (!contractMetrics) return 0
      return sum(contractMetrics.metrics.map((m) => m.from?.day.profit ?? 0))
    }, [contractMetrics])
  )
  const dailyProfit =
    portfolio && dayAgoPortfolio
      ? portfolio.investmentValue +
        portfolio.balance -
        portfolio.totalDeposits -
        (dayAgoPortfolio.investmentValue +
          dayAgoPortfolio.balance -
          dayAgoPortfolio.totalDeposits)
      : dailyProfitFromMetrics

  const portfolioValue = portfolio
    ? portfolio.investmentValue + portfolio.balance
    : 0
  const metricsValue = contractMetrics
    ? sum(contractMetrics.metrics.map((m) => m.payout ?? 0))
    : 0
  const netWorth =
    metricsValue !== portfolioValue &&
    metricsValue !== 0 &&
    user.createdTime > Date.now() - DAY_MS
      ? metricsValue + user.balance
      : portfolioValue

  if (!moreChanges && moreChanges < 1) {
    return <Spacer h={10} />
  }
  return (
    <>
      <Button
        color={'gray-white'}
        onClick={(e) => {
          e.stopPropagation()
          setOpenProfitModal(true)
        }}
        size="xs"
        className="gap-1 !px-1 !py-1"
      >
        See {moreChanges} changes today
      </Button>
      {openProfitModal && (
        <DailyProfitModal
          setOpen={setOpenProfitModal}
          open={openProfitModal}
          metrics={contractMetrics?.metrics}
          contracts={contractMetrics?.contracts}
          dailyProfit={dailyProfit}
          investment={netWorth}
        />
      )}
    </>
  )
}
