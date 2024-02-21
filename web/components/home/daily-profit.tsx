import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import clsx from 'clsx'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { ContractMetric } from 'common/contract-metric'
import { CPMMContract } from 'common/contract'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { keyBy, partition, sortBy, sum } from 'lodash'
import { ContractMention } from 'web/components/contract/contract-mention'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { Pagination } from 'web/components/widgets/pagination'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { db } from 'web/lib/supabase/db'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { Table } from '../widgets/table'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { ArrowUpIcon } from '@heroicons/react/solid'
const DAILY_PROFIT_CLICK_EVENT = 'click daily profit button'

export const DailyProfit = memo(function DailyProfit(props: {
  user: User | null | undefined
  isCurrentUser?: boolean
}) {
  const { user } = props

  const portfolio = useCurrentPortfolio(user?.id)
  const investment = portfolio
    ? portfolio.investmentValue + (user?.balance ?? 0)
    : 0

  const [open, setOpen] = useState(false)

  const refreshContractMetrics = useCallback(async () => {
    if (user)
      return getUserContractMetricsByProfitWithContracts(user.id, db, 'day')
  }, [user])

  const [data, setData] = usePersistentLocalState<
    { metrics: ContractMetric[]; contracts: CPMMContract[] } | undefined
  >(undefined, `daily-profit-${user?.id}`)

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
            <div className="text-ink-600 text-xs ">Net worth</div>
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

export function DailyProfitModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  metrics?: ContractMetric[]
  contracts?: CPMMContract[]
  dailyProfit: number
  investment: number
}) {
  const { open, setOpen, metrics, contracts, dailyProfit, investment } = props

  return (
    <Modal open={open} setOpen={setOpen} className={MODAL_CLASS} size={'lg'}>
      <Row className={'mx-2 justify-between'}>
        <Col>
          <span className={'ml-1'}>Your net worth</span>
          <span className={'mb-1 text-2xl'}>{formatMoney(investment)}</span>
        </Col>
        <Col>
          <span className={'ml-1'}>Profit today</span>
          <span
            className={clsx(
              'mb-1 inline-flex items-center text-2xl',
              dailyProfit >= 0 ? 'text-teal-600' : 'text-ink-600'
            )}
          >
            {dailyProfit > 0 ? (
              <ArrowUpIcon className={'mr-1 h-4 w-4'} />
            ) : (
              <ArrowUpIcon className={'mr-1 h-4 w-4 rotate-180 transform'} />
            )}
            {formatMoney(dailyProfit)}
          </span>
        </Col>
      </Row>

      {!metrics || !contracts ? (
        <LoadingIndicator />
      ) : (
        <ProfitChangeTable
          contracts={contracts}
          metrics={metrics}
          from={'day'}
          rowsPerSection={5}
          showPagination={true}
        />
      )}
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
  let change: undefined | string
  if (c.probChanges?.[props.from]) {
    const probChange = c.probChanges[props.from]
    change =
      (probChange > 0 ? '+' : '') +
      getFormattedMappedValue(c, probChange).replace('%', '')
  }

  return (
    <td>
      <ContractMention
        contract={c}
        probChange={change}
        className={'line-clamp-6 !whitespace-normal sm:line-clamp-4'}
      />
    </td>
  )
}

const ProfitCell = (props: { profit: number }) => (
  <td
    className={clsx(
      'mx-2 min-w-[2rem] text-right',
      props.profit > 0 ? 'text-teal-600' : 'text-ink-600'
    )}
  >
    {formatMoney(props.profit)}
  </td>
)
