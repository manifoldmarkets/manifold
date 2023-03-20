import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { HOUR_MS } from 'common/util/time'
import clsx from 'clsx'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import {
  formatMoney,
  formatPercent,
  shortFormatNumber,
} from 'common/util/format'
import { ContractMetrics } from 'common/calculate-metrics'
import { CPMMBinaryContract } from 'common/contract'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { keyBy, partition, sortBy, sum } from 'lodash'
import { _ as r, Grid } from 'gridjs-react'
import { ContractMention } from 'web/components/contract/contract-mention'
import {
  dailyStatsClass,
  unseenDailyStatsClass,
} from 'web/components/daily-stats'
import { Pagination } from 'web/components/widgets/pagination'
import {
  storageStore,
  usePersistentRevalidatedState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { LoadingIndicator } from './widgets/loading-indicator'
import { db } from 'web/lib/supabase/db'
import { useHasSeen } from 'web/hooks/use-has-seen'
const DAILY_PROFIT_CLICK_EVENT = 'click daily profit button'

export const DailyProfit = memo(function DailyProfit(props: {
  user: User | null | undefined
}) {
  const { user } = props
  const [open, setOpen] = useState(false)

  const refreshContractMetrics = useCallback(async () => {
    if (user)
      return getUserContractMetricsByProfitWithContracts(user.id, db, 'day')
  }, [user])

  const [data, setData] = usePersistentRevalidatedState<
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
  useEffect(() => {
    if (open) refreshContractMetrics().then(setData)
  }, [open, refreshContractMetrics, setData])

  const dailyProfit = Math.round(
    useMemo(() => {
      if (!data) return 0
      return sum(data.metrics.map((m) => m.from?.day.profit ?? 0))
    }, [data])
  )
  // const dailyProfit = 10
  const [seenToday, setSeenToday] = useHasSeen(
    user,
    [DAILY_PROFIT_CLICK_EVENT],
    'day'
  )
  if (!user) return <div />

  return (
    <>
      <button
        className={clsx(
          'rounded-md text-center',
          seenToday || Math.abs(dailyProfit) < 1 ? '' : unseenDailyStatsClass
        )}
        onClick={withTracking(() => {
          setOpen(true)
          setSeenToday(true)
        }, DAILY_PROFIT_CLICK_EVENT)}
      >
        <Row className={clsx(dailyStatsClass)}>
          <Col className="justify-start">
            <div className={clsx()}>{formatMoney(user.balance)}</div>
            <div className="text-sm opacity-70">Balance</div>
          </Col>

          {dailyProfit !== 0 && (
            <span
              className={clsx(
                'ml-1 mt-1 text-xs',
                seenToday
                  ? dailyProfit >= 0
                    ? 'text-teal-600'
                    : 'text-scarlet-600'
                  : ''
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
          balance={user.balance}
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
  dailyProfit: number
  balance: number
}) {
  const { open, setOpen, metrics, contracts, dailyProfit, balance } = props

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <div className="bg-canvas-0 text-ink-1000 rounded-lg p-4">
        <Col className={'mb-4'}>
          <Title className={'mb-1'}>💰 Daily profit</Title>

          <span className="text-ink-500 mb-4 text-sm">
            Change in the value of your Yes/No positions over the last 24 hours.
            (Updates every 30 min)
          </span>

          <Row className="gap-2">
            <Col className="gap-2">
              <div>Balance</div>
              <div>Daily profit</div>
            </Col>
            <Col className="items-end gap-2">
              <div>{formatMoney(balance)}</div>
              <div
                className={clsx(
                  dailyProfit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                )}
              >
                {formatMoney(dailyProfit)}
              </div>
            </Col>
          </Row>
        </Col>

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
      </div>
    </Modal>
  )
}

export function ProfitChangeTable(props: {
  contracts: CPMMBinaryContract[]
  metrics: ContractMetrics[]
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
  ]

  if (positive.length === 0 && negative.length === 0)
    return (
      <div className="text-ink-500 px-4">
        No profit changes found. Return later after making a few bets.
      </div>
    )

  const marketRow = (c: CPMMBinaryContract) =>
    r(
      <div className={'ml-2'}>
        <ContractMention
          contract={c}
          probChange={
            (c.probChanges[from] > 0 ? '+' : '') +
            formatPercent(c.probChanges[from]).replace('%', '')
          }
          className={'line-clamp-6 sm:line-clamp-4 !whitespace-normal'}
        />
      </div>
    )

  const columnHeader = (text: string) =>
    r(<Row className={'text-ink-600 mx-2 items-center gap-2'}>{text}</Row>)
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
        {showPagination && (
          <Pagination
            page={page}
            itemsPerPage={rowsPerSection * 2}
            totalItems={contracts.length}
            setPage={setPage}
          />
        )}
      </Col>
    </Col>
  )
}
