import { ArrowUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import { minBy, sum } from 'lodash'
import { memo, useEffect, useMemo, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { DailyLoan } from 'web/components/home/daily-loan'
import { DailyProfitModal } from 'web/components/home/daily-profit'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { withTracking } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { usePortfolioHistory } from 'web/hooks/use-portfolio-history'
import { ManaCoinNumber } from '../widgets/manaCoinNumber'
import { ManaCoin } from 'web/public/custom-components/manaCoin'

const DAILY_INVESTMENT_CLICK_EVENT = 'click daily investment button'

export const InvestmentValueCard = memo(function (props: {
  user: User
  className: string
  portfolio: PortfolioSnapshot | undefined
  refreshPortfolio: () => void
}) {
  const { user, className, portfolio, refreshPortfolio } = props
  const dailyPortfolioData = usePortfolioHistory(user.id, 'daily') ?? []
  const dayAgoPortfolio = minBy(dailyPortfolioData, 'timestamp')
  const [open, setOpen] = useState(false)

  const [contractMetrics, setContractMetrics] = usePersistentInMemoryState<
    { metrics: ContractMetric[]; contracts: CPMMContract[] } | undefined
  >(undefined, `daily-profit-${user?.id}`)

  useEffect(() => {
    getUserContractMetricsByProfitWithContracts(user.id, db, 'day').then(
      setContractMetrics
    )
  }, [setContractMetrics])

  const dailyProfitFromMetrics = Math.round(
    useMemo(() => {
      if (!contractMetrics) return 0
      return sum(contractMetrics.metrics.map((m) => m.from?.day.profit ?? 0))
    }, [contractMetrics])
  )
  const dailyProfit =
    portfolio && dayAgoPortfolio
      ? portfolio.investmentValue +
        portfolio.balance +
        portfolio.spiceBalance -
        portfolio.totalDeposits -
        (dayAgoPortfolio.investmentValue +
          dayAgoPortfolio.balance +
          dayAgoPortfolio.spiceBalance -
          dayAgoPortfolio.totalDeposits)
      : dailyProfitFromMetrics

  const portfolioValue = portfolio
    ? portfolio.investmentValue + portfolio.balance + portfolio.spiceBalance
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
  const visibleMetrics = (contractMetrics?.metrics ?? []).filter(
    (m) => Math.floor(Math.abs(m.from?.day.profit ?? 0)) !== 0
  )
  const moreChanges = visibleMetrics.length

  return (
    <Row
      className={clsx(className, 'relative')}
      onClick={withTracking(() => {
        setOpen(true)
      }, DAILY_INVESTMENT_CLICK_EVENT)}
    >
      <Col className={'w-full gap-1.5'}>
        <Col>
          <div className={'text-ink-800 text-2xl sm:text-4xl'}>
            {portfolio ? (
              <ManaCoinNumber amount={netWorth} />
            ) : (
              <Row className="items-center">
                <ManaCoin />
                ----
              </Row>
            )}
          </div>
          <div className={'text-ink-800 ml-1'}>Your net worth</div>
        </Col>
        {netWorth !== 0 && (
          <Row className="justify-between">
            <Row
              className={clsx(
                'mb-1 items-center',
                dailyProfit >= 0 ? 'text-teal-600' : 'text-ink-600'
              )}
            >
              {dailyProfit > 0 ? (
                <ArrowUpIcon className={'h-4 w-4'} />
              ) : dailyProfit < 0 ? (
                <ArrowUpIcon className={'h-4 w-4 rotate-180 transform'} />
              ) : null}
              {formatMoney(dailyProfit)} profit today
            </Row>
            <Button
              color={'gray-white'}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(true)
              }}
            >
              See {moreChanges} changes
            </Button>
          </Row>
        )}
        <Col className={'absolute right-1 top-1 gap-1'}>
          <DailyLoan user={user} refreshPortfolio={refreshPortfolio} />
          {portfolio && portfolio.loanTotal > 0 && (
            <div className="text-ink-600 text-sm">
              {formatMoney(portfolio.loanTotal)} loaned
            </div>
          )}
        </Col>

        {open && (
          <DailyProfitModal
            setOpen={setOpen}
            open={open}
            metrics={contractMetrics?.metrics}
            contracts={contractMetrics?.contracts}
            dailyProfit={dailyProfit}
            investment={netWorth}
          />
        )}
      </Col>
    </Row>
  )
})
