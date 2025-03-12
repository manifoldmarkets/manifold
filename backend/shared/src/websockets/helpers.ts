import { broadcast, broadcastMulti } from './server'
import { Bet, LimitBet } from 'common/bet'
import { Contract, Visibility } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { Answer } from 'common/answer'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { ContractMetric } from 'common/contract-metric'
import { groupBy } from 'lodash'

export function broadcastUpdatedPrivateUser(userId: string) {
  // don't send private user info because it's private and anyone can listen
  broadcast(`private-user/${userId}`, {})
}

export function broadcastUpdatedUser(user: Partial<User> & { id: string }) {
  broadcast(`user/${user.id}`, { user })
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
