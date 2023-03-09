import React, { useEffect, useState } from 'react'
import Router from 'next/router'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { usePrivateUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import {
  BettingStreakModal,
  hasCompletedStreakToday,
} from 'web/components/profile/betting-streak-modal'
import { LoansModal } from 'web/components/profile/loans-modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { DailyProfit } from 'web/components/daily-profit'

export const dailyStatsClass = 'items-center text-lg'
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
  }, [])

  const [showStreakModal, setShowStreakModal] = useState(false)

  // hide daily stats if user created in last 24 hours
  const justCreated =
    (user?.createdTime ?? 0) > Date.now() - 1000 * 60 * 60 * 24

  if (justCreated) return <></>

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
              <span>🔥 {user?.currentBettingStreak ?? 0}</span>
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
