import Link from 'next/link'

import { User } from 'common/user'
import { Col } from './layout/col'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { DIVISION_NAMES } from 'common/leagues'
import { dailyStatsClass } from 'web/components/daily-stats'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { useHasUnseenLeagueChat } from 'web/hooks/use-chats'
import { getLeagueChatChannelId } from 'common/league-chat'

export const DailyLeagueStat = (props: { user: User }) => {
  const { user } = props
  const info = useLeagueInfo(user.id)
  const leagueChannelId = info
    ? getLeagueChatChannelId(info.season, info.division, info.cohort)
    : undefined
  if (!info || info.division === undefined) {
    return null
  }

  return (
    <Link href="/leagues" onClick={() => track('click daily leagues button')}>
      <Col className={clsx(dailyStatsClass, 'relative')}>
        <div>Rank {info.rank}</div>
        <div className="text-ink-600 text-xs">
          {DIVISION_NAMES[info.division]}
        </div>
        {leagueChannelId && user?.id && (
          <UnseenChatBubble
            leagueChannelId={leagueChannelId}
            userId={user.id}
          />
        )}
      </Col>
    </Link>
  )
}

const UnseenChatBubble = (props: {
  leagueChannelId: string
  userId: string
}) => {
  const { leagueChannelId, userId } = props
  const [unseenLeagueChat] = useHasUnseenLeagueChat(leagueChannelId, userId)
  if (!unseenLeagueChat) {
    return null
  }
  return (
    <div className="absolute -right-1 -top-1">
      <div className="h-3 w-3 rounded-full bg-blue-500" />
    </div>
  )
}
