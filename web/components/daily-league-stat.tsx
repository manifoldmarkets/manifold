import Link from 'next/link'

import { User } from 'common/user'
import { Col } from './layout/col'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { DIVISION_NAMES } from 'common/leagues'

export const DailyLeagueStat = (props: { user: User }) => {
  const { user } = props
  const info = useLeagueInfo(user.id)

  if (!info || !info.division) {
    return null
  }

  return (
    <Link href="/leagues">
      <Col className="bg-ink-100 gap-1 rounded-lg px-2 py-1 shadow">
        <div>Rank {info.rank}</div>
        <div className="text-ink-600 text-sm">
          {DIVISION_NAMES[info.division]}
        </div>
      </Col>
    </Link>
  )
}
