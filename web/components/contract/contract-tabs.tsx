import { memo, useState } from 'react'
import { getOutcomeProbability } from 'common/calculate'
import { Pagination } from 'web/components/pagination'
import { FeedBet } from '../feed/feed-bets'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { FeedAnswerCommentGroup } from '../feed/feed-answer-comment-group'
import { FeedCommentThread, ContractCommentInput } from '../feed/feed-comments'
import { groupBy, sortBy, sum } from 'lodash'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { PAST_BETS } from 'common/user'
import { ContractBetsTable } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'
import { Col } from '../layout/col'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { useComments } from 'web/hooks/use-comments'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { capitalize } from 'lodash'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { buildArray } from 'common/util/array'
import { ContractComment } from 'common/comment'

import { Button } from 'web/components/button'
import { MINUTE_MS } from 'common/util/time'
import { useUser } from 'web/hooks/use-user'
import { Tooltip } from 'web/components/tooltip'
import { BountiedContractSmallBadge } from 'web/components/contract/bountied-contract-badge'
import { Row } from '../layout/row'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'

export function ContractTabs(props: {
  contract: Contract
  bets: Bet[]
  userBets: Bet[]
  comments: ContractComment[]
}) {
  const { contract, bets, userBets, comments } = props

  const yourTrades = (
    <div>
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets} isYourBets />
      <Spacer h={12} />
    </div>
  )

  const tabs = buildArray(
    {
      title: 'Comments',
      content: <CommentsTabContent contract={contract} comments={comments} />,
    },
    bets.length > 0 && {
      title: capitalize(PAST_BETS),
      content: <BetsTabContent contract={contract} bets={bets} />,
    },
    userBets.length > 0 && {
      title: 'Your trades',
      content: yourTrades,
    }
  )

  return (
    <Tabs className="mb-4" currentPageForAnalytics={'contract'} tabs={tabs} />
  )
}

const CommentsTabContent = memo(function CommentsTabContent(props: {
  contract: Contract
  comments: ContractComment[]
}) {
  const { contract } = props
  const tips = useTipTxns({ contractId: contract.id })
  const comments = useComments(contract.id) ?? props.comments
  const [sort, setSort] = usePersistentState<'Newest' | 'Best'>('Newest', {
    key: `contract-${contract.id}-comments-sort`,
    store: storageStore(safeLocalStorage()),
  })
  const me = useUser()

  if (comments == null) {
    return <LoadingIndicator />
  }

  const tipsOrBountiesAwarded =
    Object.keys(tips).length > 0 || comments.some((c) => c.bountiesAwarded)

  const sortedComments = sortBy(comments, (c) =>
    sort === 'Newest'
      ? c.createdTime
      : // Is this too magic? If there are tips/bounties, 'Best' shows your own comments made within the last 10 minutes first, then sorts by score
      tipsOrBountiesAwarded &&
        c.createdTime > Date.now() - 10 * MINUTE_MS &&
        c.userId === me?.id
      ? -Infinity
      : -((c.bountiesAwarded ?? 0) + sum(Object.values(tips[c.id] ?? [])))
  )

  const commentsByParent = groupBy(
    sortedComments,
    (c) => c.replyToCommentId ?? '_'
  )
  const topLevelComments = commentsByParent['_'] ?? []
  // Top level comments are reverse-chronological, while replies are chronological
  if (sort === 'Newest') topLevelComments.reverse()

  if (contract.outcomeType === 'FREE_RESPONSE') {
    const sortedAnswers = sortBy(
      contract.answers,
      (a) => -getOutcomeProbability(contract, a.id)
    )
    const commentsByOutcome = groupBy(
      comments,
      (c) => c.answerOutcome ?? c.betOutcome ?? '_'
    )
    const generalTopLevelComments = topLevelComments.filter(
      (c) => c.answerOutcome === undefined && c.betId === undefined
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
          {generalTopLevelComments.map((comment) => (
            <FeedCommentThread
              key={comment.id}
              contract={contract}
              parentComment={comment}
              threadComments={commentsByParent[comment.id] ?? []}
              tips={tips}
            />
          ))}
        </Col>
      </>
    )
  } else {
    // TODO: links to comments are broken because tips load after render and
    //  comments will reorganize themselves if there are tips/bounties awarded
    const tipsOrBountiesAwarded =
      Object.keys(tips).length > 0 || comments.some((c) => c.bountiesAwarded)

    const commentsByParent = groupBy(
      sortBy(comments, (c) =>
        sort === 'Newest'
          ? -c.createdTime
          : // Is this too magic? If there are tips/bounties, 'Best' shows your own comments made within the last 10 minutes first, then sorts by score
          tipsOrBountiesAwarded &&
            c.createdTime > Date.now() - 10 * MINUTE_MS &&
            c.userId === me?.id
          ? -Infinity
          : -((c.bountiesAwarded ?? 0) + sum(Object.values(tips[c.id] ?? [])))
      ),
      (c) => c.replyToCommentId ?? '_'
    )

    const topLevelComments = commentsByParent['_'] ?? []
    return (
      <>
        <ContractCommentInput className="mb-5" contract={contract} />

        {comments.length > 0 && (
          <Row className="mb-4 items-center">
            <Button
              size={'xs'}
              color={'gray-white'}
              onClick={() => setSort(sort === 'Newest' ? 'Best' : 'Newest')}
            >
              <Tooltip
                text={
                  sort === 'Best'
                    ? 'Highest tips + bounties first. Your new comments briefly appear to you first.'
                    : ''
                }
              >
                Sort by: {sort}
              </Tooltip>
            </Button>

            <BountiedContractSmallBadge contract={contract} showAmount />
          </Row>
        )}

        {topLevelComments.map((parent) => (
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
