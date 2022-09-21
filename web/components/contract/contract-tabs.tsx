import { memo, useState } from 'react'
import { getOutcomeProbability } from 'common/calculate'
import { Pagination } from 'web/components/pagination'
import { FeedBet } from '../feed/feed-bets'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { FeedAnswerCommentGroup } from '../feed/feed-answer-comment-group'
import { FeedCommentThread, ContractCommentInput } from '../feed/feed-comments'
import { groupBy, sortBy } from 'lodash'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { PAST_BETS } from 'common/user'
import { ContractBetsTable, BetsSummary } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'
import { Col } from '../layout/col'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { useComments } from 'web/hooks/use-comments'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { useUser } from 'web/hooks/use-user'
import { capitalize } from 'lodash'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export function ContractTabs(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props

  const isMobile = useIsMobile()
  const user = useUser()
  const userBets =
    user && bets.filter((bet) => !bet.isAnte && bet.userId === user.id)

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
          content: <CommentsTabContent contract={contract} />,
        },
        {
          title: capitalize(PAST_BETS),
          content: <BetsTabContent contract={contract} bets={bets} />,
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
}) {
  const { contract } = props
  const tips = useTipTxns({ contractId: contract.id })
  const comments = useComments(contract.id)
  if (comments == null) {
    return <LoadingIndicator />
  }
  if (contract.outcomeType === 'FREE_RESPONSE') {
    const generalComments = comments.filter(
      (c) => c.answerOutcome === undefined && c.betId === undefined
    )
    const sortedAnswers = sortBy(
      contract.answers,
      (a) => -getOutcomeProbability(contract, a.id)
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
        <Col className="mt-8 flex w-full">
          <div className="text-md mt-8 mb-2 text-left">General Comments</div>
          <div className="mb-4 w-full border-b border-gray-200" />
          <ContractCommentInput className="mb-5" contract={contract} />
          {generalComments.map((comment) => (
            <FeedCommentThread
              key={comment.id}
              contract={contract}
              parentComment={comment}
              threadComments={[]}
              tips={tips}
            />
          ))}
        </Col>
      </>
    )
  } else {
    const commentsByParent = groupBy(comments, (c) => c.replyToCommentId ?? '_')
    const topLevelComments = commentsByParent['_'] ?? []
    return (
      <>
        <ContractCommentInput className="mb-5" contract={contract} />
        {sortBy(topLevelComments, (c) => -c.createdTime).map((parent) => (
          <FeedCommentThread
            key={parent.id}
            contract={contract}
            parentComment={parent}
            threadComments={sortBy(
              commentsByParent[parent.id] ?? [],
              (c) => c.createdTime
            )}
            tips={tips}
          />
        ))}
      </>
    )
  }
})

const BetsTabContent = memo(function BetsTabContent(props: {
  contract: Contract
  bets: Bet[]
}) {
  const { contract, bets } = props
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 50
  const start = page * ITEMS_PER_PAGE
  const end = start + ITEMS_PER_PAGE

  const lps = useLiquidity(contract.id) ?? []
  const visibleBets = bets.filter(
    (bet) => !bet.isAnte && !bet.isRedemption && bet.amount !== 0
  )
  const visibleLps = lps.filter(
    (l) =>
      !l.isAnte &&
      l.userId !== HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.userId !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.amount > 0
  )

  const items = [
    ...visibleBets.map((bet) => ({
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
})
