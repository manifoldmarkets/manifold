import React, { useEffect, useState } from 'react'
import Router from 'next/router'
import clsx from 'clsx'
import { sum } from 'lodash'

import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { SiteLink } from 'web/components/widgets/site-link'
import {
  usePrivateUser,
  useUserContractMetricsByProfit,
} from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import {
  BettingStreakModal,
  hasCompletedStreakToday,
} from 'web/components/profile/betting-streak-modal'
import { LoansModal } from 'web/components/profile/loans-modal'

const dailyStatsHeaderClass = 'text-gray-500 text-xs sm:text-sm'
const dailyStatsClass = 'items-center text-lg'

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
    <Row className={'flex-shrink-0 gap-4'}>
      <DailyProfit user={user} />

      {!streaksHidden && (
        <Col
          className="cursor-pointer"
          onClick={() => setShowStreakModal(true)}
        >
          <div className={dailyStatsHeaderClass}>Streak</div>
          <Row
            className={clsx(
              dailyStatsClass,
              user && !hasCompletedStreakToday(user) && 'grayscale'
            )}
          >
            <span>{user?.currentBettingStreak ?? 0}🔥</span>
          </Row>
        </Col>
      )}
      {showLoans && (
        <Col
          className="hidden cursor-pointer sm:flex"
          onClick={() => setShowLoansModal(true)}
        >
          <div className={dailyStatsHeaderClass}>Next loan</div>
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

export function DailyProfit(props: { user: User | null | undefined }) {
  const { user } = props

  const contractMetricsByProfit = useUserContractMetricsByProfit(
    user?.id ?? '_'
  )
  const profit = sum(
    contractMetricsByProfit?.metrics.map((m) =>
      m.from ? m.from.day.profit : 0
    ) ?? []
  )
  return (
    <SiteLink className="flex flex-col hover:no-underline" href="/daily-movers">
      <div className={dailyStatsHeaderClass}>Daily profit</div>
      <Row className={dailyStatsClass}>
        <span>{formatMoney(profit)}</span>{' '}
      </Row>
    </SiteLink>
  )
}
