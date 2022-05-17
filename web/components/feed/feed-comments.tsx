import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import { User } from 'common/user'
import { GENERAL_COMMENTS_OUTCOME_ID } from 'web/components/feed/activity-items'

// TODO: move feed commment and comment thread in here when sinclair confirms they're not working on them rn
export function getMostRecentCommentableBet(
  betsByCurrentUser: Bet[],
  comments: Comment[],
  user?: User | null,
  answerOutcome?: string
) {
  return betsByCurrentUser
    .filter((bet) => {
      if (
        canCommentOnBet(bet, user) &&
        // The bet doesn't already have a comment
        !comments.some((comment) => comment.betId == bet.id)
      ) {
        if (!answerOutcome) return true
        // If we're in free response, don't allow commenting on ante bet
        return (
          bet.outcome !== GENERAL_COMMENTS_OUTCOME_ID &&
          answerOutcome === bet.outcome
        )
      }
      return false
    })
    .sort((b1, b2) => b1.createdTime - b2.createdTime)
    .pop()
}

function canCommentOnBet(bet: Bet, user?: User | null) {
  const { userId, createdTime, isRedemption } = bet
  const isSelf = user?.id === userId
  // You can comment if your bet was posted in the last hour
  return !isRedemption && isSelf && Date.now() - createdTime < 60 * 60 * 1000
}
