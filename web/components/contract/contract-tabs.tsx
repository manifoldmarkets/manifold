import { memo, useState } from 'react'
import { getOutcomeProbability } from 'common/calculate'
import { Pagination } from 'web/components/pagination'
import { FeedBet } from '../feed/feed-bets'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { FeedAnswerCommentGroup } from '../feed/feed-answer-comment-group'
import { FeedCommentThread, ContractCommentInput } from '../feed/feed-comments'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { groupBy, sortBy } from 'lodash'
import { Bet } from 'common/bet'
import { Contract, FreeResponseContract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { PAST_BETS, User } from 'common/user'
import { ContractBetsTable, BetsSummary } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'
import { Col } from '../layout/col'
import { useComments } from 'web/hooks/use-comments'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { capitalize } from 'lodash'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export function ContractTabs(props: {
  contract: Contract
  user: User | null | undefined
  bets: Bet[]
  comments: ContractComment[]
}) {
  const { contract, user, bets, comments } = props

  const isMobile = useIsMobile()

  const userBets =
    user && bets.filter((bet) => !bet.isAnte && bet.userId === user.id)
  const visibleBets = bets.filter(
    (bet) => !bet.isAnte && !bet.isRedemption && bet.amount !== 0
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
          content: (
            <CommentsTabContent contract={contract} comments={comments} />
          ),
        },
        {
          title: capitalize(PAST_BETS),
          content: (
            <ContractBetsActivity contract={contract} bets={visibleBets} />
          ),
        },
        ...(!user || !userBets?.length
          ? []
          : [
              {
                title: isMobile ? `You` : `Your ${PAST_BETS}`,
                content: yourTrades,
              },
            ]),
      ]}
    />
  )
}

const CommentsTabContent = memo(function CommentsTabContent(props: {
  contract: Contract
  comments: ContractComment[]
}) {
  const { contract, comments } = props
  const tips = useTipTxns({ contractId: contract.id })
  const updatedComments = useComments(contract.id) ?? comments
  if (contract.outcomeType === 'FREE_RESPONSE') {
    return (
      <>
        <FreeResponseContractCommentsActivity
          contract={contract}
          comments={updatedComments}
          tips={tips}
        />
        <Col className="mt-8 flex w-full">
          <div className="text-md mt-8 mb-2 text-left">General Comments</div>
          <div className="mb-4 w-full border-b border-gray-200" />
          <ContractCommentsActivity
            contract={contract}
            comments={updatedComments.filter(
              (comment) =>
                comment.answerOutcome === undefined &&
                comment.betId === undefined
            )}
            tips={tips}
          />
        </Col>
      </>
    )
  } else {
    return (
      <ContractCommentsActivity
        contract={contract}
        comments={comments}
        tips={tips}
      />
    )
  }
})

function ContractBetsActivity(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 50
  const start = page * ITEMS_PER_PAGE
  const end = start + ITEMS_PER_PAGE

  const lps = useLiquidity(contract.id) ?? []
  const visibleLps = lps.filter(
    (l) =>
      !l.isAnte &&
      l.userId !== HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.userId !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.amount > 0
  )

  const items = [
    ...bets.map((bet) => ({
      type: 'bet' as const,
      id: bet.id + '-' + bet.isSold,
      bet,
    })),
    ...visibleLps.map((lp) => ({
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

function ContractCommentsActivity(props: {
  contract: Contract
  comments: ContractComment[]
  tips: CommentTipMap
}) {
  const { contract, comments, tips } = props
  const commentsByParentId = groupBy(comments, (c) => c.replyToCommentId ?? '_')
  const topLevelComments = sortBy(
    commentsByParentId['_'] ?? [],
    (c) => -c.createdTime
  )

  return (
    <>
      <ContractCommentInput className="mb-5" contract={contract} />
      {topLevelComments.map((parent) => (
        <FeedCommentThread
          key={parent.id}
          contract={contract}
          parentComment={parent}
          threadComments={sortBy(
            commentsByParentId[parent.id] ?? [],
            (c) => c.createdTime
          )}
          tips={tips}
        />
      ))}
    </>
  )
}

function FreeResponseContractCommentsActivity(props: {
  contract: FreeResponseContract
  comments: ContractComment[]
  tips: CommentTipMap
}) {
  const { contract, comments, tips } = props

  const sortedAnswers = sortBy(
    contract.answers,
    (answer) => -getOutcomeProbability(contract, answer.number.toString())
  )
  const commentsByOutcome = groupBy(
    comments,
    (c) => c.answerOutcome ?? c.betOutcome ?? '_'
  )

  return (
    <>
      {sortedAnswers.map((answer) => (
        <div key={answer.id} className="relative pb-4">
          <span
            className="absolute top-5 left-5 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
            aria-hidden="true"
          />
          <FeedAnswerCommentGroup
            contract={contract}
            answer={answer}
            answerComments={sortBy(
              commentsByOutcome[answer.number.toString()] ?? [],
              (c) => c.createdTime
            )}
            tips={tips}
          />
        </div>
      ))}
    </>
  )
}
