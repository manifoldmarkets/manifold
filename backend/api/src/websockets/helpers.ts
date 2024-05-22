import { broadcast } from './server'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'

export function broadcastNewBets(
  contract: Contract,
  creator: User,
  bets: Bet[]
) {
  const payload = { contract, creator, bets }
  if (contract.visibility === 'public') {
    broadcast('global/new-bet', payload)
  }
  broadcast(`contract/${contract.id}/new-bet`, payload)
}

export function broadcastNewComment(
  contract: Contract,
  creator: User,
  comment: ContractComment
) {
  const payload = { contract, creator, comment }
  if (contract.visibility === 'public') {
    broadcast('global/new-comment', payload)
  }
  broadcast(`contract/${contract.id}/new-comment`, payload)
}

export function broadcastNewContract(contract: Contract, creator: User) {
  const payload = { contract, creator }
  if (contract.visibility === 'public') {
    broadcast('global/new-contract', payload)
  }
}

export function broadcastNewSubsidy(contract: Contract, amount: number) {
  const payload = { contract, amount }
  if (contract.visibility === 'public') {
    broadcast('global/new-subsidy', payload)
  }
  broadcast(`contract/${contract.id}/new-subsidy`, payload)
}
