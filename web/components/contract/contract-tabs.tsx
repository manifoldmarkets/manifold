import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { ContractActivity } from '../feed/contract-activity'
import { ContractBetsTable, BetsSummary } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'
import { Col } from '../layout/col'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { useComments } from 'web/hooks/use-comments'
import { useLiquidity } from 'web/hooks/use-liquidity'

export function ContractTabs(props: {
  contract: Contract
  user: User | null | undefined
  bets: Bet[]
  comments: ContractComment[]
  tips: CommentTipMap
}) {
  const { contract, user, bets, tips } = props
  const { outcomeType } = contract

  const userBets = user && bets.filter((bet) => bet.userId === user.id)
  const visibleBets = bets.filter(
    (bet) => !bet.isAnte && !bet.isRedemption && bet.amount !== 0
  )

  const liquidityProvisions =
    useLiquidity(contract.id)?.filter((l) => !l.isAnte && l.amount > 0) ?? []

  // Load comments here, so the badge count will be correct
  const updatedComments = useComments(contract.id)
  const comments = updatedComments ?? props.comments

  const betActivity = (
    <ContractActivity
      contract={contract}
      bets={bets}
      liquidityProvisions={liquidityProvisions}
      comments={comments}
      tips={tips}
      user={user}
      mode="bets"
      betRowClassName="!mt-0 xl:hidden"
    />
  )

  const commentActivity = (
    <>
      <ContractActivity
        contract={contract}
        bets={bets}
        liquidityProvisions={liquidityProvisions}
        comments={comments}
        tips={tips}
        user={user}
        mode={
          contract.outcomeType === 'FREE_RESPONSE'
            ? 'free-response-comment-answer-groups'
            : 'comments'
        }
        betRowClassName="!mt-0 xl:hidden"
      />
      {outcomeType === 'FREE_RESPONSE' && (
        <Col className={'mt-8 flex w-full '}>
          <div className={'text-md mt-8 mb-2 text-left'}>General Comments</div>
          <div className={'mb-4 w-full border-b border-gray-200'} />
          <ContractActivity
            contract={contract}
            bets={bets}
            liquidityProvisions={liquidityProvisions}
            comments={comments}
            tips={tips}
            user={user}
            mode={'comments'}
            betRowClassName="!mt-0 xl:hidden"
          />
        </Col>
      )}
    </>
  )

  const yourTrades = (
    <div>
      <BetsSummary
        className="px-2"
        contract={contract}
        bets={userBets ?? []}
        isYourBets
      />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets ?? []} isYourBets />
      <Spacer h={12} />
    </div>
  )

  return (
    <Tabs
      currentPageForAnalytics={'contract'}
      tabs={[
        {
          title: 'Comments',
          content: commentActivity,
          badge: `${comments.length}`,
        },
        { title: 'Bets', content: betActivity, badge: `${visibleBets.length}` },
        ...(!user || !userBets?.length
          ? []
          : [{ title: 'Your bets', content: yourTrades }]),
      ]}
    />
  )
}
