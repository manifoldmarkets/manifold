import {
  groupBy,
  keyBy,
  minBy,
  mapValues,
  sortBy,
  sumBy,
  uniqBy,
  maxBy,
} from 'lodash'
import { memo, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'

import { Answer } from 'common/answer'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import {
  BinaryContract,
  Contract,
  CPMMNumericContract,
  MarketContract,
} from 'common/contract'
import { buildArray } from 'common/util/array'
import { shortFormatNumber, maybePluralize } from 'common/util/format'
import { MINUTE_MS } from 'common/util/time'
import { UserPositionsTable } from 'web/components/contract/user-positions-table'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  VisibilityObserver,
  LoadMoreUntilNotVisible,
} from 'web/components/widgets/visibility-observer'
import { useEvent } from 'client-common/hooks/use-event'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { FeedBet } from '../feed/feed-bets'
import { FeedCommentThread } from '../comments/comment-thread'
import { ContractCommentInput } from '../comments/comment-input'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ControlledTabs } from '../layout/tabs'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useSubscribeNewComments } from 'client-common/hooks/use-comments'
import { ParentFeedComment } from '../comments/comment'
import { useHashInUrlPageRouter } from 'web/hooks/use-hash-in-url-page-router'
import { MultiNumericBetGroup } from 'web/components/feed/feed-multi-numeric-bet-group'
import { Button } from '../buttons/button'
import DropdownMenu from '../widgets/dropdown-menu'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'
import { TRADE_TERM } from 'common/envs/constants'
import {
  listenToOrderUpdates,
  useContractBets,
} from 'client-common/hooks/use-bets'
import { useIsPageVisible } from 'web/hooks/use-page-visible'

export function ContractTabs(props: {
  staticContract: Contract
  liveContract: Contract
  bets: Bet[]
  comments: ContractComment[]
  replyTo?: Answer | Bet
  setReplyTo?: (replyTo?: Answer | Bet) => void
  cancelReplyToAnswer?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  totalBets: number
  totalPositions: number
  pinnedComments: ContractComment[]
}) {
  const {
    staticContract,
    liveContract,
    comments,
    bets,
    replyTo,
    setReplyTo,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
    totalBets,
    pinnedComments,
  } = props

  const highlightedCommentId = useHashInUrlPageRouter('')

  const [totalPositions, setTotalPositions] = useState(props.totalPositions)
  const [totalComments, setTotalComments] = useState(comments.length)

  const commentsTitle =
    (totalComments > 0 ? `${shortFormatNumber(totalComments)} ` : '') +
    maybePluralize('Comment', totalComments)

  const tradesTitle =
    (totalBets > 0 ? `${shortFormatNumber(totalBets)} ` : '') +
    maybePluralize('Trade', totalBets)

  const positionsTitle =
    (totalPositions > 0 ? `${shortFormatNumber(totalPositions)} ` : '') +
    maybePluralize('Holder', totalPositions)

  return (
    <ControlledTabs
      labelClassName="!text-base"
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
              staticContract={staticContract}
              liveContract={liveContract}
              comments={comments}
              pinnedComments={pinnedComments}
              setCommentsLength={setTotalComments}
              blockedUserIds={blockedUserIds}
              replyTo={replyTo}
              clearReply={() => setReplyTo?.(undefined)}
              className="-ml-2 -mr-1"
              highlightCommentId={highlightedCommentId}
            />
          ),
        },
        totalBets > 0 &&
          (liveContract.mechanism === 'cpmm-1' ||
            liveContract.mechanism === 'cpmm-multi-1') && {
            title: positionsTitle,
            content: (
              <UserPositionsTable
                key={liveContract.id}
                contract={liveContract as BinaryContract}
                setTotalPositions={setTotalPositions}
              />
            ),
          },
        totalBets > 0 && {
          title: tradesTitle,
          content: (
            <Col className={'gap-4'}>
              <BetsTabContent
                key={liveContract.id}
                contract={liveContract}
                bets={bets}
                totalBets={totalBets}
                setReplyToBet={setReplyTo}
              />
            </Col>
          ),
        }
      )}
    />
  )
}

const LOAD_MORE = 10
export const CommentsTabContent = memo(function CommentsTabContent(props: {
  staticContract: Contract // contains the comments
  liveContract: Contract // you trade on this
  comments: ContractComment[]
  blockedUserIds: string[]
  setCommentsLength?: (length: number) => void
  replyTo?: Answer | Bet
  clearReply?: () => void
  className?: string
  highlightCommentId?: string
  pinnedComments: ContractComment[]
  scrollToEnd?: boolean
}) {
  const {
    staticContract,
    liveContract,
    blockedUserIds,
    setCommentsLength,
    replyTo,
    clearReply,
    className,
    highlightCommentId,
    scrollToEnd,
  } = props
  const user = useUser()

  // Load all comments once
  const { data: fetchedComments, loading: commentsLoading } = useAPIGetter(
    'comments',
    {
      contractId: staticContract.id,
    },
    undefined,
    'comments-' + staticContract.id
  )

  const bets = useContractBets(
    staticContract.id,
    {
      commentRepliesOnly: true,
    },
    useIsPageVisible,
    (params) => api('bets', params)
  )
  const latestCommentTime = useMemo(
    () => maxBy(fetchedComments, 'createdTime')?.createdTime,
    [fetchedComments?.length]
  )

  const isPageVisible = useIsPageVisible()
  const { data: newFetchedComments, loading: newCommentsLoading } =
    useAPIGetter(
      'comments',
      {
        contractId: staticContract.id,
        afterTime: latestCommentTime,
      },
      undefined,
      'new-comments-' + staticContract.id,
      isPageVisible
    )

  // Listen for new comments
  const newComments = useSubscribeNewComments(staticContract.id)
  const comments = uniqBy(
    [
      ...(newComments ?? []),
      ...(newFetchedComments ?? []),
      ...(fetchedComments ?? []),
      ...props.comments,
    ],
    'id'
  ).filter((c) => !blockedUserIds.includes(c.userId))

  const commentExistsLocally = comments.some((c) => c.id === highlightCommentId)
  const isLoadingHighlightedComment =
    highlightCommentId &&
    !commentExistsLocally &&
    (commentsLoading || newCommentsLoading)

  const [parentCommentsToRender, setParentCommentsToRender] = useState(
    props.comments.filter((c) => !c.replyToCommentId).length
  )

  const isBinary = staticContract.outcomeType === 'BINARY'
  const isBountiedQuestion = staticContract.outcomeType == 'BOUNTIED_QUESTION'
  const bestFirst =
    isBountiedQuestion &&
    (!user || user.id !== staticContract.creatorId) &&
    !staticContract.isAutoBounty

  const sorts = buildArray(
    bestFirst ? 'Best' : 'Newest',
    bestFirst ? 'Newest' : 'Best',
    isBinary && `Yes bets`,
    isBinary && 'No bets'
  )

  const [sortIndex, setSortIndex] = usePersistentInMemoryState(
    0,
    `comments-sort-${staticContract.id}`
  )
  const sort = sorts[sortIndex]

  const sortTooltip =
    sort === 'Best'
      ? isBountiedQuestion
        ? 'Highest bounty, then most likes'
        : 'Most likes first'
      : null

  // replied to answers/comments are NOT newest, otherwise newest first
  const isReply = (c: ContractComment) => c.replyToCommentId !== undefined

  const strictlySortedComments = sortBy(comments, [
    sort === 'Best'
      ? (c) =>
          isReply(c)
            ? c.createdTime
            : // For your own recent comments, show first.
            c.createdTime > Date.now() - 10 * MINUTE_MS && c.userId === user?.id
            ? -Infinity
            : c.hidden
            ? Infinity
            : -(
                (c.bountyAwarded ?? 0) * 1000 +
                (c.likes ?? 0) -
                (c.dislikes ?? 0)
              )
      : sort === 'Yes bets'
      ? (c: ContractComment) => -(c.betReplyAmountsByOutcome?.['YES'] ?? 0)
      : sort === 'No bets'
      ? (c: ContractComment) => -(c.betReplyAmountsByOutcome?.['NO'] ?? 0)
      : // Newest
        (c) => c,
    (c) => (isReply(c) ? c.createdTime : c.hidden ? Infinity : -c.createdTime),
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
  useEffect(() => {
    if (user) refreezeIds()
  }, [user?.id])

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

  useEffect(() => {
    if (highlightCommentId) {
      const currentlyVisible = visibleCommentIds.includes(highlightCommentId)
      if (!currentlyVisible) setParentCommentsToRender(comments.length)
    }
    setCommentsLength?.(comments.length)
  }, [highlightCommentId, comments.length])

  const loadMore = () => setParentCommentsToRender((prev) => prev + LOAD_MORE)
  const pinnedComments = uniqBy(
    props.pinnedComments.concat(comments.filter((comment) => comment.pinned)),
    'id'
  )
  const onVisibilityUpdated = useEvent((visible: boolean) => {
    if (visible) loadMore()
  })

  const endOfMessagesRef = useRef<any>(null)

  useEffect(() => {
    if (endOfMessagesRef && scrollToEnd)
      endOfMessagesRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      })
  }, [endOfMessagesRef])

  const [expandGptSummary, setExpandGptSummary] = usePersistentInMemoryState(
    false,
    `expand-gpt-summary-${staticContract.id}`
  )

  function getSortLabel(sort: string) {
    if (sort == 'Yes bets') return `Yes ${TRADE_TERM}s`
    if (sort == 'No bets') return `No ${TRADE_TERM}s`
    return sort
  }

  return (
    <Col className={clsx(className, scrollToEnd && 'flex-col-reverse')}>
      <div ref={endOfMessagesRef} />
      <ContractCommentInput
        autoFocus={false}
        replyTo={replyTo}
        className="mb-4 mr-px mt-px"
        playContract={staticContract}
        clearReply={clearReply}
        trackingLocation={'contract page'}
        commentTypes={['comment', 'repost']}
      />

      {staticContract.gptCommentSummary && (
        <Button
          className="mb-2 rounded-md bg-teal-100 p-4"
          size="xs"
          color="none"
          onClick={() => setExpandGptSummary((e) => !e)}
        >
          <Col className="gap-2 p-2">
            <Row className="items-center gap-2">
              {expandGptSummary ? (
                <ChevronUpIcon className="h-5 w-5" />
              ) : (
                <ChevronDownIcon className="h-5 w-5" />
              )}
              <div className="text-lg">Comments summary</div>
            </Row>
            <div
              className={clsx(
                'whitespace-pre-line text-left text-sm',
                !expandGptSummary && 'line-clamp-3'
              )}
            >
              {staticContract.gptCommentSummary}
            </div>
          </Col>
        </Button>
      )}

      {comments.length > 0 && (
        <Row className="justify-end">
          <Tooltip text={sortTooltip}>
            <Row className="items-center gap-1">
              <span className="text-ink-400 text-sm">Sort by:</span>
              <DropdownMenu
                items={generateFilterDropdownItems(
                  sorts.map((s, i) => ({
                    label: getSortLabel(s),
                    value: i + '',
                  })),
                  (value: string) => {
                    const i = parseInt(value)
                    setSortIndex(i)
                    console.log(i)
                    refreezeIds()
                    track('change-comments-sort', {
                      contractSlug: staticContract.slug,
                      contractName: staticContract.question,
                      totalComments: comments.length,
                      totalUniqueTraders: staticContract.uniqueBettorCount,
                    })
                  }
                )}
                buttonContent={
                  <Row className="text-ink-600 w-20 items-center text-sm">
                    <span className="whitespace-nowrap">
                      {getSortLabel(sort)}
                    </span>
                    <ChevronDownIcon className="h-4 w-4" />
                  </Row>
                }
                menuWidth={'w-28'}
                selectedItemName={sort}
                closeOnClick
              />
            </Row>
          </Tooltip>
        </Row>
      )}

      {pinnedComments.map((comment) => (
        <div key={comment.id} className={'pt-3'}>
          <ParentFeedComment
            comment={comment}
            playContract={staticContract}
            liveContract={liveContract}
            trackingLocation={'contract page'}
            seeReplies={false}
            numReplies={0}
            isPinned
          />
        </div>
      ))}

      {isLoadingHighlightedComment ? (
        <Col className="h-32 items-center justify-center">
          <LoadingIndicator />
        </Col>
      ) : (
        parentComments.slice(0, parentCommentsToRender).map((parent) => (
          <FeedCommentThread
            key={parent.id}
            playContract={staticContract}
            liveContract={liveContract}
            parentComment={parent}
            threadComments={commentsByParent[parent.id] ?? []}
            trackingLocation={'contract page'}
            idInUrl={highlightCommentId}
            showReplies={
              !isBountiedQuestion ||
              (!!user && user.id === staticContract.creatorId)
            }
            childrenBountyTotal={
              staticContract.outcomeType == 'BOUNTIED_QUESTION'
                ? childrensBounties[parent.id]
                : undefined
            }
            bets={bets?.filter(
              (b) =>
                b.replyToCommentId &&
                [parent]
                  .concat(commentsByParent[parent.id] ?? [])
                  .map((c) => c.id)
                  .includes(b.replyToCommentId)
            )}
          />
        ))
      )}
      <div className="relative w-full">
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="pointer-events-none absolute bottom-0 h-[75vh]"
        />
      </div>
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
  const { outcomeType } = contract
  const [olderBets, setOlderBets] = useState<Bet[]>([])

  const [minAmountFilterIndex, setMinAmountFilterIndex] =
    usePersistentInMemoryState(0, `bet-amount-filter-${contract.id}`)
  const isNumber = outcomeType === 'NUMBER'

  // Min amount filter options
  const minAmountOptions = [
    { label: 'Any amount', value: undefined },
    { label: 'M$100+', value: 100 },
    { label: 'M$1,000+', value: 1000 },
    { label: 'M$10,000+', value: 10000 },
  ]
  const selectedMinAmount = minAmountOptions[minAmountFilterIndex].value

  // Filter initial bets on client side, server will filter olderBets
  const filteredInitialBets = selectedMinAmount
    ? props.bets.filter((bet) => Math.abs(bet.amount) >= selectedMinAmount)
    : props.bets

  const bets = [...filteredInitialBets, ...olderBets]
  listenToOrderUpdates(contract.id, setOlderBets, true)

  const oldestBet = minBy(bets, (b) => b.createdTime)

  const lps = useLiquidity(contract.id) ?? []
  const visibleLps = lps.filter(
    (l) =>
      !l.isAnte &&
      l.userId !== HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.userId !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.amount > 0 &&
      !minAmountFilterIndex
  )
  const betsByBetGroupId = isNumber
    ? groupBy(bets, (bet) => bet.betGroupId ?? bet.id)
    : {}
  const groupedBets = Object.values(betsByBetGroupId)

  const items = [
    ...(isNumber
      ? groupedBets.map((bets) => ({
          type: 'betGroup' as const,
          id: 'bets-tab-' + bets[0].betGroupId,
          bets,
        }))
      : bets.map((bet) => ({
          type: 'bet' as const,
          id: 'bets-tab-' + bet.id + '-' + 'false',
          bet,
        }))),
    ...visibleLps.map((lp) => ({
      type: 'liquidity' as const,
      id: lp.id,
      lp,
    })),
  ]

  const totalItems = totalBets + visibleLps.length
  const totalLoadedItems = bets.length + visibleLps.length

  const shouldLoadMore = totalLoadedItems < totalItems
  const [now] = useState(Date.now())
  const oldestBetTime = oldestBet?.createdTime ?? now

  const loadMore = useEvent(async () => {
    if (!shouldLoadMore) return false

    try {
      const newBets = await api('bets', {
        contractId: contract.id,
        beforeTime: oldestBetTime,
        limit: 50,
        filterRedemptions: !isNumber,
        includeZeroShareRedemptions: isNumber,
        minAmount: selectedMinAmount,
      })

      if (newBets.length > 0) {
        setOlderBets((bets) => uniqBy([...bets, ...newBets], (b) => b.id))
        return true
      }
      return false
    } catch (err) {
      console.error(err)
      return false
    }
  })
  useEffect(() => {
    setOlderBets([])
    loadMore()
  }, [selectedMinAmount])

  const allItems = sortBy(items, (item) =>
    item.type === 'bet'
      ? -item.bet.createdTime
      : item.type === 'liquidity'
      ? -item.lp.createdTime
      : item.type === 'betGroup'
      ? -item.bets[0].createdTime
      : undefined
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const isCashContract = contract.token === 'CASH'

  // Determine how many loading rows to show
  const numLoadingRows = shouldLoadMore
    ? Math.min(10, Math.max(0, totalBets - allItems.length))
    : 0

  return (
    <>
      <div ref={scrollRef} />

      {/* Minimum bet amount filter */}
      <Row className="mb-2">
        <Row className="items-center gap-1">
          <span className="text-ink-500 text-sm">Min amount:</span>
          <DropdownMenu
            items={generateFilterDropdownItems(
              minAmountOptions.map((option, i) => ({
                label: option.label,
                value: i.toString(),
              })),
              (value: string) => {
                const newIndex = parseInt(value)
                setMinAmountFilterIndex(newIndex)
                setOlderBets([]) // Clear older bets to refetch with new filter
                track('change-bet-amount-filter', {
                  contractSlug: contract.slug,
                  contractName: contract.question,
                  minAmount: minAmountOptions[newIndex].value,
                })
              }
            )}
            buttonContent={
              <Row className="text-ink-700 w-28 items-center text-sm">
                <span className="whitespace-nowrap">
                  {minAmountOptions[minAmountFilterIndex].label}
                </span>
                <ChevronDownIcon className="h-4 w-4" />
              </Row>
            }
            menuWidth={'w-36'}
            selectedItemName={minAmountOptions[minAmountFilterIndex].label}
            closeOnClick
          />
        </Row>
      </Row>

      <Col className="mb-4 items-start gap-7">
        {allItems.map((item) =>
          item.type === 'bet' ? (
            <FeedBet
              onReply={setReplyToBet}
              key={item.id}
              contract={contract as MarketContract}
              bet={item.bet}
            />
          ) : item.type === 'betGroup' ? (
            <MultiNumericBetGroup
              key={item.id}
              contract={contract as CPMMNumericContract}
              bets={item.bets}
            />
          ) : (
            <div
              key={item.id}
              className="-ml-2 rounded-full bg-gradient-to-r from-pink-300/50 via-purple-300/50 to-indigo-300/50 p-2"
            >
              <FeedLiquidity
                liquidity={item.lp}
                isCashContract={isCashContract}
              />
            </div>
          )
        )}
        {/* Render skeleton loading rows */}
        {shouldLoadMore &&
          !minAmountFilterIndex &&
          Array(numLoadingRows)
            .fill(0)
            .map((_, i) => <LoadingBetRow key={`loading-${i}`} />)}
      </Col>

      <LoadMoreUntilNotVisible loadMore={loadMore} />
    </>
  )
})

function LoadingBetRow() {
  return (
    <div className="flex w-full animate-pulse gap-3 rounded-md ">
      {/* Avatar skeleton */}
      <div className="h-10 w-10 rounded-full bg-gray-500" />
      <Col className="flex-1 justify-center gap-1.5">
        <div className="h-4 w-1/2 rounded bg-gray-500" />
      </Col>
    </div>
  )
}
