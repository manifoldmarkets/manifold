import { Contract, FreeResponseContract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getOutcomeProbability } from 'common/calculate'
import { FeedBet } from './feed-bets'
import { FeedLiquidity } from './feed-liquidity'
import { FeedAnswerCommentGroup } from './feed-answer-comment-group'
import { FeedCommentThread, CommentInput } from './feed-comments'
import { User } from 'common/user'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { LiquidityProvision } from 'common/liquidity-provision'
import { sortBy, uniq } from 'lodash'
import { Col } from 'web/components/layout/col'

export function ContractBetsActivity(props: {
  contract: Contract
  bets: Bet[]
  liquidityProvisions: LiquidityProvision[]
}) {
  const { contract, bets, liquidityProvisions } = props

  const items = [
    ...bets.map((bet) => ({
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

export function ContractCommentsActivity(props: {
  contract: Contract
  bets: Bet[]
  comments: ContractComment[]
  tips: CommentTipMap
  user: User | null | undefined
}) {
  const { bets, contract, comments, user, tips } = props

  const nonFreeResponseComments = comments.filter(
    (comment) =>
      comment.answerOutcome === undefined &&
      (contract.outcomeType === 'FREE_RESPONSE'
        ? comment.betId === undefined
        : true)
  )
  const nonFreeResponseBets =
    contract.outcomeType === 'FREE_RESPONSE' ? [] : bets

  const betsByCurrentUser = nonFreeResponseBets.filter(
    (bet) => bet.userId === user?.id
  )
  const commentsByCurrentUser = nonFreeResponseComments.filter(
    (comment) => comment.userId === user?.id
  )

  const parentComments = comments.filter((comment) => !comment.replyToCommentId)

  return (
    <div>
      <CommentInput
        contract={contract}
        betsByCurrentUser={betsByCurrentUser}
        commentsByCurrentUser={commentsByCurrentUser}
      />
      {parentComments.map((parent, idx) => (
        <div key={parent.id} className={'relative pb-4'}>
          {idx !== parentComments.length - 1 ? (
            <span
              className="absolute top-5 left-5 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
              aria-hidden="true"
            />
          ) : null}
          <FeedCommentThread
            contract={contract}
            parentComment={parent}
            comments={comments}
            tips={tips}
            bets={bets}
          />
        </div>
      ))}
    </div>
  )
}

export function FreeResponseContractCommentsActivity(props: {
  contract: FreeResponseContract
  bets: Bet[]
  comments: ContractComment[]
  tips: CommentTipMap
  user: User | null | undefined
}) {
  const { bets, contract, comments, user, tips } = props

  let outcomes = uniq(bets.map((bet) => bet.outcome))
  outcomes = sortBy(outcomes, (outcome) =>
    getOutcomeProbability(contract, outcome)
  )

  const answers = outcomes
    .map((outcome) => {
      return contract.answers.find((answer) => answer.id === outcome) as Answer
    })
    .filter((answer) => answer != null)

  return (
    <div>
      {answers.map((answer) => (
        <div key={answer.id} className={'relative pb-4'}>
          <span
            className="absolute top-5 left-5 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
            aria-hidden="true"
          />
          <FeedAnswerCommentGroup
            contract={contract}
            user={user}
            answer={answer}
            comments={comments}
            tips={tips}
            bets={bets}
          />
        </div>
      ))}
    </div>
  )
}
