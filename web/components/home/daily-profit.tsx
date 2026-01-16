import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/solid'
import { TrendingUpIcon } from '@heroicons/react/outline'
import { User } from 'common/user'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { ContractMetric } from 'common/contract-metric'
import { ContractToken, CPMMContract, MarketContract } from 'common/contract'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { keyBy, partition, sortBy } from 'lodash'
import { ContractMention } from 'web/components/contract/contract-mention'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { Pagination } from 'web/components/widgets/pagination'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { TRADE_TERM } from 'common/envs/constants'
import { api } from 'web/lib/api/api'
import { APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { TokenNumber } from '../widgets/token-number'
import { floatingEqual } from 'common/util/math'

const DAILY_PROFIT_CLICK_EVENT = 'click daily profit button'

export const DailyProfit = function DailyProfit(props: {
  user: User | null | undefined
  isCurrentUser?: boolean
}) {
  const { user } = props
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
  }, [user?.balance])

  const manaProfit = data?.manaProfit ?? 0
  const manaInvestmentValue = data?.manaInvestmentValue ?? 0
  const manaNetWorth = manaInvestmentValue + (data?.balance ?? 0)

  const [openMana, setOpenMana] = useState(false)
  useEffect(() => {
    if (openMana && !data && user) {
      api('get-daily-changed-metrics-and-contracts', {
        limit: 24,
        userId: user.id,
        balance: Math.floor(user.balance),
      }).then(setData)
    }
  }, [user?.id, openMana])

  return (
    <>
      <button
        onClick={withTracking(() => {
          setOpenMana(true)
        }, DAILY_PROFIT_CLICK_EVENT)}
        className={dailyStatsClass}
      >
        <Row>
          <TokenNumber
            amount={data ? manaNetWorth : undefined}
            numberType="short"
            isInline
          />
          {!floatingEqual(manaProfit, 0) && (
            <span
              className={clsx(
                'ml-1 mt-1 text-xs',
                manaProfit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
              )}
            >
              {manaProfit >= 0 ? '+' : '-'}
              {shortFormatNumber(Math.abs(manaProfit))}
            </span>
          )}
        </Row>
        <div className="text-ink-600 text-center text-xs ">Net worth</div>
      </button>

      <DailyProfitModal
        setOpen={setOpenMana}
        open={openMana}
        metrics={data?.manaMetrics}
        contracts={data?.contracts}
        dailyProfit={manaProfit}
        netWorth={manaNetWorth}
        token="MANA"
      />
    </>
  )
}

export function DailyProfitModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  metrics?: ContractMetric[]
  contracts?: MarketContract[]
  dailyProfit: number
  netWorth: number
  token: ContractToken
}) {
  const { open, setOpen, metrics, contracts, dailyProfit, netWorth, token } =
    props

  const profitPercent =
    netWorth !== 0
      ? ((dailyProfit / (netWorth - dailyProfit)) * 100).toFixed(2)
      : '0'

  return (
    <Modal open={open} setOpen={setOpen} className={MODAL_CLASS} size={'lg'}>
      <Col className="gap-0">
        {/* Header Section */}
        <div className="border-ink-200 -mx-4 -mt-2 mb-4 border-b px-4 pb-5 sm:-mx-8 sm:px-8">
          <Row className="items-end justify-between gap-6">
            {/* Net Worth */}
            <Col className="gap-1">
              <span className="text-ink-500 text-xs font-medium uppercase tracking-wider">
                Net Worth
              </span>
              <span className="text-ink-1000 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
                {formatMoney(netWorth, token)}
              </span>
            </Col>

            {/* Daily Profit */}
            <Col className="items-end gap-1">
              <span className="text-ink-500 text-xs font-medium uppercase tracking-wider">
                Today
              </span>
              <Row className="items-center gap-2">
                <div
                  className={clsx(
                    'flex items-center gap-1 rounded-full px-2.5 py-1',
                    dailyProfit >= 0
                      ? 'bg-teal-500/10 text-teal-600'
                      : 'bg-scarlet-500/10 text-scarlet-600'
                  )}
                >
                  {dailyProfit >= 0 ? (
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  )}
                  <span className="text-lg font-semibold tabular-nums">
                    {formatMoney(Math.abs(dailyProfit), token)}
                  </span>
                </div>
                {parseFloat(profitPercent) !== 0 && (
                  <span
                    className={clsx(
                      'text-sm tabular-nums',
                      dailyProfit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                    )}
                  >
                    {dailyProfit >= 0 ? '+' : ''}
                    {profitPercent}%
                  </span>
                )}
              </Row>
            </Col>
          </Row>
        </div>

        {/* Content Section */}
        {!metrics || !contracts ? (
          <LoadingProfitRows />
        ) : (
          <ProfitChangeTable
            contracts={contracts}
            metrics={metrics}
            from={'day'}
            rowsPerSection={5}
            showPagination={true}
            token={token}
          />
        )}
      </Col>
    </Modal>
  )
}

function LoadingProfitRows() {
  return (
    <Col className="w-full gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <LoadingProfitRow key={i} delay={i * 75} />
      ))}
    </Col>
  )
}

function LoadingProfitRow({ delay }: { delay: number }) {
  return (
    <div
      className="animate-pulse rounded-lg p-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Row className="items-center justify-between gap-4">
        <div className="flex-1">
          <div className="bg-ink-200 h-4 w-3/4 rounded" />
        </div>
        <div className="bg-ink-200 h-4 w-16 rounded" />
      </Row>
    </div>
  )
}

export function ProfitChangeTable(props: {
  contracts: MarketContract[]
  metrics: ContractMetric[]
  from: 'day' | 'week' | 'month'
  rowsPerSection: number
  showPagination: boolean
  token: ContractToken
}) {
  const { metrics, from, rowsPerSection, showPagination, token } = props
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
      <Col className="items-center justify-center py-12">
        <div className="bg-ink-100 mb-4 rounded-full p-4">
          <TrendingUpIcon className="text-ink-400 h-8 w-8" />
        </div>
        <p className="text-ink-600 text-center font-medium">
          No profit changes yet
        </p>
        <p className="text-ink-500 mt-1 text-center text-sm">
          Make some {TRADE_TERM}s and check back later
        </p>
      </Col>
    )

  return (
    <Col className="flex-1 gap-1">
      {/* Section Headers */}
      <Row className="text-ink-500 mb-1 justify-between px-1 text-xs font-medium uppercase tracking-wider">
        <span>Position</span>
        <span>Profit</span>
      </Row>

      {/* Positions List */}
      <Col className="gap-1">
        {rows.map(([contract, profit], index) => (
          <ProfitRow
            key={contract.id}
            contract={contract}
            profit={profit}
            token={token}
            from={from}
            index={index}
          />
        ))}
      </Col>

      {/* Pagination */}
      {showPagination && (
        <div className="mt-2">
          <Pagination
            page={page}
            pageSize={rowsPerSection * 2}
            totalItems={contracts.length}
            setPage={setPage}
          />
        </div>
      )}
    </Col>
  )
}

function ProfitRow(props: {
  contract: CPMMContract
  profit: number
  token: ContractToken
  from: 'day' | 'week' | 'month'
  index: number
}) {
  const { contract, profit, token, from, index } = props
  const isPositive = profit > 0

  let change: undefined | string
  if (contract.probChanges?.[from]) {
    const probChange = contract.probChanges[from]
    change =
      (probChange > 0 ? '+' : '') +
      getFormattedMappedValue(contract, probChange).replace('%', '')
  }

  return (
    <div
      className={clsx(
        'group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors',
        'hover:bg-ink-100'
      )}
      style={{
        animation: `fade-in 0.3s ease-out ${index * 50}ms both`,
      }}
    >
      {/* Contract Info */}
      <div className="min-w-0 flex-1">
        <ContractMention
          contract={contract}
          probChange={change}
          className="!inline"
          textClassName="!text-sm"
        />
      </div>

      {/* Profit Badge */}
      <div
        className={clsx(
          'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold tabular-nums transition-colors',
          isPositive
            ? 'group-hover:bg-teal-500/15 bg-teal-500/10 text-teal-600'
            : 'bg-scarlet-500/10 text-scarlet-600 group-hover:bg-scarlet-500/15'
        )}
      >
        {isPositive ? (
          <ArrowUpIcon className="h-3 w-3" />
        ) : (
          <ArrowDownIcon className="h-3 w-3" />
        )}
        {formatMoney(profit, token)}
      </div>
    </div>
  )
}
