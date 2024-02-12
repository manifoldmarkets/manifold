import { memo, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { ContractMetric } from 'common/contract-metric'
import { Contract, contractPath, CPMMContract } from 'common/contract'
import { orderBy, sum } from 'lodash'
import clsx from 'clsx'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { formatMoney, getMoneyNumber } from 'common/util/format'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { DailyProfitModal } from 'web/components/home/daily-profit'
import { ArrowUpIcon } from '@heroicons/react/solid'
import { DailyLoan } from 'web/components/home/daily-loan'
import { DAY_MS } from 'common/util/time'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { ChangeIcon } from 'web/components/portfolio/balance-card'
import { Button } from 'web/components/buttons/button'
const DAILY_INVESTMENT_CLICK_EVENT = 'click daily investment button'
export const InvestmentValueCard = memo(function (props: {
  user: User
  className: string
}) {
  const { user, className } = props

  const portfolio = useCurrentPortfolio(user.id)

  const [open, setOpen] = useState(false)

  const [contractMetrics, setContractMetrics] = usePersistentInMemoryState<
    { metrics: ContractMetric[]; contracts: CPMMContract[] } | undefined
  >(undefined, `daily-profit-${user?.id}`)

  useEffect(() => {
    getUserContractMetricsByProfitWithContracts(user.id, db, 'day').then(
      setContractMetrics
    )
  }, [setContractMetrics])

  const dailyProfit = Math.round(
    useMemo(() => {
      if (!contractMetrics) return 0
      return sum(contractMetrics.metrics.map((m) => m.from?.day.profit ?? 0))
    }, [contractMetrics])
  )

  // If a user is new and we haven't calculated their portfolio value recently enough, show the metrics value instead
  const portfolioValue = portfolio
    ? portfolio.investmentValue + portfolio.loanTotal
    : 0
  const metricsValue = contractMetrics
    ? sum(contractMetrics.metrics.map((m) => m.payout ?? 0))
    : 0
  const investment =
    metricsValue !== portfolioValue &&
    metricsValue !== 0 &&
    user.createdTime > Date.now() - DAY_MS
      ? metricsValue
      : portfolioValue
  const visibleMetrics = (contractMetrics?.metrics ?? []).filter(
    (m) => Math.floor(Math.abs(m.from?.day.profit ?? 0)) !== 0
  )
  const previewMetrics = orderBy(
    visibleMetrics,
    (c) => Math.abs(c.from?.day.profit ?? 0),
    'desc'
  ).slice(0, 3)
  const moreChanges = Math.max(visibleMetrics.length - previewMetrics.length, 0)

  return (
    <Row
      className={clsx(className, 'relative')}
      onClick={withTracking(() => {
        setOpen(true)
      }, DAILY_INVESTMENT_CLICK_EVENT)}
    >
      <Col className={'gap-1.5'}>
        <span className={'text-ink-800 ml-1'}>Your investments</span>
        <span className={'text-ink-800 mb-1 text-5xl'}>
          {formatMoney(investment)}
        </span>
        {investment !== 0 && (
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
            {formatMoney(dailyProfit)} today
          </Row>
        )}
        <div className={'absolute right-4 top-3'}>
          <DailyLoan user={user} />
        </div>
        {visibleMetrics.length > 0 && (
          <Col className={' border-ink-300 gap-4 border-t-2 pt-3'}>
            {contractMetrics &&
              previewMetrics.map((change) => (
                <MetricChangeRow
                  key={change.contractId}
                  change={change}
                  contract={
                    contractMetrics.contracts.find(
                      (c) => c.id === change.contractId
                    )!
                  }
                  avatarSize={'sm'}
                />
              ))}
            {moreChanges > 0 && (
              <Row className={'justify-end'}>
                <Button
                  color={'gray-white'}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(true)
                  }}
                >
                  See {moreChanges} more changes
                </Button>
              </Row>
            )}
          </Col>
        )}

        {open && (
          <DailyProfitModal
            setOpen={setOpen}
            open={open}
            metrics={contractMetrics?.metrics}
            contracts={contractMetrics?.contracts}
            dailyProfit={dailyProfit}
            investment={investment}
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
          slug={contract.slug}
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
            className={clsx('line-clamp-1', linkClass)}
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
