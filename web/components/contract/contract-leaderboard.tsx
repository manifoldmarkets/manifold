import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { resolvedPayout } from 'common/calculate'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { groupBy, mapValues, sumBy, sortBy } from 'lodash'
import { useState, useMemo, useEffect } from 'react'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { listUsers, User } from 'web/lib/firebase/users'
import { FeedBet } from '../feed/feed-bets'
import { FeedComment } from '../feed/feed-comments'
import { Spacer } from '../layout/spacer'
import { Leaderboard } from '../leaderboard'
import { Title } from '../title'
import { BETTORS } from 'common/user'
import { scoreCommentorsAndBettors } from 'common/scoring'

export function ContractLeaderboard(props: {
  contract: Contract
  bets: Bet[]
}) {
  const { contract, bets } = props
  const [users, setUsers] = useState<User[]>()

  const { userProfits, top5Ids } = useMemo(() => {
    // Create a map of userIds to total profits (including sales)
    const openBets = bets.filter((bet) => !bet.isSold && !bet.sale)
    const betsByUser = groupBy(openBets, 'userId')

    const userProfits = mapValues(betsByUser, (bets) =>
      sumBy(bets, (bet) => resolvedPayout(contract, bet) - bet.amount)
    )
    // Find the 5 users with the most profits
    const top5Ids = Object.entries(userProfits)
      .sort(([_i1, p1], [_i2, p2]) => p2 - p1)
      .filter(([, p]) => p > 0)
      .slice(0, 5)
      .map(([id]) => id)
    return { userProfits, top5Ids }
  }, [contract, bets])

  useEffect(() => {
    if (top5Ids.length > 0) {
      listUsers(top5Ids).then((users) => {
        const sortedUsers = sortBy(users, (user) => -userProfits[user.id])
        setUsers(sortedUsers)
      })
    }
  }, [userProfits, top5Ids])

  return users && users.length > 0 ? (
    <Leaderboard
      title={`🏅 Top ${BETTORS}`}
      users={users || []}
      columns={[
        {
          header: 'Total profit',
          renderCell: (user) => formatMoney(userProfits[user.id] || 0),
        },
      ]}
      className="mt-12 max-w-sm"
    />
  ) : null
}

export function ContractTopTrades(props: {
  contract: Contract
  bets: Bet[]
  comments: ContractComment[]
  tips: CommentTipMap
}) {
  const { contract, bets, comments, tips } = props
  const {
    topCommentId,
    topBetId,
    topBettor,
    profitById,
    commentsById,
    betsById,
  } = scoreCommentorsAndBettors(contract, bets, comments)
  return (
    <div className="mt-12 max-w-sm">
      {topCommentId && profitById[topCommentId] > 0 && (
        <>
          <Title text="💬 Proven correct" className="!mt-0" />
          <div className="relative flex items-start space-x-3 rounded-md bg-gray-50 px-2 py-4">
            <FeedComment
              contract={contract}
              comment={commentsById[topCommentId]}
              tips={tips[topCommentId]}
              betsBySameUser={[betsById[topCommentId]]}
            />
          </div>
          <Spacer h={16} />
        </>
      )}

      {/* If they're the same, only show the comment; otherwise show both */}
      {topBettor && topBetId !== topCommentId && profitById[topBetId] > 0 && (
        <>
          <Title text="💸 Best bet" className="!mt-0" />
          <div className="relative flex items-start space-x-3 rounded-md bg-gray-50 px-2 py-4">
            <FeedBet contract={contract} bet={betsById[topBetId]} />
          </div>
          <div className="mt-2 ml-2 text-sm text-gray-500">
            {topBettor} made {formatMoney(profitById[topBetId] || 0)}!
          </div>
        </>
      )}
    </div>
  )
}
