import { Contract } from 'web/lib/firebase/contracts'
import { Comment } from 'web/lib/firebase/comments'
import { Bet } from 'common/bet'
import { useBets } from 'web/hooks/use-bets'
import { getSpecificContractActivityItems } from './activity-items'
import { FeedItems } from './feed-items'
import { User } from 'common/user'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { LiquidityProvision } from 'common/liquidity-provision'

export function ContractActivity(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  liquidityProvisions: LiquidityProvision[]
  tips: CommentTipMap
  user: User | null | undefined
  mode: 'comments' | 'bets' | 'free-response-comment-answer-groups'
  contractPath?: string
  className?: string
  betRowClassName?: string
}) {
  const { user, mode, tips, className, betRowClassName, liquidityProvisions } =
    props

  const contract = useContractWithPreload(props.contract) ?? props.contract
  const comments = props.comments
  const updatedBets = useBets(contract.id)
  const bets = (updatedBets ?? props.bets).filter(
    (bet) => !bet.isRedemption && bet.amount !== 0
  )
  const items = getSpecificContractActivityItems(
    contract,
    bets,
    comments,
    liquidityProvisions,
    tips,
    user,
    { mode }
  )

  return (
    <FeedItems
      contract={contract}
      items={items}
      className={className}
      betRowClassName={betRowClassName}
      user={user}
    />
  )
}
