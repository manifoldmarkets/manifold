import Link from 'next/link'

import { User } from 'common/user'
import { Col } from './layout/col'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { DIVISION_NAMES } from 'common/leagues'
import { dailyStatsClass } from 'web/components/daily-stats'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'

export const DailyLeagueStat = (props: { user: User }) => {
  const { user } = props
  const info = useLeagueInfo(user.id)

  if (!info || !info.division) {
    return null
  }

  return (
    <Link href="/leagues" onClick={() => track('click daily leagues button')}>
      <Col className={clsx(dailyStatsClass, 'gap-1')}>
        <div>Rank {info.rank}</div>
        <div className="text-ink-600 text-sm">
          {DIVISION_NAMES[info.division]}
        </div>
      </Col>
    </Link>
  )
}
