import { Answer } from 'common/answer'
import { Bet, LimitBet } from 'common/bet'
import { ContractComment, PostComment } from 'common/comment'
import { Contract, Visibility } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { PendingClarification } from 'common/pending-clarification'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { User } from 'common/user'
import { groupBy } from 'lodash'
import { broadcast, broadcastMulti } from './server'

export function broadcastUpdatedPrivateUser(userId: string) {
  // don't send private user info because it's private and anyone can listen
  broadcast(`private-user/${userId}`, {})
}

export function broadcastUpdatedUser(user: Partial<User> & { id: string }) {
  // Never broadcast admin-only verification fields: the user's own browser
  // subscribes to user/{id}. Strip them before they go over the wire (they're
  // also stripped from the public REST response).
  const {
    verificationFlagReason: _adminOnlyReason,
    previousBonusEligibility: _adminOnlyPreviousEligibility,
    ...safe
  } = user
  broadcast(`user/${user.id}`, { user: safe })
}

export function broadcastNewBets(
  contractId: string,
  visibility: Visibility,
  bets: Bet[]
) {
  const payload = { bets }
  broadcastMulti([`contract/${contractId}/new-bet`], payload)

  if (visibility === 'public') {
    broadcastMulti(['global', 'global/new-bet'], payload)
  }

  const newOrders = bets.filter((b) => b.limitProb && !b.isFilled) as LimitBet[]
  broadcastOrders(newOrders)
}

export function broadcastOrders(bets: LimitBet[]) {
  if (bets.length === 0) return
  const { contractId } = bets[0]
  broadcast(`contract/${contractId}/orders`, { bets })
  const betsByUser = groupBy(bets, (b) => b.userId)
  for (const userBets of Object.values(betsByUser)) {
    broadcast(`user/${userBets[0].userId}/orders`, { bets: userBets })
  }
}

export function broadcastUpdatedMetrics(metrics: Omit<ContractMetric, 'id'>[]) {
  if (metrics.length === 0) return
  const { contractId } = metrics[0]
  const metricsByUser = groupBy(metrics, (m) => m.userId)
  for (const userMetrics of Object.values(metricsByUser)) {
    broadcast(`contract/${contractId}/user-metrics/${userMetrics[0].userId}`, {
      metrics: userMetrics,
    })
  }
}

export function broadcastNewComment(
  contractId: string,
  visibility: Visibility,
  creator: User,
  comment: ContractComment
) {
  const payload = { creator, comment }
  const topics = [`contract/${contractId}/new-comment`]
  if (visibility === 'public') {
    topics.push('global', 'global/new-comment')
  }
  broadcastMulti(topics, payload)
}
export function broadcastNewPostComment(
  postId: string,
  visibility: Visibility,
  creator: User,
  comment: PostComment
) {
  const payload = { creator, comment }
  const topics = [`post/${postId}/new-comment`]
  if (visibility === 'public') {
    topics.push('global', 'global/new-post-comment')
  }
  broadcastMulti(topics, payload)
}

export function broadcastNewContract(contract: Contract, creator: User) {
  const payload = { contract, creator }
  if (contract.visibility === 'public') {
    broadcastMulti(['global', 'global/new-contract'], payload)
  }
}

export function broadcastNewSubsidy(
  contractId: string,
  visibility: Visibility,
  amount: number
) {
  const payload = { amount }
  const topics = [`contract/${contractId}/new-subsidy`]
  if (visibility === 'public') {
    topics.push('global', 'global/new-subsidy')
  }
  broadcastMulti(topics, payload)
}

export function broadcastUpdatedContract(
  visibility: Visibility,
  contract: Partial<Contract> & { id: string }
) {
  const payload = { contract }
  const topics = [`contract/${contract.id}`]
  if (visibility === 'public') {
    topics.push('global', 'global/updated-contract')
  }
  broadcastMulti(topics, payload)
}

// Live sports score for a market, pushed by the sports-live poller. Its own
// topic (the score fields live in contract.data, not on Contract) so only the
// sports dashboard subscribes and the generic contract/global topics stay quiet.
export function broadcastSportsLiveScore(
  contractId: string,
  score: {
    sportsHomeScore: number | null
    sportsAwayScore: number | null
    sportsLiveStatus: string
    sportsLiveMinute: string | null
    sportsLiveUpdatedTime: number
  }
) {
  broadcast(`contract/${contractId}/sports-live`, score)
}

export function broadcastNewAnswer(answer: Answer) {
  const payload = { answer }
  const topics = [`contract/${answer.contractId}/new-answer`]
  // TODO: broadcast to global. we don't do this rn cuz too lazy get contract visibility to filter out unlisted
  broadcastMulti(topics, payload)
}

export function broadcastUpdatedAnswers(
  contractId: string,
  answers: (Partial<Answer> & { id: string })[]
) {
  if (answers.length === 0) return

  broadcast(`contract/${contractId}/updated-answers`, { answers })
  for (const a of answers) {
    broadcast(`answer/${a.id}/update`, { answer: a })
  }
}

export function broadcastTVScheduleUpdate() {
  broadcast('tv_schedule', {})
}

export function broadcastNewChartAnnotation(
  contractId: string,
  annotation: ChartAnnotation
) {
  broadcast(`contract/${contractId}/chart-annotation`, { annotation })
}

export function broadcastNotificationsRead(
  userId: string,
  notificationIds: string[]
) {
  broadcast(`user-notification-status/${userId}`, {
    type: 'marked_as_read',
    notificationIds,
  })
}
export function broadcastAllNotificationsRead(userId: string, since: number) {
  broadcast(`user-notification-status/${userId}`, {
    type: 'marked_as_seen',
    since,
  })
}

export function broadcastNewPendingClarification(
  contractId: string,
  clarification: PendingClarification
) {
  broadcast(`contract/${contractId}/pending-clarification`, { clarification })
}
