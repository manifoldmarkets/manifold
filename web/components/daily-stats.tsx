import React, { useState } from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import { SearchIcon } from '@heroicons/react/solid'

import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { hasCompletedStreakToday } from 'web/components/profile/betting-streak-modal'
import { LoansModal } from 'web/components/profile/loans-modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { QuestsOrStreak } from 'web/components/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'
import { DailyProfit } from 'web/components/daily-profit'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export const dailyStatsClass = 'bg-canvas-0 rounded-lg px-2 py-1 shadow'

export function DailyStats(props: {
  user: User | null | undefined
  showLoans?: boolean
  className?: string
}) {
  const { user, showLoans } = props
  const isMobile = useIsMobile()

  const [showLoansModal, setShowLoansModal] = useState(false)

  if (!user) return <></>

  return (
    <Row className={'z-30 w-full items-center justify-end gap-3'}>
      {!isMobile && <DailyProfit user={user} />}
      <DailyLeagueStat user={user} />
      <QuestsOrStreak user={user} />
      <Link href="/find" className="flex sm:hidden">
        <SearchIcon className="text-ink-500 hover:text-ink-900 h-6 w-6 cursor-pointer" />
      </Link>

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
