import { broadcast, broadcastMulti } from './server'
import { Bet, LimitBet } from 'common/bet'
import { Contract, Visibility } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { Answer } from 'common/answer'

type ContractChange = Partial<Contract> & { id: string }

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
  contract: ContractChange
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

export function broadcastUpdatedAnswer(answer: Answer) {
  const payload = { answer }
  const topics = [`contract/${answer.contractId}/updated-answer`]
  // TODO: broadcast to global
  broadcastMulti(topics, payload)
}
