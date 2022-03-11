import _ from 'lodash'

import { Contract } from '../../lib/firebase/contracts'
import { Comment } from '../../lib/firebase/comments'
import { Bet } from '../../../common/bet'
import { useBets } from '../../hooks/use-bets'
import { useComments } from '../../hooks/use-comments'
import {
  getAllContractActivityItems,
  getRecentContractActivityItems,
} from './activity-items'
import { FeedItems } from './feed-items'
import { User } from '../../../common/user'

export function ContractActivity(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  user: User | null | undefined
  outcome?: string // Which multi-category outcome to filter
  abbreviated?: boolean
  betRowClassName?: string
}) {
  const { contract, user, outcome, abbreviated, betRowClassName } = props

  const comments = useComments(contract.id) ?? props.comments
  const bets = useBets(contract.id) ?? props.bets

  let items = getAllContractActivityItems(
    contract,
    bets,
    comments,
    user,
    outcome
  )

  if (abbreviated) {
    items = [items[0], ...items.slice(-3)]
  }

  return (
    <FeedItems
      contract={contract}
      items={items}
      feedType={abbreviated ? 'activity' : 'market'}
      betRowClassName={betRowClassName}
      outcome={outcome}
    />
  )
}

export function RecentContractActivity(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  user: User | null | undefined
  betRowClassName?: string
}) {
  const { contract, bets, comments, user, betRowClassName } = props

  const items = getRecentContractActivityItems(contract, bets, comments, user)

  return (
    <FeedItems
      contract={contract}
      items={items}
      feedType="activity"
      betRowClassName={betRowClassName}
    />
  )
}
