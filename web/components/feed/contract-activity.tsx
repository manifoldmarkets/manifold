import { Contract } from '../../lib/firebase/contracts'
import { Comment } from '../../lib/firebase/comments'
import { Bet } from '../../../common/bet'
import { useBets } from '../../hooks/use-bets'
import { useComments } from '../../hooks/use-comments'
import {
  getAllContractActivityItems,
  getRecentContractActivityItems,
  getSpecificContractActivityItems,
} from './activity-items'
import { FeedItems } from './feed-items'
import { User } from '../../../common/user'

export function ContractActivity(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  user: User | null | undefined
  mode: 'only-recent' | 'abbreviated' | 'all' | 'comments' | 'bets'
  contractPath?: string
  className?: string
  betRowClassName?: string
}) {
  const { contract, user, mode, contractPath, className, betRowClassName } =
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
      ? getRecentContractActivityItems(contract, bets, comments, user, {
          contractPath,
        })
      : mode === 'comments' || mode === 'bets'
      ? getSpecificContractActivityItems(contract, bets, comments, user, {
          mode,
        })
      : getAllContractActivityItems(contract, bets, comments, user, {
          abbreviated: mode === 'abbreviated',
        })

  return (
    <FeedItems
      contract={contract}
      items={items}
      className={className}
      betRowClassName={betRowClassName}
    />
  )
}
