import { Bet } from 'common/bet'
import { resolvedPayout } from 'common/calculate'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'

import { groupBy, mapValues, sumBy, sortBy } from 'lodash'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { FeedBet } from '../feed/feed-bets'
import { FeedComment } from '../feed/feed-comments'
import { Spacer } from '../layout/spacer'
import { Leaderboard } from '../leaderboard'
import { Title } from '../title'
import { BETTORS } from 'common/user'
import { scoreCommentorsAndBettors } from 'common/scoring'
import { ContractComment } from 'common/comment'
import { memo } from 'react'

export const ContractLeaderboard = memo(function ContractLeaderboard(props: {
  contract: Contract
  bets: Bet[]
}) {
  const { contract, bets } = props

  // Create a map of userIds to total profits (including sales)
  const openBets = bets.filter((bet) => !bet.isSold && !bet.sale)
  const betsByUser = groupBy(openBets, 'userId')
  const userProfits = mapValues(betsByUser, (bets) => {
    return {
      name: bets[0].userName,
      username: bets[0].userUsername,
      avatarUrl: bets[0].userAvatarUrl,
      total: sumBy(bets, (bet) => resolvedPayout(contract, bet) - bet.amount),
    }
  })
  // Find the 5 users with the most profits
  const top5 = Object.values(userProfits)
    .sort((p1, p2) => p2.total - p1.total)
    .filter((p) => p.total > 0)
    .slice(0, 5)

  return top5 && top5.length > 0 ? (
    <Leaderboard
      title={`🏅 Top ${BETTORS}`}
      entries={top5 || []}
      columns={[
        {
          header: 'Total profit',
          renderCell: (entry) => formatMoney(entry.total),
        },
      ]}
      className="mt-12 max-w-sm"
    />
  ) : null
})

export function ContractTopTrades(props: {
  contract: Contract
  bets: Bet[]
  comments: ContractComment[]
  tips: CommentTipMap
}) {
  const { contract, bets, comments, tips } = props
  const { topBetId, topBettor, profitById, betsById } =
    scoreCommentorsAndBettors(contract, bets, comments)

  // And also the comment with the highest profit
  const topComment = sortBy(comments, (c) => c.betId && -profitById[c.betId])[0]

  return (
    <div className="mt-12 max-w-sm">
      {topComment && profitById[topComment.id] > 0 && (
        <>
          <Title text="💬 Proven correct" className="!mt-0" />
          <div className="relative flex items-start space-x-3 rounded-md bg-gray-50 px-2 py-4">
            <FeedComment contract={contract} comment={topComment} />
          </div>
          <Spacer h={16} />
        </>
      )}

      {/* If they're the same, only show the comment; otherwise show both */}
      {topBettor && topBetId !== topComment?.betId && profitById[topBetId] > 0 && (
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
