import { Contract } from 'web/lib/firebase/contracts'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'
import { useBets } from 'web/hooks/use-bets'
import { getSpecificContractActivityItems } from './activity-items'
import { FeedItems } from './feed-items'
import { FeedBet } from './feed-bets'
import { FeedLiquidity } from './feed-liquidity'
import { User } from 'common/user'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { LiquidityProvision } from 'common/liquidity-provision'
import { sortBy } from 'lodash'
import { Col } from 'web/components/layout/col'

export function ContractBetsActivity(props: {
  contract: Contract
  bets: Bet[]
  liquidityProvisions: LiquidityProvision[]
}) {
  const { contract, bets, liquidityProvisions } = props

  // Remove first bet (which is the ante):
  const displayedBets =
    contract.outcomeType === 'FREE_RESPONSE' ? bets.slice(1) : bets

  const items = [
    ...displayedBets.map((bet) => ({
      type: 'bet' as const,
      id: bet.id + '-' + bet.isSold,
      bet,
    })),
    ...liquidityProvisions.map((liquidity) => ({
      type: 'liquidity' as const,
      id: liquidity.id,
      liquidity,
    })),
  ]

  const sortedItems = sortBy(items, (item) =>
    item.type === 'bet'
      ? -item.bet.createdTime
      : item.type === 'liquidity'
      ? -item.liquidity.createdTime
      : undefined
  )

  return (
    <Col className="gap-4">
      {sortedItems.map((item) =>
        item.type === 'bet' ? (
          <FeedBet key={item.id} contract={contract} bet={item.bet} />
        ) : (
          <FeedLiquidity key={item.id} liquidity={item.liquidity} />
        )
      )}
    </Col>
  )
}

export function ContractActivity(props: {
  contract: Contract
  bets: Bet[]
  comments: ContractComment[]
  tips: CommentTipMap
  user: User | null | undefined
  mode: 'comments' | 'free-response-comment-answer-groups'
  contractPath?: string
  className?: string
  betRowClassName?: string
}) {
  const { user, mode, tips, className, betRowClassName } = props

  const contract = useContractWithPreload(props.contract) ?? props.contract
  const comments = props.comments
  const updatedBets = useBets(contract.id, {
    filterChallenges: false,
    filterRedemptions: true,
  })
  const bets = (updatedBets ?? props.bets).filter(
    (bet) => !bet.isRedemption && bet.amount !== 0
  )
  const items = getSpecificContractActivityItems(
    contract,
    bets,
    comments,
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
