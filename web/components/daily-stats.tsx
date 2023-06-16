import React, { useState } from 'react'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { hasCompletedStreakToday } from 'web/components/profile/betting-streak-modal'
import { LoansModal } from 'web/components/profile/loans-modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { QuestsOrStreak } from 'web/components/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'

export const dailyStatsClass = 'bg-canvas-0 rounded-lg px-2 py-1 shadow'

export function DailyStats(props: {
  user: User | null | undefined
  showLoans?: boolean
  className?: string
}) {
  const { user, showLoans } = props

  const [showLoansModal, setShowLoansModal] = useState(false)

  if (!user) return <></>

  return (
    <Row className={'z-30 flex-shrink-0 items-center gap-3'}>
      <DailyLeagueStat user={user} />
      <QuestsOrStreak user={user} />

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
    </Row>
  )
}
