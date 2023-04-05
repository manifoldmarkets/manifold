import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'common/user'
import { HOUR_MS } from 'common/util/time'
import clsx from 'clsx'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { ContractMetrics } from 'common/calculate-metrics'
import { CPMMContract } from 'common/contract'
import { getUserContractMetricsByProfitWithContracts } from 'common/supabase/contract-metrics'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
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
import { InfoTooltip } from './widgets/info-tooltip'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
const DAILY_PROFIT_CLICK_EVENT = 'click daily profit button'

export const DailyProfit = memo(function DailyProfit(props: {
  user: User | null | undefined
  isCurrentUser?: boolean
}) {
  const { user } = props
  const isCurrentUser =
    props.isCurrentUser === undefined ? true : props.isCurrentUser

  const [open, setOpen] = useState(false)

  const refreshContractMetrics = useCallback(async () => {
    if (user)
      return getUserContractMetricsByProfitWithContracts(user.id, db, 'day')
  }, [user])

  const [data, setData] = usePersistentRevalidatedState<
    { metrics: ContractMetrics[]; contracts: CPMMContract[] } | undefined
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
  const [seenToday, setSeenToday] = isCurrentUser
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useHasSeen(user, [DAILY_PROFIT_CLICK_EVENT], 'day')
    : [true, () => {}]
  if (!user) return <div />

  return (
    <>
      <button
        className={clsx(
          dailyStatsClass,
          'rounded-md text-center',
          seenToday || Math.abs(dailyProfit) < 1 ? '' : unseenDailyStatsClass
        )}
        onClick={withTracking(() => {
          setOpen(true)
          setSeenToday(true)
        }, DAILY_PROFIT_CLICK_EVENT)}
      >
        <Row>
          <Col className="justify-start">
            <div className={clsx()}>{formatMoney(user.balance)}</div>
            <div className="text-ink-600 text-sm ">Balance</div>
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
  contracts?: CPMMContract[]
  dailyProfit: number
  balance: number
}) {
  const { open, setOpen, metrics, contracts, dailyProfit, balance } = props

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <div className="bg-canvas-0 text-ink-1000 rounded-lg p-4">
        <Col className={'mb-4'}>
          {/* <Title className={'mb-1'}>💰 Daily profit</Title> */}

          <Row className="gap-2 text-2xl">
            <Col className="gap-2">
              <div>Balance</div>
              <div>Daily profit</div>
            </Col>
            <Col className="text-ink-600 items-end gap-2">
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

          <div className="text-ink-500 mt-4 text-sm">
            Change in profit over the last 24 hours.{' '}
            <InfoTooltip
              text="I.e. the change in the value of your
            shares in Yes/No markets. (Updates every 30 min)"
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

  const marketRow = (c: CPMMContract) => {
    const change = getFormattedMappedValue(c, c.probChanges[from]).replace(
      '%',
      ''
    )
    return r(
      <div className={'ml-2'}>
        <ContractMention
          contract={c}
          probChange={(c.probChanges[from] > 0 ? '+' : '') + change}
          className={'line-clamp-6 sm:line-clamp-4 !whitespace-normal'}
        />
      </div>
    )
  }

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
              formatter: (c: CPMMContract) => marketRow(c),
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
            scrollToTop={true}
          />
        )}
      </Col>
    </Col>
  )
}
