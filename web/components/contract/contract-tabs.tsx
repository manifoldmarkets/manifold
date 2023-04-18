import { groupBy, last, sortBy } from 'lodash'
import { memo, useEffect, useMemo, useState } from 'react'

import { Answer } from 'common/answer'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { CPMMBinaryContract, Contract } from 'common/contract'
import { ShareholderStats } from 'common/supabase/contract-metrics'
import { buildArray } from 'common/util/array'
import { shortFormatNumber } from 'common/util/format'
import { MINUTE_MS } from 'common/util/time'
import { BinaryUserPositionsTable } from 'web/components/contract/user-positions-table'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Pagination } from 'web/components/widgets/pagination'
import { Tooltip } from 'web/components/widgets/tooltip'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { useComments } from 'web/hooks/use-comments'
import { useEvent } from 'web/hooks/use-event'
import { useHashInUrl } from 'web/hooks/use-hash-in-url'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useLiquidity } from 'web/hooks/use-liquidity'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useUser } from 'web/hooks/use-user'
import { getTotalBetCount } from 'web/lib/firebase/bets'
import { ContractMetricsByOutcome } from 'web/lib/firebase/contract-metrics'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import { track } from 'web/lib/service/analytics'
import { getOlderBets } from 'web/lib/supabase/bets'
import { ContractBetsTable } from '../bet/bets-list'
import { FreeResponseComments } from '../feed/feed-answer-comment-group'
import { FeedBet } from '../feed/feed-bets'
import { ContractCommentInput, FeedCommentThread } from '../feed/feed-comments'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ControlledTabs } from '../layout/tabs'
import { CertInfo, CertTrades } from './cert-overview'
import { QfTrades } from './qf-overview'

export const EMPTY_USER = '_'

export function ContractTabs(props: {
  contract: Contract
  bets: Bet[]
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  answerResponse?: Answer | undefined
  onCancelAnswerResponse?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  totalBets: number
  totalPositions: number
  shareholderStats?: ShareholderStats
}) {
  const {
    contract,
    bets,
    answerResponse,
    onCancelAnswerResponse,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
    totalBets,
    userPositionsByOutcome,
    shareholderStats,
  } = props
  const comments = useMemo(
    () =>
      props.comments.filter(
        (comment) => !blockedUserIds.includes(comment.userId)
      ),
    [props.comments, blockedUserIds]
  )
  const [totalPositions, setTotalPositions] = useState(props.totalPositions)
  const [totalComments, setTotalComments] = useState(comments.length)
  const [replyToBet, setReplyToBet] = useState<Bet | undefined>(undefined)
  useEffect(() => {
    if (replyToBet) setActiveIndex(0)
  }, [replyToBet])

  const commentTitle =
    totalComments === 0
      ? 'Comments'
      : `${shortFormatNumber(totalComments)} Comments`

  const user = useUser()

  const userBets = useRealtimeBets(
    {
      contractId: contract.id,
      userId: user === undefined ? 'loading' : user?.id ?? EMPTY_USER,
      filterAntes: true,
    },
    true
  )

  const betsTitle =
    totalBets === 0 ? 'Trades' : `${shortFormatNumber(totalBets)} Trades`

  const visibleUserBets = userBets.filter(
    (bet) => bet.amount !== 0 && !bet.isRedemption
  )

  const isMobile = useIsMobile()

  const yourBetsTitle =
    (visibleUserBets.length === 0 ? '' : `${visibleUserBets.length} `) +
    (isMobile ? 'You' : 'Your Trades')

  const positionsTitle = shortFormatNumber(totalPositions) + ' Positions'

  return (
    <ControlledTabs
      className="mb-4"
      currentPageForAnalytics={'contract'}
      activeIndex={activeIndex}
      onClick={(_title, i) => {
        setActiveIndex(i)
      }}
      tabs={buildArray(
        {
          title: commentTitle,
          content: (
            <CommentsTabContent
              contract={contract}
              comments={comments}
              setCommentsLength={setTotalComments}
              answerResponse={answerResponse}
              onCancelAnswerResponse={onCancelAnswerResponse}
              blockedUserIds={blockedUserIds}
              betResponse={replyToBet}
              clearReply={() => setReplyToBet(undefined)}
            />
          ),
        },

        totalBets > 0 &&
          contract.mechanism === 'cpmm-1' && {
            title: positionsTitle,
            content: (
              <BinaryUserPositionsTable
                positions={userPositionsByOutcome}
                contract={contract as CPMMBinaryContract}
                setTotalPositions={setTotalPositions}
                shareholderStats={shareholderStats}
              />
            ),
          },

        totalBets > 0 && {
          title: betsTitle,
          content: (
            <Col className={'gap-4'}>
              <BetsTabContent
                contract={contract}
                bets={bets}
                setReplyToBet={setReplyToBet}
              />
            </Col>
          ),
        },

        userBets.length > 0 && {
          title: yourBetsTitle,
          content: (
            <ContractBetsTable contract={contract} bets={userBets} isYourBets />
          ),
        },

        contract.outcomeType === 'CERT' && [
          { title: 'Trades', content: <CertTrades contract={contract} /> },
          { title: 'Positions', content: <CertInfo contract={contract} /> },
        ],

        contract.outcomeType === 'QUADRATIC_FUNDING' && [
          { title: 'History', content: <QfTrades contract={contract} /> },
        ]
      )}
    />
  )
}

const DEFAULT_PARENT_COMMENTS_TO_RENDER = 15
const LOAD_MORE = 20
export const CommentsTabContent = memo(function CommentsTabContent(props: {
  contract: Contract
  comments: ContractComment[]
  blockedUserIds: string[]
  setCommentsLength?: (length: number) => void
  onCancelAnswerResponse?: () => void
  answerResponse?: Answer
  betResponse?: Bet
  clearReply?: () => void
}) {
  const {
    contract,
    answerResponse,
    onCancelAnswerResponse,
    blockedUserIds,
    setCommentsLength,
    betResponse,
    clearReply,
  } = props
  const comments = (useComments(contract.id) ?? props.comments).filter(
    (c) => !blockedUserIds.includes(c.userId)
  )
  const [parentCommentsToRender, setParentCommentsToRender] = useState(
    DEFAULT_PARENT_COMMENTS_TO_RENDER
  )

  const [sort, setSort] = usePersistentState<'Newest' | 'Best'>('Newest', {
    key: `comments-sort-${contract.id}`,
    store: inMemoryStore(),
  })
  const likes = comments.some((c) => (c?.likes ?? 0) > 0)

  // replied to answers/comments are NOT newest, otherwise newest first
  const shouldBeNewestFirst = (c: ContractComment) =>
    c.replyToCommentId == undefined

  const user = useUser()
  const sortedComments = useMemo(
    () =>
      sortBy(comments, [
        sort === 'Best'
          ? (c) =>
              // Is this too magic? If there are likes, 'Best' shows your own comments made within the last 10 minutes first, then sorts by score
              likes &&
              c.createdTime > Date.now() - 10 * MINUTE_MS &&
              c.userId === user?.id &&
              shouldBeNewestFirst(c)
                ? -Infinity
                : -(c?.likes ?? 0)
          : (c) => c,
        (c) => (!shouldBeNewestFirst(c) ? c.createdTime : -c.createdTime),
      ]),
    [comments, sort, likes, user?.id]
  )

  const commentsByParent = useMemo(
    () => groupBy(sortedComments, (c) => c.replyToCommentId ?? '_'),
    [sortedComments]
  )
  const parentComments = commentsByParent['_'] ?? []
  const visibleCommentIds = useMemo(
    () =>
      parentComments
        .map((c) => [c.id, ...(commentsByParent[c.id] ?? []).map((c) => c.id)])
        .flat(),
    [comments.length]
  )
  const hashInUrl = useHashInUrl()
  useEffect(() => {
    if (hashInUrl) {
      const currentlyVisible = visibleCommentIds.includes(hashInUrl)
      if (!currentlyVisible) setParentCommentsToRender(comments.length)
    }
    setCommentsLength?.(comments.length)
  }, [hashInUrl, comments.length])

  const loadMore = () => setParentCommentsToRender((prev) => prev + LOAD_MORE)
  const onVisibilityUpdated = useEvent((visible: boolean) => {
    if (visible) loadMore()
  })

  return (
    <>
      {user && (
        <ContractCommentInput
          replyToBet={betResponse}
          replyToUserInfo={
            betResponse
              ? {
                  username: betResponse.userUsername,
                  id: betResponse.userId,
                }
              : undefined
          }
          className="mb-5"
          contract={contract}
          clearReply={clearReply}
        />
      )}
      {comments.length > 0 && (
        <SortRow
          sort={sort}
          onSortClick={() => {
            setSort(sort === 'Newest' ? 'Best' : 'Newest')
            track('change-comments-sort', {
              contractSlug: contract.slug,
              contractName: contract.question,
              totalComments: comments.length,
              totalUniqueTraders: contract.uniqueBettorCount,
            })
          }}
        />
      )}
      <div className={'mt-2'} />
      {contract.outcomeType === 'FREE_RESPONSE' && (
        <FreeResponseComments
          contract={contract}
          answerResponse={answerResponse}
          onCancelAnswerResponse={onCancelAnswerResponse}
          topLevelComments={parentComments.slice(0, parentCommentsToRender)}
          commentsByParent={commentsByParent}
        />
      )}
      {contract.outcomeType !== 'FREE_RESPONSE' &&
        parentComments
          .slice(0, parentCommentsToRender)
          .map((parent) => (
            <FeedCommentThread
              key={parent.id}
              contract={contract}
              parentComment={parent}
              threadComments={commentsByParent[parent.id] ?? []}
            />
          ))}
      <div className="relative w-full">
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="pointer-events-none absolute bottom-0 h-[75vh]"
        />
      </div>
    </>
  )
})

const BetsTabContent = memo(function BetsTabContent(props: {
  contract: Contract
  bets: Bet[]
  setReplyToBet?: (bet: Bet) => void
}) {
  const { contract, setReplyToBet } = props
  const [bets, setBets] = useState(() => props.bets.filter((b) => !b.isAnte))
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 50
  const oldestBet = last(bets)
  const start = page * ITEMS_PER_PAGE
  const end = start + ITEMS_PER_PAGE

  useEffect(() => {
    const newBets = props.bets.filter(
      (b) => b.createdTime > (bets[0]?.createdTime ?? 0)
    )
    if (newBets.length > 0) setBets([...newBets, ...bets])
  }, [props.bets])

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
      id: 'bets-tab-' + bet.id + '-' + (bet.isSold ?? 'false'),
      bet,
    })),
    ...visibleLps.map((lp) => ({
      type: 'liquidity' as const,
      id: lp.id,
      lp,
    })),
  ]
  const [totalItems, setTotalItems] = useState(items.length)

  useEffect(() => {
    const willNeedMoreBets = totalItems % ITEMS_PER_PAGE === 0
    if (!willNeedMoreBets) return
    getTotalBetCount(contract.id).then((totalBetCount) => {
      setTotalItems(totalBetCount + visibleLps.length)
    })
  }, [contract.id, totalItems, visibleLps.length])

  const limit = (items.length - (page + 1) * ITEMS_PER_PAGE) * -1
  const shouldLoadMore = limit > 0 && bets.length < totalItems
  const oldestBetTime = oldestBet?.createdTime ?? contract.createdTime
  useEffect(() => {
    if (!shouldLoadMore) return
    getOlderBets(contract.id, oldestBetTime, limit)
      .then((olderBets) => {
        setBets((bets) => [...bets, ...olderBets])
      })
      .catch((err) => {
        console.error(err)
      })
  }, [contract.id, limit, oldestBetTime, shouldLoadMore])

  const pageItems = sortBy(items, (item) =>
    item.type === 'bet'
      ? -item.bet.createdTime
      : item.type === 'liquidity'
      ? -item.lp.createdTime
      : undefined
  ).slice(start, end)

  return (
    <>
      <Col className="mb-4 items-start gap-7">
        {shouldLoadMore ? (
          <LoadingIndicator />
        ) : (
          pageItems.map((item) =>
            item.type === 'bet' ? (
              <FeedBet
                onReply={setReplyToBet}
                key={item.id}
                contract={contract}
                bet={item.bet}
              />
            ) : (
              <FeedLiquidity key={item.id} liquidity={item.lp} />
            )
          )
        )}
      </Col>
      <Pagination
        page={page}
        itemsPerPage={ITEMS_PER_PAGE}
        totalItems={totalItems}
        setPage={setPage}
        scrollToTop
      />
    </>
  )
})

export function SortRow(props: { sort: string; onSortClick: () => void }) {
  const { sort, onSortClick } = props
  return (
    <Row className="items-center justify-end gap-4">
      <Row className="items-center gap-1">
        <span className="text-ink-400 text-sm">Sort by:</span>
        <button className="text-ink-600 w-20 text-sm" onClick={onSortClick}>
          <Tooltip text={sort === 'Best' ? 'Most likes first' : ''}>
            <Row className="items-center gap-1">
              {sort}
              <TriangleDownFillIcon className=" h-2 w-2" />
            </Row>
          </Tooltip>
        </button>
      </Row>
    </Row>
  )
}
