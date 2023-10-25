import { groupBy, keyBy, last, mapValues, sortBy, sumBy } from 'lodash'
import { memo, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { Answer, DpmAnswer } from 'common/answer'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { CPMMBinaryContract, Contract } from 'common/contract'
import { buildArray } from 'common/util/array'
import { shortFormatNumber } from 'common/util/format'
import { MINUTE_MS } from 'common/util/time'
import { BinaryUserPositionsTable } from 'web/components/contract/user-positions-table'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Pagination } from 'web/components/widgets/pagination'
import { Tooltip } from 'web/components/widgets/tooltip'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useEvent } from 'web/hooks/use-event'
import { useHashInUrl } from 'web/hooks/use-hash-in-url'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useUser } from 'web/hooks/use-user'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import { track, withTracking } from 'web/lib/service/analytics'
import { getOlderBets } from 'web/lib/supabase/bets'
import { FeedBet } from '../feed/feed-bets'
import { ContractCommentInput, FeedCommentThread } from '../feed/feed-comments'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ControlledTabs } from '../layout/tabs'
import { ContractMetricsByOutcome } from 'common/contract-metric'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { Button } from '../buttons/button'
import { firebaseLogin } from 'web/lib/firebase/users'
import { ArrowRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useRealtimeCommentsOnContract } from 'web/hooks/use-comments-supabase'

export const EMPTY_USER = '_'

export function ContractTabs(props: {
  contract: Contract
  bets: Bet[]
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  replyTo?: Answer | DpmAnswer | Bet
  setReplyTo?: (replyTo?: Answer | DpmAnswer | Bet) => void
  cancelReplyToAnswer?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  totalBets: number
  totalPositions: number
}) {
  const {
    contract,
    comments,
    bets,
    replyTo,
    setReplyTo,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
    totalBets,
    userPositionsByOutcome,
  } = props

  const [totalPositions, setTotalPositions] = useState(props.totalPositions)
  const [totalComments, setTotalComments] = useState(comments.length)

  const commentsTitle =
    (totalComments > 0 ? `${shortFormatNumber(totalComments)} ` : '') +
    'Comments'

  const user = useUser()

  const userBets =
    useRealtimeBets({
      contractId: contract.id,
      userId: user === undefined ? 'loading' : user?.id ?? EMPTY_USER,
      filterAntes: true,
      order: 'asc',
    }) ?? []

  const tradesTitle =
    (totalBets > 0 ? `${shortFormatNumber(totalBets)} ` : '') + 'Trades'

  const visibleUserBets = userBets.filter(
    (bet) => bet.amount !== 0 && !bet.isRedemption
  )

  const isMobile = useIsMobile()

  const yourBetsTitle =
    (visibleUserBets.length > 0 ? `${visibleUserBets.length} ` : '') +
    (isMobile ? 'You' : 'Your Trades')

  const positionsTitle =
    (totalPositions > 0 ? `${shortFormatNumber(totalPositions)} ` : '') +
    'Positions'

  return (
    <ControlledTabs
      className="mb-4"
      activeIndex={activeIndex}
      onClick={(title, i) => {
        setActiveIndex(i)
        track(
          `click ${
            title === commentsTitle
              ? 'comments'
              : title === tradesTitle
              ? 'trades'
              : title === yourBetsTitle
              ? 'your trades'
              : title === positionsTitle
              ? 'positions'
              : 'contract'
          } tab`
        )
      }}
      tabs={buildArray(
        {
          title: commentsTitle,
          content: (
            <CommentsTabContent
              contract={contract}
              comments={comments}
              setCommentsLength={setTotalComments}
              blockedUserIds={blockedUserIds}
              replyTo={replyTo}
              clearReply={() => setReplyTo?.(undefined)}
              className="-ml-2 -mr-1"
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
                enableRealtime
              />
            ),
          },
        totalBets > 0 && {
          title: tradesTitle,
          content: (
            <Col className={'gap-4'}>
              <BetsTabContent
                contract={contract}
                bets={bets}
                totalBets={totalBets}
                setReplyToBet={setReplyTo}
              />
            </Col>
          ),
        },
        userBets.length > 0 && {
          title: yourBetsTitle,
          content: (
            <ContractBetsTable contract={contract} bets={userBets} isYourBets />
          ),
        }
      )}
    />
  )
}

const LOAD_MORE = 10
export const CommentsTabContent = memo(function CommentsTabContent(props: {
  contract: Contract
  comments: ContractComment[]
  blockedUserIds: string[]
  setCommentsLength?: (length: number) => void
  replyTo?: Answer | DpmAnswer | Bet
  clearReply?: () => void
  className?: string
}) {
  const {
    contract,
    blockedUserIds,
    setCommentsLength,
    replyTo,
    clearReply,
    className,
  } = props

  // Firebase useComments
  // const comments = (useComments(contract.id, 0) ?? props.comments).filter(
  //   (c) => !blockedUserIds.includes(c.userId)
  // )

  // Supabase use realtime comments
  const { rows, loadNewer } = useRealtimeCommentsOnContract(contract.id)
  const comments = (rows ?? props.comments).filter(
    (c) => !blockedUserIds.includes(c.userId)
  )

  const [parentCommentsToRender, setParentCommentsToRender] = useState(
    props.comments.filter((c) => !c.replyToCommentId).length
  )

  const user = useUser()

  const isBountiedQuestion = contract.outcomeType == 'BOUNTIED_QUESTION'
  const [sort, setSort] = usePersistentInMemoryState<'Newest' | 'Best'>(
    isBountiedQuestion && (!user || user.id !== contract.creatorId)
      ? 'Best'
      : 'Newest',
    `comments-sort-${contract.id}`
  )
  const likes = comments.some((c) => (c?.likes ?? 0) > 0)

  // replied to answers/comments are NOT newest, otherwise newest first
  const isReply = (c: ContractComment) => c.replyToCommentId !== undefined

  const strictlySortedComments = sortBy(comments, [
    sort === 'Best'
      ? isBountiedQuestion
        ? (c) =>
            isReply(c)
              ? c.createdTime
              : // For your own recent comments, show first.
              c.createdTime > Date.now() - 10 * MINUTE_MS &&
                c.userId === user?.id
              ? -Infinity
              : -((c.bountyAwarded ?? 0) * 1000 + (c.likes ?? 0))
        : (c) =>
            isReply(c)
              ? c.createdTime
              : // Is this too magic? If there are likes, 'Best' shows your own comments made within the last 10 minutes first, then sorts by score
              likes &&
                c.createdTime > Date.now() - 10 * MINUTE_MS &&
                c.userId === user?.id
              ? -Infinity
              : -(c?.likes ?? 0)
      : (c) => c,
    (c) => (isReply(c) ? c.createdTime : -c.createdTime),
  ])

  const commentsByParent = groupBy(
    strictlySortedComments,
    (c) => c.replyToCommentId ?? '_'
  )

  const commentById = keyBy(comments, 'id')

  // lump comments on load/sort to prevent jumping
  const [frozenCommentIds, refreezeIds] = useReducer(
    () => strictlySortedComments.map((c) => c.id),
    strictlySortedComments.map((c) => c.id)
  )

  const firstOldCommentIndex = strictlySortedComments.findIndex((c) =>
    frozenCommentIds.includes(c.id)
  )

  const sortedComments = [
    ...strictlySortedComments.slice(0, firstOldCommentIndex),
    // Lump the original comments in a contiguous chunk so they don't jump around.
    ...frozenCommentIds.map((id) => commentById[id]).filter(Boolean),
    ...strictlySortedComments
      .slice(firstOldCommentIndex)
      .filter((c) => !frozenCommentIds.includes(c.id)),
  ]

  const parentComments = sortedComments.filter(
    (c) => c.replyToCommentId === undefined
  )

  const childrensBounties = isBountiedQuestion
    ? mapValues(commentsByParent, (comments) =>
        sumBy(comments, (c) => c?.bountyAwarded ?? 0)
      )
    : {}

  const visibleCommentIds = useMemo(
    () =>
      parentComments
        .slice(0, parentCommentsToRender)
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
    <Col className={className}>
      {user && (
        <ContractCommentInput
          replyTo={replyTo}
          replyToUserInfo={
            replyTo && 'userUsername' in replyTo
              ? {
                  username: replyTo.userUsername,
                  id: replyTo.userId,
                }
              : undefined
          }
          className="mb-4 mr-px mt-px"
          contract={contract}
          clearReply={clearReply}
          trackingLocation={'contract page'}
          onSubmit={loadNewer}
        />
      )}
      {comments.length > 0 && (
        <SortRow
          sort={sort}
          onSortClick={() => {
            setSort(sort === 'Newest' ? 'Best' : 'Newest')
            refreezeIds()
            track('change-comments-sort', {
              contractSlug: contract.slug,
              contractName: contract.question,
              totalComments: comments.length,
              totalUniqueTraders: contract.uniqueBettorCount,
            })
          }}
          customBestTooltip={
            contract.outcomeType === 'BOUNTIED_QUESTION'
              ? 'Highest bounty, then most likes'
              : undefined
          }
        />
      )}
      {parentComments.slice(0, parentCommentsToRender).map((parent) => (
        <FeedCommentThread
          key={parent.id}
          contract={contract}
          parentComment={parent}
          threadComments={commentsByParent[parent.id] ?? []}
          trackingLocation={'contract page'}
          idInUrl={hashInUrl}
          showReplies={
            !isBountiedQuestion || (!!user && user.id === contract.creatorId)
          }
          childrenBountyTotal={
            contract.outcomeType == 'BOUNTIED_QUESTION'
              ? childrensBounties[parent.id]
              : undefined
          }
          onSubmitReply={loadNewer}
        />
      ))}

      <div className="relative w-full">
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="pointer-events-none absolute bottom-0 h-[75vh]"
        />
      </div>

      {!user && (
        <Button
          onClick={withTracking(
            firebaseLogin,
            'sign up to comment button click'
          )}
          className={clsx('mt-4', comments.length > 0 && 'ml-12')}
          size="lg"
          color="gradient"
        >
          Sign up to comment <ArrowRightIcon className="ml-2 h-4 w-4" />
        </Button>
      )}
    </Col>
  )
})

export const BetsTabContent = memo(function BetsTabContent(props: {
  contract: Contract
  bets: Bet[]
  totalBets: number
  setReplyToBet?: (bet: Bet) => void
}) {
  const { contract, setReplyToBet, totalBets } = props
  const [olderBets, setOlderBets] = useState<Bet[]>([])
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 50
  const bets = [...props.bets, ...olderBets]
  const oldestBet = last(bets)
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
      id: 'bets-tab-' + bet.id + '-' + (bet.isSold ?? 'false'),
      bet,
    })),
    ...visibleLps.map((lp) => ({
      type: 'liquidity' as const,
      id: lp.id,
      lp,
    })),
  ]

  const totalItems = totalBets + visibleLps.length
  const totalLoadedItems = bets.length + visibleLps.length

  const limit = (items.length - (page + 1) * ITEMS_PER_PAGE) * -1
  const shouldLoadMore = limit > 0 && totalLoadedItems < totalItems
  const oldestBetTime = oldestBet?.createdTime ?? contract.createdTime
  useEffect(() => {
    if (!shouldLoadMore) return
    getOlderBets(contract.id, oldestBetTime, limit)
      .then((olderBets) => {
        const filteredBets = olderBets.filter((bet) => !bet.isAnte)
        setOlderBets((bets) => [...bets, ...filteredBets])
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

  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <Col className="mb-4 items-start gap-7" ref={scrollRef}>
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
        setPage={(page) => {
          setPage(page)
          scrollRef.current?.scrollIntoView()
        }}
      />
    </>
  )
})

export function SortRow(props: {
  sort: string
  onSortClick: () => void
  customBestTooltip?: string
}) {
  const { sort, onSortClick, customBestTooltip } = props
  return (
    <Row className="items-center justify-end gap-4">
      <Row className="items-center gap-1">
        <span className="text-ink-400 text-sm">Sort by:</span>
        <button className="text-ink-600 w-20 text-sm" onClick={onSortClick}>
          <Tooltip
            text={
              sort === 'Best' ? customBestTooltip ?? 'Most likes first' : ''
            }
          >
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
