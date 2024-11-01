import { groupBy, keyBy, minBy, mapValues, sortBy, sumBy, uniqBy } from 'lodash'
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
import { BinaryContract, Contract, CPMMNumericContract } from 'common/contract'
import { buildArray } from 'common/util/array'
import { shortFormatNumber, maybePluralize } from 'common/util/format'
import { MINUTE_MS } from 'common/util/time'
import { UserPositionsTable } from 'web/components/contract/user-positions-table'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Pagination } from 'web/components/widgets/pagination'
import { Tooltip } from 'web/components/widgets/tooltip'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useEvent } from 'web/hooks/use-event'
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
import { ContractMetricsByOutcome } from 'common/contract-metric'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useSubscribeNewComments } from 'web/hooks/use-comments'
import { ParentFeedComment } from '../comments/comment'
import { useHashInUrlPageRouter } from 'web/hooks/use-hash-in-url-page-router'
import { useHashInUrl } from 'web/hooks/use-hash-in-url'
import { MultiNumericBetGroup } from 'web/components/feed/feed-multi-numeric-bet-group'
import { Button } from '../buttons/button'
import DropdownMenu from '../comments/dropdown-menu'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'
import { TRADE_TERM } from 'common/envs/constants'

export function ContractTabs(props: {
  mainContract: Contract
  liveContract: Contract
  bets: Bet[]
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  replyTo?: Answer | Bet
  setReplyTo?: (replyTo?: Answer | Bet) => void
  cancelReplyToAnswer?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  totalBets: number
  totalPositions: number
  pinnedComments: ContractComment[]
  betReplies: Bet[]
  appRouter?: boolean
}) {
  const {
    mainContract,
    liveContract,
    comments,
    bets,
    replyTo,
    setReplyTo,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
    totalBets,
    userPositionsByOutcome,
    pinnedComments,
    appRouter,
    betReplies,
  } = props

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
              playContract={mainContract}
              liveContract={liveContract}
              comments={comments}
              pinnedComments={pinnedComments}
              setCommentsLength={setTotalComments}
              blockedUserIds={blockedUserIds}
              replyTo={replyTo}
              clearReply={() => setReplyTo?.(undefined)}
              className="-ml-2 -mr-1"
              bets={uniqBy(bets.concat(betReplies), (b) => b.id)}
              appRouter={appRouter}
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
                positions={
                  // If contract is resolved, will have to refetch positions by profit
                  Object.values(userPositionsByOutcome).length > 0 &&
                  !liveContract.isResolved
                    ? userPositionsByOutcome
                    : undefined
                }
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
  playContract: Contract // contains the comments
  liveContract: Contract // you trade on this
  comments: ContractComment[]
  blockedUserIds: string[]
  setCommentsLength?: (length: number) => void
  replyTo?: Answer | Bet
  clearReply?: () => void
  className?: string
  bets?: Bet[]
  highlightCommentId?: string
  pinnedComments: ContractComment[]
  appRouter?: boolean
  scrollToEnd?: boolean
}) {
  const {
    playContract,
    liveContract,
    blockedUserIds,
    setCommentsLength,
    replyTo,
    clearReply,
    className,
    bets,
    highlightCommentId,
    appRouter,
    scrollToEnd,
  } = props
  const user = useUser()

  // Load all comments once
  const { data: fetchedComments } = useAPIGetter(
    'comments',
    {
      contractId: playContract.id,
    },
    undefined,
    'comments-' + playContract.id
  )

  // Listen for new comments
  const newComments = useSubscribeNewComments(playContract.id)
  const comments = uniqBy(
    [...(newComments ?? []), ...(fetchedComments ?? []), ...props.comments],
    'id'
  ).filter((c) => !blockedUserIds.includes(c.userId))

  const [parentCommentsToRender, setParentCommentsToRender] = useState(
    props.comments.filter((c) => !c.replyToCommentId).length
  )

  const isBinary = playContract.outcomeType === 'BINARY'
  const isBountiedQuestion = playContract.outcomeType == 'BOUNTIED_QUESTION'
  const bestFirst =
    isBountiedQuestion &&
    (!user || user.id !== playContract.creatorId) &&
    !playContract.isAutoBounty

  const sorts = buildArray(
    bestFirst ? 'Best' : 'Newest',
    bestFirst ? 'Newest' : 'Best',
    isBinary && `Yes bets`,
    isBinary && 'No bets'
  )

  const [sortIndex, setSortIndex] = usePersistentInMemoryState(
    0,
    `comments-sort-${playContract.id}`
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
            : -((c.bountyAwarded ?? 0) * 1000 + (c.likes ?? 0))
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
  const idToHighlight =
    // eslint-disable-next-line react-hooks/rules-of-hooks
    highlightCommentId ?? appRouter
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        useHashInUrl()
      : // eslint-disable-next-line react-hooks/rules-of-hooks
        useHashInUrlPageRouter('')

  console.log('ID TO HIGHLIGHT', idToHighlight, appRouter)
  useEffect(() => {
    if (idToHighlight) {
      const currentlyVisible = visibleCommentIds.includes(idToHighlight)
      if (!currentlyVisible) setParentCommentsToRender(comments.length)
    }
    setCommentsLength?.(comments.length)
  }, [idToHighlight, comments.length])

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
    `expand-gpt-summary-${playContract.id}`
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
        playContract={playContract}
        liveContract={liveContract}
        clearReply={clearReply}
        trackingLocation={'contract page'}
        commentTypes={['comment', 'repost']}
      />

      {playContract.gptCommentSummary && (
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
              {playContract.gptCommentSummary}
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
                      contractSlug: playContract.slug,
                      contractName: playContract.question,
                      totalComments: comments.length,
                      totalUniqueTraders: playContract.uniqueBettorCount,
                    })
                  }
                )}
                icon={
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
            playContract={playContract}
            liveContract={liveContract}
            trackingLocation={'contract page'}
            seeReplies={false}
            numReplies={0}
            isPinned
          />
        </div>
      ))}

      {parentComments.slice(0, parentCommentsToRender).map((parent) => (
        <FeedCommentThread
          key={parent.id}
          playContract={playContract}
          liveContract={liveContract}
          parentComment={parent}
          threadComments={commentsByParent[parent.id] ?? []}
          trackingLocation={'contract page'}
          idInUrl={idToHighlight}
          showReplies={
            !isBountiedQuestion ||
            (!!user && user.id === playContract.creatorId)
          }
          childrenBountyTotal={
            playContract.outcomeType == 'BOUNTIED_QUESTION'
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
      ))}
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

  const [page, setPage] = useState(0)
  const isNumber = outcomeType === 'NUMBER'
  const ITEMS_PER_PAGE = 50 * (isNumber ? contract.answers.length : 1)
  const bets = [...props.bets, ...olderBets]

  const oldestBet = minBy(bets, (b) => b.createdTime)
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

  const limit = (items.length - (page + 1) * ITEMS_PER_PAGE) * -1
  const shouldLoadMore = limit > 0 && totalLoadedItems < totalItems
  const [now] = useState(Date.now())
  const oldestBetTime = oldestBet?.createdTime ?? now
  useEffect(() => {
    if (!shouldLoadMore) return
    api('bets', {
      contractId: contract.id,
      beforeTime: oldestBetTime,
      limit,
      filterRedemptions: !isNumber,
      includeZeroShareRedemptions: isNumber,
    })
      .then((olderBets) => {
        setOlderBets((bets) => uniqBy([...bets, ...olderBets], (b) => b.id))
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
      : item.type === 'betGroup'
      ? -item.bets[0].createdTime
      : undefined
  ).slice(start, end)

  const scrollRef = useRef<HTMLDivElement>(null)
  const isCashContract = contract.token === 'CASH'

  return (
    <>
      <Col className="mb-4 items-start gap-7" ref={scrollRef}>
        {pageItems.map((item) =>
          item.type === 'bet' ? (
            <FeedBet
              onReply={setReplyToBet}
              key={item.id}
              contract={contract}
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
        {/* TODO: skeleton */}
        {shouldLoadMore && <LoadingIndicator />}
      </Col>
      <Pagination
        page={page}
        pageSize={ITEMS_PER_PAGE}
        totalItems={totalItems}
        setPage={(page) => {
          setPage(page)
          scrollRef.current?.scrollIntoView()
        }}
      />
    </>
  )
})
