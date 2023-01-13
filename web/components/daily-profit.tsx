import React, { memo, useEffect, useState } from 'react'
import { User } from 'common/user'
import { DAY_MS } from 'common/util/time'
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
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { keyBy, partition, sortBy } from 'lodash'
import { _ as r, Grid } from 'gridjs-react'
import { ContractMention } from 'web/components/contract/contract-mention'
import { dailyStatsClass } from 'web/components/daily-stats'
import { Pagination } from 'web/components/widgets/pagination'

export const DailyProfit = memo(function DailyProfit(props: {
  user: User | null | undefined
}) {
  const { user } = props
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(true)
  const dailyProfitEventName = 'click daily profit button'
  useEffect(() => {
    if (!user) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const todayMsEnd = todayMs + DAY_MS
    getUserEvents(user.id, dailyProfitEventName, todayMs, todayMsEnd).then(
      (events) => setSeen(events.length > 0)
    )
  }, [user])

  const profit = user?.profitCached.daily ?? 0
  // emoji options: ⌛ 💰 🕛
  return (
    <>
      <button
        className={clsx(
          'rounded-md py-1 text-center transition-colors disabled:cursor-not-allowed',
          !seen
            ? 'from-indigo-500 to-blue-500 px-1.5 text-white hover:from-indigo-700 hover:to-blue-700 enabled:bg-gradient-to-r'
            : ''
        )}
        onClick={withTracking(() => {
          setOpen(true)
          setSeen(true)
        }, dailyProfitEventName)}
      >
        <Tooltip text={'Daily profit'}>
          <Row
            className={clsx(
              dailyStatsClass,
              profit > 0 && seen && 'text-teal-500'
            )}
          >
            <span>💰{formatMoney(profit)}</span>
          </Row>
        </Tooltip>
      </button>
      {user && (
        <DailyProfitModal userId={user.id} setOpen={setOpen} open={open} />
      )}
    </>
  )
})

function DailyProfitModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  userId: string
}) {
  const { open, setOpen, userId } = props
  const [data, setData] = useState<
    { metrics: ContractMetrics[]; contracts: CPMMBinaryContract[] } | undefined
  >()

  useEffect(() => {
    if (!open || data) return
    getUserContractMetricsByProfit(userId).then(setData)
  }, [data, userId, open])

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <div className="rounded-lg bg-white p-4">
        <Col className={'mb-4'}>
          <Title className={'mb-1'}>Daily profit</Title>
          <span className="text-sm text-gray-500">
            Change in the value of your positions over the last 24 hours.
            (Updates every 15 min)
          </span>
        </Col>
        {!data ? (
          <LoadingIndicator />
        ) : (
          <ProfitChangeTable
            contracts={data.contracts}
            metrics={data.metrics}
          />
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
      <div className={'ml-2 text-lg'}>
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
