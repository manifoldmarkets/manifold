import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { QuestsOrStreak } from 'web/components/home/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'
import { DailyProfit } from 'web/components/home/daily-profit'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Avatar } from 'web/components/widgets/avatar'
import clsx from 'clsx'
import Link from 'next/link'

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
      {!isMobile && <DailyProfit user={user} />}
      <DailyLeagueStat user={user} />
      <QuestsOrStreak user={user} />
      {!isMobile && (
        <Link
          href={'/' + user.username}
          className={clsx(dailyStatsClass, 'text-ink-700 text-xs')}
        >
          <Avatar
            avatarUrl={user.avatarUrl}
            username={user.username}
            noLink
            size="xs"
            className={'mx-auto'}
          />
          Profile
        </Link>
      )}
    </Row>
  )
}
