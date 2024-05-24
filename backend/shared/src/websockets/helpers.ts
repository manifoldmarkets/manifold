import { broadcast, broadcastMulti } from './server'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'

export function broadcastNewBets(contract: Contract, bets: Bet[]) {
  const contractTopic = `contract/${contract.id}`
  broadcastMulti([contractTopic, `${contractTopic}/new-bet`], { bets })

  if (contract.visibility === 'public') {
    broadcastMulti(['global', 'global/new-bet'], { contract, bets })
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
  contract: Contract,
  creator: User,
  comment: ContractComment
) {
  const payload = { contract, creator, comment }
  const contractTopic = `contract/${contract.id}`
  const topics = [contractTopic, `${contractTopic}/new-comment`]
  if (contract.visibility === 'public') {
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

export function broadcastNewSubsidy(contract: Contract, amount: number) {
  const payload = { contract, amount }
  const contractTopic = `contract/${contract.id}`
  const topics = [contractTopic, `${contractTopic}/new-subsidy`]
  if (contract.visibility === 'public') {
    topics.push('global', 'global/new-subsidy')
  }
  broadcastMulti(topics, payload)
}

export function broadcastUpdatedContract(contract: Contract) {
  const payload = { contract }
  const contractTopic = `contract/${contract.id}`
  const topics = [contractTopic, `${contractTopic}/updated-metadata`]
  broadcastMulti(topics, payload)
}
