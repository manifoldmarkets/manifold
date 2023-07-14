import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { HOUR_MS } from 'common/util/time'
import clsx from 'clsx'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { ContractMetric } from 'common/contract-metric'
import { CPMMContract } from 'common/contract'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { keyBy, partition, sortBy, sum } from 'lodash'
import { ContractMention } from 'web/components/contract/contract-mention'
import { dailyStatsClass } from 'web/components/daily-stats'
import { Pagination } from 'web/components/widgets/pagination'
import {
  storageStore,
  usePersistentRevalidatedState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { LoadingIndicator } from './widgets/loading-indicator'
import { db } from 'web/lib/supabase/db'
import { InfoTooltip } from './widgets/info-tooltip'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { Table } from './widgets/table'
const DAILY_PROFIT_CLICK_EVENT = 'click daily profit button'

export const DailyProfit = memo(function DailyProfit(props: {
  user: User | null | undefined
  isCurrentUser?: boolean
}) {
  const { user } = props

  const portfolio = useCurrentPortfolio(user?.id)
  const investment = portfolio
    ? portfolio.investmentValue + (portfolio.loanTotal ?? 0)
    : 0

  const [open, setOpen] = useState(false)

  const refreshContractMetrics = useCallback(async () => {
    if (user)
      return getUserContractMetricsByProfitWithContracts(user.id, db, 'day')
  }, [user])

  const [data, setData] = usePersistentRevalidatedState<
    { metrics: ContractMetric[]; contracts: CPMMContract[] } | undefined
  >(
    undefined,
    {
      key: `daily-profit-${user?.id}`,
      store: storageStore(safeLocalStorage),
    },
    {
      every: HOUR_MS,
      callback: refreshContractMetrics,
    }
  )
  useEffect(() => {
    if (open) refreshContractMetrics().then(setData)
  }, [open, refreshContractMetrics, setData])

  const dailyProfit = Math.round(
    useMemo(() => {
      if (!data) return 0
      return sum(data.metrics.map((m) => m.from?.day.profit ?? 0))
    }, [data])
  )

  if (!user) return <div />

  return (
    <>
      <button
        className={clsx(dailyStatsClass)}
        onClick={withTracking(() => {
          setOpen(true)
        }, DAILY_PROFIT_CLICK_EVENT)}
      >
        <Row>
          <Col className="items-start">
            <div>{formatMoney(investment)}</div>
            <div className="text-ink-600 text-xs ">Invested</div>
          </Col>

          {dailyProfit !== 0 && (
            <span
              className={clsx(
                'ml-1 mt-1 text-xs',
                dailyProfit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
              )}
            >
              {dailyProfit >= 0 ? '+' : '-'}
              {shortFormatNumber(Math.abs(dailyProfit))}
            </span>
          )}
        </Row>
      </button>
      {user && (
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

function DailyProfitModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  metrics?: ContractMetric[]
  contracts?: CPMMContract[]
  dailyProfit: number
  investment: number
}) {
  const { open, setOpen, metrics, contracts, dailyProfit, investment } = props

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <div className="bg-canvas-0 text-ink-1000 rounded-lg p-4">
        <Col className={'mb-4'}>
          <Row className="gap-2 text-2xl">
            <Col className="gap-2">
              <div>Invested</div>
              <div>Daily profit</div>
            </Col>
            <Col className="text-ink-600 items-end gap-2">
              <div>{formatMoney(investment)}</div>
              <div
                className={clsx(
                  dailyProfit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                )}
              >
                {formatMoney(dailyProfit)}
              </div>
            </Col>
          </Row>

          <div className="text-ink-500 mt-4 text-sm">
            Change in profit over the last 24 hours.{' '}
            <InfoTooltip
              text="I.e. the change in the value of your
            shares in Yes/No questions. (Updates every 30 min)"
            />
          </div>
        </Col>

        {!metrics || !contracts ? (
          <LoadingIndicator />
        ) : (
          <ProfitChangeTable
            contracts={contracts}
            metrics={metrics}
            from={'day'}
            rowsPerSection={4}
            showPagination={true}
          />
        )}
      </div>
    </Modal>
  )
}

export function ProfitChangeTable(props: {
  contracts: CPMMContract[]
  metrics: ContractMetric[]
  from: 'day' | 'week' | 'month'
  rowsPerSection: number
  showPagination: boolean
}) {
  const { metrics, from, rowsPerSection, showPagination } = props
  const [page, setPage] = useState(0)
  const currentSlice = page * rowsPerSection

  const metricsByContractId = keyBy(metrics, (m) => m.contractId)
  const [nonZeroProfitMetrics, _] = partition(
    metrics,
    (m) => Math.floor(Math.abs(m.from?.[from].profit ?? 0)) !== 0
  )
  const contracts = props.contracts.filter((c) =>
    nonZeroProfitMetrics.some((m) => m.contractId === c.id)
  )
  const [positive, negative] = partition(
    contracts,
    (c) => (metricsByContractId[c.id].from?.[from].profit ?? 0) > 0
  )
  const rows = [
    ...sortBy(
      positive,
      (c) => -(metricsByContractId[c.id].from?.[from].profit ?? 0)
    )
      .map((c) => [c, metricsByContractId[c.id].from?.[from].profit ?? 0])
      .slice(currentSlice, currentSlice + rowsPerSection),
    ...sortBy(
      negative,
      (c) => metricsByContractId[c.id].from?.[from].profit ?? 0
    )
      .map((c) => [c, metricsByContractId[c.id].from?.[from].profit ?? 0])
      .slice(currentSlice, currentSlice + rowsPerSection),
  ] as [CPMMContract, number][]

  if (positive.length === 0 && negative.length === 0)
    return (
      <div className="text-ink-500 px-4">
        No profit changes found. Return later after making a few bets.
      </div>
    )

  return (
    <Col className="mb-4 flex-1 gap-4">
      <Table>
        <thead>
          <tr>
            <th>Question</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([contract, profit]) => (
            <tr key={contract.id + 'mention'}>
              <MarketCell contract={contract} from={from} />
              <ProfitCell profit={profit} />
            </tr>
          ))}
        </tbody>
      </Table>
      {showPagination && (
        <Pagination
          page={page}
          itemsPerPage={rowsPerSection * 2}
          totalItems={contracts.length}
          setPage={setPage}
        />
      )}
    </Col>
  )
}

const MarketCell = (props: {
  contract: CPMMContract
  from: 'day' | 'week' | 'month'
}) => {
  const c = props.contract
  const probChange = c.probChanges[props.from]
  const change =
    (probChange > 0 ? '+' : '') +
    getFormattedMappedValue(c, probChange).replace('%', '')

  return (
    <td>
      <ContractMention
        contract={c}
        probChange={change}
        className={'line-clamp-6 sm:line-clamp-4 !whitespace-normal'}
      />
    </td>
  )
}

const ProfitCell = (props: { profit: number }) => (
  <td
    className={clsx(
      'mx-2 min-w-[2rem] text-right',
      props.profit > 0 ? 'text-teal-500' : 'text-scarlet-600'
    )}
  >
    {formatMoney(props.profit)}
  </td>
)
