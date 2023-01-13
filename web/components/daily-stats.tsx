import React, { memo, useEffect, useState } from 'react'
import Router from 'next/router'
import clsx from 'clsx'
import { keyBy, partition, sortBy } from 'lodash'

import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { usePrivateUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { formatMoney, formatPercent } from 'common/util/format'
import {
  BettingStreakModal,
  hasCompletedStreakToday,
} from 'web/components/profile/betting-streak-modal'
import { LoansModal } from 'web/components/profile/loans-modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Modal } from 'web/components/layout/modal'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { CPMMBinaryContract } from 'common/contract'
import { ContractMetrics } from 'common/calculate-metrics'
import { Grid } from 'gridjs-react'
import { _ } from 'gridjs-react'
import { Title } from 'web/components/widgets/title'
import { ContractMention } from 'web/components/contract/contract-mention'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { withTracking } from 'web/lib/service/analytics'
import { getUserEvents } from 'web/lib/supabase/user-events'
import { DAY_MS } from 'common/lib/util/time'
import { getUserContractMetricsByProfit } from 'web/lib/supabase/contract-metrics'

const dailyStatsClass = 'items-center text-lg'
const rainbowClass = 'text-rainbow'
export function DailyStats(props: {
  user: User | null | undefined
  showLoans?: boolean
}) {
  const { user, showLoans } = props

  const privateUser = usePrivateUser()
  const streaks = privateUser?.notificationPreferences?.betting_streaks ?? []
  const streaksHidden = streaks.length === 0

  const [showLoansModal, setShowLoansModal] = useState(false)
  useEffect(() => {
    const showLoansModel = Router.query['show'] === 'loans'
    setShowLoansModal(showLoansModel)
    const showStreaksModal = Router.query['show'] === 'betting-streak'
    setShowStreakModal(showStreaksModal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [showStreakModal, setShowStreakModal] = useState(false)

  return (
    <Row className={'flex-shrink-0 items-center gap-4'}>
      <DailyProfit user={user} />

      {!streaksHidden && (
        <Col
          className="cursor-pointer"
          onClick={() => setShowStreakModal(true)}
        >
          <Tooltip text={'Prediction streak'}>
            <Row
              className={clsx(
                dailyStatsClass,
                user && !hasCompletedStreakToday(user) && 'grayscale'
              )}
            >
              <span>🔥{user?.currentBettingStreak ?? 0}</span>
            </Row>
          </Tooltip>
        </Col>
      )}
      {showLoans && (
        <Col
          className="flex cursor-pointer"
          onClick={() => setShowLoansModal(true)}
        >
          <Tooltip text={'Next loan'}>
            <Row
              className={clsx(
                dailyStatsClass,
                user && !hasCompletedStreakToday(user) && 'grayscale'
              )}
            >
              <span className="text-teal-500">
                🏦 {formatMoney(user?.nextLoanCached ?? 0)}
              </span>
            </Row>
          </Tooltip>
        </Col>
      )}
      {showLoansModal && (
        <LoansModal isOpen={showLoansModal} setOpen={setShowLoansModal} />
      )}
      {showStreakModal && (
        <BettingStreakModal
          isOpen={showStreakModal}
          setOpen={setShowStreakModal}
          currentUser={user}
        />
      )}
    </Row>
  )
}

export const DailyProfit = memo(function DailyProfit(props: {
  user: User | null | undefined
}) {
  const { user } = props
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(true)
  const dailyProfitEventName = 'click daily profit button'
  useEffect(() => {
    // get start of today in ms since epoch
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const todayMsEnd = todayMs + DAY_MS
    if (user?.id) {
      getUserEvents(user.id, dailyProfitEventName, todayMs, todayMsEnd).then(
        (events) => {
          if (events.length === 0) {
            setSeen(false)
          }
        }
      )
    }
  }, [user])

  const profit = user?.profitCached.daily ?? 0
  const profitable = profit > 0
  // emoji options: ⌛ 💰 🕛
  return (
    <>
      <button
        className={clsx(
          'rounded-md px-2 py-1 text-center transition-colors disabled:cursor-not-allowed',
          !seen
            ? 'from-indigo-500 to-blue-500 text-white hover:from-indigo-700 hover:to-blue-700 enabled:bg-gradient-to-r'
            : profitable
            ? rainbowClass
            : ''
        )}
        onClick={withTracking(() => {
          setOpen(true)
          setSeen(true)
        }, dailyProfitEventName)}
      >
        <Tooltip text={'Daily profit'}>
          <Row className={clsx(dailyStatsClass)}>
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
            This is the daily expected value change of all your positions. It
            includes positions you held in markets that resolved within the past
            24 hours.
          </span>
        </Col>
        {!data ? (
          <LoadingIndicator />
        ) : (
          <ProfitChangeTable
            contracts={data.contracts}
            metrics={data.metrics}
            maxRows={4}
          />
        )}
      </div>
    </Modal>
  )
}

function ProfitChangeTable(props: {
  contracts: CPMMBinaryContract[]
  metrics: ContractMetrics[]
  maxRows?: number
}) {
  const { contracts, metrics, maxRows } = props

  const metricsByContractId = keyBy(metrics, (m) => m.contractId)

  const [positive, negative] = partition(
    contracts,
    (c) => (metricsByContractId[c.id].from?.day.profit ?? 0) > 0
  )
  // create an array with three columns: contract question, profit, daily change
  const rows = [
    ...sortBy(
      positive,
      (c) => -(metricsByContractId[c.id].from?.day.profit ?? 0)
    )
      .map((c) => [
        c,
        // c.probChanges.day,
        metricsByContractId[c.id].from?.day.profit ?? 0,
      ])
      .slice(0, maxRows),
    ...sortBy(negative, (c) => metricsByContractId[c.id].from?.day.profit ?? 0)
      .map((c) => [
        c,
        // c.probChanges.day,
        metricsByContractId[c.id].from?.day.profit ?? 0,
      ])
      .slice(0, maxRows),
  ]

  if (positive.length === 0 && negative.length === 0)
    return <div className="px-4 text-gray-500">None</div>

  const marketRow = (c: CPMMBinaryContract) =>
    _(
      <div className={' mb-2'}>
        <ContractMention
          contract={c}
          probChange={
            (c.probChanges.day > 0 ? '+' : '') +
            formatPercent(c.probChanges.day).replace('%', '')
          }
          className={' line-clamp-2 !whitespace-normal'}
        />
      </div>
    )

  const columnHeader = (text: string) =>
    _(
      <Row className={'mx-2 cursor-pointer items-center gap-2 text-gray-600'}>
        {text}
        <Col className={'items-center'}>
          <ChevronUpIcon className="h-2 w-2" />
          <ChevronDownIcon className=" h-2 w-2" />
        </Col>
      </Row>
    )
  const profitRow = (profit: number) =>
    _(
      <div
        className={clsx(
          'mx-2 min-w-[2rem] text-center ',
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
          columns={[
            {
              name: columnHeader('Market'),
              formatter: (c: CPMMBinaryContract) => marketRow(c),
              id: 'market',
              sort: {
                compare: (a: CPMMBinaryContract, b: CPMMBinaryContract) => {
                  const diff = b.probChanges.day - a.probChanges.day
                  return diff < 0 ? -1 : diff > 0 ? 1 : 0
                },
              },
            },
            {
              name: columnHeader('Profit'),
              formatter: (value: number) => profitRow(value),
              id: 'profit',
            },
          ]}
          sort={true}
        />
      </Col>
    </Col>
  )
}
