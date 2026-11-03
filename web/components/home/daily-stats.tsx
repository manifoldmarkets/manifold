import clsx from 'clsx'
import { User } from 'common/user'
import { ReactNode } from 'react'
import { Row } from 'web/components/layout/row'
import { QuestsOrStreak } from 'web/components/home/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'
import { DailyPredictleStat } from './daily-predictle-stat'
import { DailyProfit } from './daily-profit'
import { DailyLoan } from './daily-loan'

export const dailyStatsClass =
  'bg-canvas-0 dark:bg-canvas-50 flex min-h-[48px] min-w-[60px] shrink-0 flex-col items-center justify-center whitespace-nowrap rounded-lg px-2 py-1 text-sm shadow sm:px-3'

export function DailyStats(props: {
  user: User | null | undefined
  className?: string
  children?: ReactNode
}) {
  const { user, className, children } = props
  return (
    <Row className={clsx('flex-wrap items-center gap-2 sm:gap-3', className)}>
      <QuestsOrStreak user={user} />
      <DailyLeagueStat userId={user?.id} />
      <DailyPredictleStat />
      <DailyProfit user={user} />
      {user && <DailyLoan user={user} />}
      {children}
    </Row>
  )
}
