import { memo, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { ContractMetric } from 'common/contract-metric'
import { CPMMContract } from 'common/contract'
import { sum } from 'lodash'
import clsx from 'clsx'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { formatMoney } from 'common/util/format'
import { ArrowUpIcon } from '@heroicons/react/solid'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { DailyProfitModal } from 'web/components/home/daily-profit'
const DAILY_INVESTMENT_CLICK_EVENT = 'click daily investment button'
export const InvestmentValueCard = memo(function (props: {
  user: User
  isCurrentUser?: boolean
}) {
  const { user } = props

  const portfolio = useCurrentPortfolio(user.id)
  const investment = portfolio
    ? portfolio.investmentValue + (portfolio.loanTotal ?? 0)
    : 0

  const [open, setOpen] = useState(false)

  const [data, setData] = usePersistentInMemoryState<
    { metrics: ContractMetric[]; contracts: CPMMContract[] } | undefined
  >(undefined, `daily-profit-${user?.id}`)

  useEffect(() => {
    getUserContractMetricsByProfitWithContracts(user.id, db, 'day').then(
      setData
    )
  }, [setData])

  const dailyProfit = Math.round(
    useMemo(() => {
      if (!data) return 0
      return sum(data.metrics.map((m) => m.from?.day.profit ?? 0))
    }, [data])
  )

  return (
    <>
      <Col>
        <span className={'text-5xl'}>{formatMoney(investment)}</span>

        <Row>
          <button
            onClick={withTracking(() => {
              setOpen(true)
            }, DAILY_INVESTMENT_CLICK_EVENT)}
          >
            <Row
              className={clsx(
                'items-center',
                dailyProfit >= 0 ? 'text-teal-600' : 'text-ink-600'
              )}
            >
              {dailyProfit > 0 ? (
                <ArrowUpIcon className={'h-4 w-4'} />
              ) : (
                <ArrowUpIcon className={'h-4 w-4 rotate-180 transform'} />
              )}
              {formatMoney(dailyProfit)} today
            </Row>
          </button>
        </Row>
      </Col>

      {open && (
        <DailyProfitModal
          setOpen={setOpen}
          open={open}
          metrics={data?.metrics}
          contracts={data?.contracts}
          dailyProfit={dailyProfit}
          investment={investment}
        />
      )}
    </>
  )
})
