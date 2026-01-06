import clsx from 'clsx'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { QuestsOrStreak } from 'web/components/home/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'
import { DailyPredictleStat } from './daily-predictle-stat'
import { DailyProfit } from './daily-profit'
import { DailyLoan } from './daily-loan'

export const dailyStatsClass =
  'bg-canvas-0 dark:bg-canvas-50 rounded-lg px-2 sm:px-3 py-1 shadow min-w-[60px]'

export function DailyStats(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props
  return (
    <Row className={clsx('items-center gap-2 sm:gap-3', className)}>
      <QuestsOrStreak user={user} />
      <DailyLeagueStat userId={user?.id} />
      <DailyPredictleStat />
      <DailyProfit user={user} />
      {user && <DailyLoan user={user} />}
    </Row>
  )
}
