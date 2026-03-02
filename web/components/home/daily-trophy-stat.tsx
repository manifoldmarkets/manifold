import Link from 'next/link'
import clsx from 'clsx'

import { dailyStatsClass } from 'web/components/home/daily-stats'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Col } from 'web/components/layout/col'
import { countClaimableTiers } from 'common/trophies'

export function DailyTrophyStat(props: {
  userId: string | null | undefined
  username: string | null | undefined
}) {
  const { userId, username } = props

  const { data } = useAPIGetter(
    'get-trophy-progress',
    userId ? { userId } : undefined
  )

  if (!data) return null

  const claimableCount = countClaimableTiers(data.trophies)
  if (claimableCount <= 0) return null

  return (
    <Link
      prefetch={false}
      href={`/${username}?tab=achievements`}
    >
      <Col className={clsx(dailyStatsClass, 'relative items-center')}>
        <div className="whitespace-nowrap">
          {'\u{1F3C6}'} {claimableCount}
        </div>
        <div className="text-ink-600 text-xs">Claim</div>
      </Col>
    </Link>
  )
}
