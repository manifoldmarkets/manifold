import Link from 'next/link'

import { User } from 'common/user'
import { Col } from './layout/col'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { DIVISION_NAMES, league_user_info } from 'common/leagues'
import { dailyStatsClass } from 'web/components/daily-stats'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { useAllUnseenChatsForLeages } from 'web/hooks/use-chats'

export const DailyLeagueStat = (props: { user: User }) => {
  const { user } = props
  const info = useLeagueInfo(user.id)

  if (!info || info.division === undefined) {
    return null
  }

  return (
    <Link href="/leagues" onClick={() => track('click daily leagues button')}>
      <Col className={clsx(dailyStatsClass, 'relative')}>
        <div className="whitespace-nowrap">Rank {info.rank}</div>
        <div className="text-ink-600 text-xs">
          {DIVISION_NAMES[info.division]}
        </div>
        {user?.id && <UnseenChatBubble userId={user.id} />}
      </Col>
    </Link>
  )
}

const UnseenChatBubble = (props: { userId: string }) => {
  const { userId } = props
  const yourLeague = useLeagueInfo(userId)
  if (!yourLeague) {
    return null
  }
  return (
    <UnseenRealtimeChatBubble userId={userId} yourLeagueInfo={yourLeague} />
  )
}
const UnseenRealtimeChatBubble = (props: {
  userId: string
  yourLeagueInfo: league_user_info
}) => {
  const { userId, yourLeagueInfo } = props
  const [unseenLeagueChats] = useAllUnseenChatsForLeages(
    userId,
    [],
    yourLeagueInfo
  )
  if (!unseenLeagueChats.length) return null

  return (
    <div className="absolute -right-1 -top-1">
      <div className="h-3 w-3 rounded-full bg-blue-500" />
    </div>
  )
}
