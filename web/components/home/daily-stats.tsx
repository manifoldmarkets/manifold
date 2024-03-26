import clsx from 'clsx'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { QuestsOrStreak } from 'web/components/home/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'
import { DailyLoan } from 'web/components/home/daily-loan'
import { DailyProfit } from './daily-profit'

export const dailyStatsClass = 'bg-canvas-0 rounded-lg px-2 py-1 shadow'

export function DailyStats(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props
  if (!user) return <></>
  return (
    <Row
      className={clsx('z-30 items-center justify-end gap-1 pb-1', className)}
    >
      <QuestsOrStreak user={user} />
      <DailyLeagueStat user={user} />
      <DailyLoan user={user} showChest={true} />
      <DailyProfit user={user} />
    </Row>
  )
}
