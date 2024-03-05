import { memo, useEffect, useMemo, useState } from 'react'
import { last, minBy, sum } from 'lodash'
import clsx from 'clsx'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'
import Link from 'next/link'
import { ArrowUpIcon } from '@heroicons/react/solid'

import { User } from 'common/user'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { ContractMetric } from 'common/contract-metric'
import { Contract, contractPath, CPMMContract } from 'common/contract'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { formatMoney, getMoneyNumber } from 'common/util/format'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { DailyProfitModal } from 'web/components/home/daily-profit'
import { DailyLoan } from 'web/components/home/daily-loan'
import { DAY_MS } from 'common/util/time'
import { linkClass } from 'web/components/widgets/site-link'
import { ChangeIcon } from 'web/components/portfolio/balance-card'
import { Button } from 'web/components/buttons/button'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { getCutoff } from 'web/lib/util/time'

const DAILY_INVESTMENT_CLICK_EVENT = 'click daily investment button'

export const InvestmentValueCard = memo(function (props: {
  user: User
  className: string
  weeklyPortfolioData: PortfolioSnapshot[]
}) {
  const { user, className, weeklyPortfolioData } = props
  const latestPortfolio = last(weeklyPortfolioData)
  const dayAgoPortfolio = minBy(
    weeklyPortfolioData.filter((p) => p.timestamp >= getCutoff('daily')),
    'timestamp'
  )
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
    latestPortfolio && dayAgoPortfolio
      ? latestPortfolio.investmentValue +
        latestPortfolio.balance -
        latestPortfolio.totalDeposits -
        (dayAgoPortfolio.investmentValue +
          dayAgoPortfolio.balance -
          dayAgoPortfolio.totalDeposits)
      : dailyProfitFromMetrics

  // If a user is new, then their portfolio value may be out of date, so show the metrics value instead
  const portfolioValue = latestPortfolio ? latestPortfolio.investmentValue : 0
  const metricsValue = contractMetrics
    ? sum(contractMetrics.metrics.map((m) => m.payout ?? 0))
    : 0
  const netWorth =
    metricsValue !== portfolioValue &&
    metricsValue !== 0 &&
    user.createdTime > Date.now() - DAY_MS
      ? metricsValue + user.balance
      : portfolioValue + user.balance
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
            {formatMoney(netWorth)}
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
        <div className={'absolute right-1 top-1'}>
          <DailyLoan user={user} />
        </div>

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

const MetricChangeRow = (props: {
  change: ContractMetric
  contract: Contract
  avatarSize: 'sm' | 'md'
}) => {
  const { change, avatarSize, contract } = props
  const dayProfit = change.from?.day.profit ?? 0
  const direction = dayProfit > 0 ? 'up' : 'down'
  if (getMoneyNumber(dayProfit) === 0) return null
  return (
    <Row className={'gap-2'}>
      <Col>
        <ChangeIcon
          avatarSize={avatarSize}
          slug={contractPath(contract)}
          symbol={
            <div>
              {direction === 'up' ? (
                <FaArrowTrendUp className={'h-5 w-5 '} />
              ) : (
                <FaArrowTrendDown className={'h-5 w-5'} />
              )}
            </div>
          }
          className={
            direction === 'up'
              ? 'bg-teal-500'
              : direction === 'down'
              ? 'bg-ink-400'
              : 'bg-blue-400'
          }
        />
      </Col>
      <Col className={'w-full'}>
        <Row className={'justify-between'}>
          <Link
            href={contractPath(contract)}
            className={clsx('line-clamp-2', linkClass)}
          >
            {contract.question}
          </Link>
          <span
            className={clsx(
              'inline-flex whitespace-nowrap',
              dayProfit > 0 ? 'text-teal-700' : 'text-ink-600'
            )}
          >
            {dayProfit > 0 ? '+' : ''}
            {formatMoney(dayProfit)}
          </span>
        </Row>
      </Col>
    </Row>
  )
}
