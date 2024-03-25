import clsx from 'clsx'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { QuestsOrStreak } from 'web/components/home/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { DailyLoan } from 'web/components/home/daily-loan'

export const dailyStatsClass = 'bg-canvas-0 rounded-lg px-2 py-1 shadow'

export function DailyStats(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props
  const isMobile = useIsMobile()
  if (!user) return <></>
  return (
    <Row className={clsx('z-30 items-center justify-end gap-1', className)}>
      <QuestsOrStreak user={user} />
      <DailyLeagueStat user={user} />
      {!isMobile && <DailyLoan user={user} showChest={true} />}
      {/*{!isMobile && <DailyProfit user={user} />}*/}
    </Row>
  )
}
