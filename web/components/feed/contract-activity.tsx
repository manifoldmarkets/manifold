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
  mode: 'only-recent' | 'abbreviated' | 'all'
  filterToOutcome?: string // Which multi-category outcome to filter
  className?: string
  betRowClassName?: string
}) {
  const { contract, user, filterToOutcome, mode, className, betRowClassName } =
    props

  const updatedComments =
    // eslint-disable-next-line react-hooks/rules-of-hooks
    mode === 'only-recent' ? undefined : useComments(contract.id)
  const comments = updatedComments ?? props.comments

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updatedBets = mode === 'only-recent' ? undefined : useBets(contract.id)
  const bets = updatedBets ?? props.bets

  const items =
    mode === 'only-recent'
      ? getRecentContractActivityItems(contract, bets, comments, user)
      : getAllContractActivityItems(
          contract,
          bets,
          comments,
          user,
          filterToOutcome,
          { abbreviated: mode === 'abbreviated' }
        )

  return (
    <FeedItems
      contract={contract}
      user={user}
      items={items}
      className={className}
      betRowClassName={betRowClassName}
    />
  )
}
