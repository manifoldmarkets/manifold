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
  const { user } = props
  const isMobile = useIsMobile()
  if (!user) return <></>
  return (
    <Row className={'z-30 w-full items-center justify-end gap-3'}>
      {!isMobile && <DailyLoan user={user} showChest={true} />}
      {/*{!isMobile && <DailyProfit user={user} />}*/}
      <DailyLeagueStat user={user} />
      <QuestsOrStreak user={user} />
    </Row>
  )
}
