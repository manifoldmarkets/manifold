import { Contract } from 'web/lib/firebase/contracts'
import { Comment } from 'web/lib/firebase/comments'
import { Bet } from 'common/bet'
import { useBets } from 'web/hooks/use-bets'
import { useComments } from 'web/hooks/use-comments'
import { getSpecificContractActivityItems } from './activity-items'
import { FeedItems } from './feed-items'
import { User } from 'common/user'
import { useContractWithPreload } from 'web/hooks/use-contract'

export function ContractActivity(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  user: User | null | undefined
  mode: 'comments' | 'bets' | 'free-response-comment-answer-groups'
  contractPath?: string
  className?: string
  betRowClassName?: string
}) {
  const { user, mode, className, betRowClassName } = props

  const contract = useContractWithPreload(props.contract) ?? props.contract

  const updatedComments = useComments(contract.id)
  const comments = updatedComments ?? props.comments

  const updatedBets = useBets(contract.id)
  const bets = (updatedBets ?? props.bets).filter((bet) => !bet.isRedemption)
  const items = getSpecificContractActivityItems(
    contract,
    bets,
    comments,
    user,
    { mode }
  )

  return (
    <FeedItems
      contract={contract}
      items={items}
      className={className}
      betRowClassName={betRowClassName}
    />
  )
}
