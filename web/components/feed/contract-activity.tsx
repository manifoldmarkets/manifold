import { useState } from 'react'
import { Contract, FreeResponseContract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getOutcomeProbability } from 'common/calculate'
import { Pagination } from 'web/components/pagination'
import { FeedBet } from './feed-bets'
import { FeedLiquidity } from './feed-liquidity'
import { FeedAnswerCommentGroup } from './feed-answer-comment-group'
import { FeedCommentThread, ContractCommentInput } from './feed-comments'
import { User } from 'common/user'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { LiquidityProvision } from 'common/liquidity-provision'
import { groupBy, sortBy, uniq } from 'lodash'
import { Col } from 'web/components/layout/col'

export function ContractBetsActivity(props: {
  contract: Contract
  bets: Bet[]
  lps: LiquidityProvision[]
}) {
  const { contract, bets, lps } = props
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 50
  const start = page * ITEMS_PER_PAGE
  const end = start + ITEMS_PER_PAGE

  const items = [
    ...bets.map((bet) => ({
      type: 'bet' as const,
      id: bet.id + '-' + bet.isSold,
      bet,
    })),
    ...lps.map((lp) => ({
      type: 'liquidity' as const,
      id: lp.id,
      lp,
    })),
  ]

  const pageItems = sortBy(items, (item) =>
    item.type === 'bet'
      ? -item.bet.createdTime
      : item.type === 'liquidity'
      ? -item.lp.createdTime
      : undefined
  ).slice(start, end)

  return (
    <>
      <Col className="mb-4 gap-4">
        {pageItems.map((item) =>
          item.type === 'bet' ? (
            <FeedBet key={item.id} contract={contract} bet={item.bet} />
          ) : (
            <FeedLiquidity key={item.id} liquidity={item.lp} />
          )
        )}
      </Col>
      <Pagination
        page={page}
        itemsPerPage={50}
        totalItems={items.length}
        setPage={setPage}
        scrollToTop
        nextTitle={'Older'}
        prevTitle={'Newer'}
      />
    </>
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
  const betsByUserId = groupBy(bets, (bet) => bet.userId)
  const commentsByUserId = groupBy(comments, (c) => c.userId)
  const commentsByParentId = groupBy(comments, (c) => c.replyToCommentId ?? '_')
  const topLevelComments = sortBy(
    commentsByParentId['_'] ?? [],
    (c) => -c.createdTime
  )

  return (
    <>
      <ContractCommentInput
        className="mb-5"
        contract={contract}
        betsByCurrentUser={(user && betsByUserId[user.id]) ?? []}
        commentsByCurrentUser={(user && commentsByUserId[user.id]) ?? []}
      />
      {topLevelComments.map((parent) => (
        <FeedCommentThread
          key={parent.id}
          user={user}
          contract={contract}
          parentComment={parent}
          threadComments={sortBy(
            commentsByParentId[parent.id] ?? [],
            (c) => c.createdTime
          )}
          tips={tips}
          bets={bets}
          betsByUserId={betsByUserId}
          commentsByUserId={commentsByUserId}
        />
      ))}
    </>
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
  outcomes = sortBy(
    outcomes,
    (outcome) => -getOutcomeProbability(contract, outcome)
  )

  const answers = outcomes
    .map((outcome) => {
      return contract.answers.find((answer) => answer.id === outcome) as Answer
    })
    .filter((answer) => answer != null)

  const betsByUserId = groupBy(bets, (bet) => bet.userId)
  const commentsByUserId = groupBy(comments, (c) => c.userId)
  const commentsByOutcome = groupBy(comments, (c) => c.answerOutcome ?? '_')

  return (
    <>
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
            answerComments={sortBy(
              commentsByOutcome[answer.number.toString()] ?? [],
              (c) => c.createdTime
            )}
            tips={tips}
            betsByUserId={betsByUserId}
            commentsByUserId={commentsByUserId}
          />
        </div>
      ))}
    </>
  )
}
