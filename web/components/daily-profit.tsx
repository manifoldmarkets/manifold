import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { getUserEvents } from 'web/lib/supabase/user-events'
import clsx from 'clsx'
import { withTracking } from 'web/lib/service/analytics'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Row } from 'web/components/layout/row'
import { formatMoney, formatPercent } from 'common/util/format'
import { ContractMetrics } from 'common/calculate-metrics'
import { CPMMBinaryContract } from 'common/contract'
import { getUserContractMetricsByProfit } from 'web/lib/supabase/contract-metrics'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { keyBy, partition, sortBy, sum } from 'lodash'
import { _ as r, Grid } from 'gridjs-react'
import { ContractMention } from 'web/components/contract/contract-mention'
import { dailyStatsClass } from 'web/components/daily-stats'
import { Pagination } from 'web/components/widgets/pagination'
import {
  storageStore,
  usePersistentRevalidatedState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { LoadingIndicator } from './widgets/loading-indicator'
const DAILY_PROFIT_CLICK_EVENT = 'click daily profit button'

export const DailyProfit = memo(function DailyProfit(props: {
  user: User | null | undefined
}) {
  const { user } = props
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(true)

  const refreshContractMetrics = useCallback(async () => {
    if (user) return getUserContractMetricsByProfit(user.id)
  }, [user])

  const [data] = usePersistentRevalidatedState<
    { metrics: ContractMetrics[]; contracts: CPMMBinaryContract[] } | undefined
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

  const dailyProfit = useMemo(() => {
    if (!data) return 0
    return sum(data.metrics.map((m) => m.from?.day.profit ?? 0))
  }, [data])

  useEffect(() => {
    if (!user) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const todayMsEnd = todayMs + DAY_MS
    getUserEvents(user.id, DAILY_PROFIT_CLICK_EVENT, todayMs, todayMsEnd).then(
      (events) => setSeen(events.length > 0)
    )
  }, [user])

  // Other emoji options: ⌛ 💰 🕛
  return (
    <>
      <button
        className={clsx(
          'rounded-md py-1 text-center transition-colors disabled:cursor-not-allowed',
          !seen
            ? 'from-amber-400 via-yellow-200 to-amber-400 px-1.5 text-yellow-600 transition-all hover:from-yellow-400 hover:via-yellow-100 hover:to-yellow-400 enabled:bg-gradient-to-tr'
            : ''
        )}
        onClick={withTracking(() => {
          setOpen(true)
          setSeen(true)
        }, DAILY_PROFIT_CLICK_EVENT)}
      >
        <Tooltip text={'Daily profit'}>
          <Row
            className={clsx(
              dailyStatsClass,
              dailyProfit > 0 && seen && 'text-teal-500'
            )}
          >
            <span>💰{formatMoney(dailyProfit)}</span>
          </Row>
        </Tooltip>
      </button>
      {user && (
        <DailyProfitModal
          setOpen={setOpen}
          open={open}
          metrics={data?.metrics}
          contracts={data?.contracts}
        />
      )}
    </>
  )
})

function DailyProfitModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  metrics?: ContractMetrics[]
  contracts?: CPMMBinaryContract[]
}) {
  const { open, setOpen, metrics, contracts } = props

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <div className="rounded-lg bg-white p-4">
        <Col className={'mb-4'}>
          <Title className={'mb-1'}>Daily profit</Title>
          <span className="text-sm text-gray-500">
            Change in the value of your Yes/No positions over the last 24 hours.
            (Updates every 30 min)
          </span>
        </Col>
        {!metrics || !contracts ? (
          <LoadingIndicator />
        ) : (
          <ProfitChangeTable contracts={contracts} metrics={metrics} />
        )}
      </div>
    </Modal>
  )
}

function ProfitChangeTable(props: {
  contracts: CPMMBinaryContract[]
  metrics: ContractMetrics[]
}) {
  const { metrics } = props
  const rowsPerSection = 5
  const [page, setPage] = useState(0)
  const currentSlice = page * rowsPerSection

  const metricsByContractId = keyBy(metrics, (m) => m.contractId)
  const [nonZeroProfitMetrics, _] = partition(
    metrics,
    (m) => Math.floor(Math.abs(m.from?.day.profit ?? 0)) !== 0
  )
  const contracts = props.contracts.filter((c) =>
    nonZeroProfitMetrics.some((m) => m.contractId === c.id)
  )
  const [positive, negative] = partition(
    contracts,
    (c) => (metricsByContractId[c.id].from?.day.profit ?? 0) > 0
  )
  const rows = [
    ...sortBy(
      positive,
      (c) => -(metricsByContractId[c.id].from?.day.profit ?? 0)
    )
      .map((c) => [c, metricsByContractId[c.id].from?.day.profit ?? 0])
      .slice(currentSlice, currentSlice + rowsPerSection),
    ...sortBy(negative, (c) => metricsByContractId[c.id].from?.day.profit ?? 0)
      .map((c) => [c, metricsByContractId[c.id].from?.day.profit ?? 0])
      .slice(currentSlice, currentSlice + rowsPerSection),
  ]

  if (positive.length === 0 && negative.length === 0)
    return <div className="px-4 text-gray-500">None</div>

  const marketRow = (c: CPMMBinaryContract) =>
    r(
      <div className={'ml-2'}>
        <ContractMention
          contract={c}
          probChange={
            (c.probChanges.day > 0 ? '+' : '') +
            formatPercent(c.probChanges.day).replace('%', '')
          }
          className={'line-clamp-6 sm:line-clamp-4 !whitespace-normal'}
        />
      </div>
    )

  const columnHeader = (text: string) =>
    r(<Row className={'mx-2 items-center gap-2 text-gray-600'}>{text}</Row>)
  const profitRow = (profit: number) =>
    r(
      <div
        className={clsx(
          'mx-2 min-w-[2rem] text-right',
          profit > 0 ? 'text-teal-500' : 'text-scarlet-600'
        )}
      >
        {formatMoney(profit)}
      </div>
    )

  return (
    <Col className="mb-4 w-full gap-4 rounded-lg md:flex-row">
      <Col className="flex-1 gap-4">
        <Grid
          data={rows}
          style={{
            td: {
              paddingBottom: '0.5rem',
              paddingTop: '0.5rem',
              verticalAlign: 'top',
            },
          }}
          columns={[
            {
              name: columnHeader('Market'),
              formatter: (c: CPMMBinaryContract) => marketRow(c),
              id: 'market',
            },
            {
              name: columnHeader('Profit'),
              formatter: (value: number) => profitRow(value),
              id: 'profit',
            },
          ]}
          sort={false}
        />
        <Pagination
          page={page}
          itemsPerPage={rowsPerSection * 2}
          totalItems={contracts.length}
          setPage={setPage}
        />
      </Col>
    </Col>
  )
}
