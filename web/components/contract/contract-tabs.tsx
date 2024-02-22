import { groupBy, keyBy, mapValues, sortBy, sumBy, uniqBy } from 'lodash'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'

import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { CPMMBinaryContract, Contract } from 'common/contract'
import { buildArray } from 'common/util/array'
import { shortFormatNumber, maybePluralize } from 'common/util/format'
import { MINUTE_MS } from 'common/util/time'
import { UserPositionsTable } from 'web/components/contract/user-positions-table'
import { Tooltip } from 'web/components/widgets/tooltip'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useEvent } from 'web/hooks/use-event'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import { track, withTracking } from 'web/lib/service/analytics'
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
import { ParentFeedComment } from '../feed/feed-comments'
import { useHashInUrlPageRouter } from 'web/hooks/use-hash-in-url-page-router'
import { useHashInUrl } from 'web/hooks/use-hash-in-url'
import { db } from 'web/lib/supabase/db'
import { getBets } from 'common/supabase/bets'
import { getLiquidityProvisions } from 'common/supabase/liquidity'
import { usePagination } from 'web/hooks/use-pagination'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { LiquidityProvision } from 'common/src/liquidity-provision'

export const EMPTY_USER = '_'

export function ContractTabs(props: {
  contract: Contract
  bets?: Bet[]
  lps?: LiquidityProvision[]
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  replyTo?: Answer | DpmAnswer | Bet
  setReplyTo?: (replyTo?: Answer | DpmAnswer | Bet) => void
  cancelReplyToAnswer?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  totalTrades: number
  totalPositions: number
  pinnedComments: ContractComment[]
  appRouter?: boolean
}) {
  const {
    contract,
    comments,
    bets,
    lps,
    replyTo,
    setReplyTo,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
    totalTrades,
    userPositionsByOutcome,
    pinnedComments,
    appRouter,
  } = props

  const [totalPositions, setTotalPositions] = useState(props.totalPositions)
  const [totalComments, setTotalComments] = useState(comments.length)

  const commentsTitle =
    (totalComments > 0 ? `${shortFormatNumber(totalComments)} ` : '') +
    maybePluralize('Comment', totalComments)

  const user = useUser()

  const { rows } = useRealtimeBets({
    contractId: contract.id,
    userId: user === undefined ? 'loading' : user?.id ?? EMPTY_USER,
    filterAntes: true,
    order: 'asc',
  })
  const userBets = rows ?? []

  const tradesTitle =
    (totalTrades > 0 ? `${shortFormatNumber(totalTrades)} ` : '') +
    maybePluralize('Trade', totalTrades)

  const visibleUserBets = userBets.filter(
    (bet) => bet.amount !== 0 && !bet.isRedemption
  )

  const isMobile = useIsMobile()

  const yourBetsTitle =
    (visibleUserBets.length > 0 ? `${visibleUserBets.length} ` : '') +
    (isMobile ? 'You' : 'Your Trades')

  const positionsTitle =
    (totalPositions > 0 ? `${shortFormatNumber(totalPositions)} ` : '') +
    maybePluralize('Position', totalPositions)

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
              pinnedComments={pinnedComments}
              setCommentsLength={setTotalComments}
              blockedUserIds={blockedUserIds}
              replyTo={replyTo}
              clearReply={() => setReplyTo?.(undefined)}
              className="-ml-2 -mr-1"
              bets={bets}
              appRouter={appRouter}
            />
          ),
        },
        totalPositions > 0 &&
          (contract.mechanism === 'cpmm-1' ||
            contract.mechanism === 'cpmm-multi-1') && {
            title: positionsTitle,
            content: (
              <UserPositionsTable
                positions={
                  // If contract is resolved, will have to refetch positions by profit
                  Object.values(userPositionsByOutcome).length > 0 &&
                  !contract.isResolved
                    ? userPositionsByOutcome
                    : undefined
                }
                contract={contract as CPMMBinaryContract}
                setTotalPositions={setTotalPositions}
              />
            ),
          },
        totalTrades > 0 && {
          title: tradesTitle,
          content: (
            <Col className={'gap-4'}>
              <BetsTabContent
                contract={contract}
                recentBets={bets}
                recentLps={lps}
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
  bets?: Bet[]
  highlightCommentId?: string
  pinnedComments: ContractComment[]
  appRouter?: boolean
}) {
  const {
    contract,
    blockedUserIds,
    setCommentsLength,
    replyTo,
    clearReply,
    className,
    bets,
    highlightCommentId,
    appRouter,
  } = props
  const user = useUser()

  // Firebase useComments
  // const comments = (useComments(contract.id, 0) ?? props.comments).filter(
  //   (c) => !blockedUserIds.includes(c.userId)
  // )

  // Supabase use realtime comments
  const { rows, loadNewer } = useRealtimeCommentsOnContract(
    contract.id,
    user ? { userId: user.id } : undefined
  )
  const comments = (rows ?? props.comments).filter(
    (c) => !blockedUserIds.includes(c.userId)
  )

  const [parentCommentsToRender, setParentCommentsToRender] = useState(
    props.comments.filter((c) => !c.replyToCommentId).length
  )

  const isBinary = contract.outcomeType === 'BINARY'
  const isBountiedQuestion = contract.outcomeType == 'BOUNTIED_QUESTION'
  const bestFirst =
    isBountiedQuestion && (!user || user.id !== contract.creatorId)
  const sorts = buildArray(
    bestFirst ? 'Best' : 'Newest',
    bestFirst ? 'Newest' : 'Best',
    isBinary && 'Yes bets',
    isBinary && 'No bets'
  )
  const [sortIndex, setSortIndex] = usePersistentInMemoryState(
    0,
    `comments-sort-${contract.id}`
  )
  const sort = sorts[sortIndex]

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
          commentTypes={['comment', 'repost']}
        />
      )}

      {comments.length > 0 && (
        <SortRow
          sort={sort}
          onSortClick={() => {
            setSortIndex((i) => (i + 1) % sorts.length)
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

      {pinnedComments.map((comment) => (
        <div key={comment.id} className={'pt-3'}>
          <PinnedComment
            comment={comment}
            contract={contract}
            trackingLocation={'contract page'}
            seeReplies={false}
            numReplies={0}
          />
        </div>
      ))}

      {parentComments.slice(0, parentCommentsToRender).map((parent) => (
        <FeedCommentThread
          key={parent.id}
          contract={contract}
          parentComment={parent}
          threadComments={commentsByParent[parent.id] ?? []}
          trackingLocation={'contract page'}
          idInUrl={idToHighlight}
          showReplies={
            !isBountiedQuestion || (!!user && user.id === contract.creatorId)
          }
          childrenBountyTotal={
            contract.outcomeType == 'BOUNTIED_QUESTION'
              ? childrensBounties[parent.id]
              : undefined
          }
          onSubmitReply={loadNewer}
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

const PinnedComment = (props: {
  contract: Contract
  comment: ContractComment
  seeReplies: boolean
  numReplies: number
  trackingLocation: string
  bets?: Bet[]
}) => {
  const { comment, contract, trackingLocation, bets, seeReplies, numReplies } =
    props

  return (
    <ParentFeedComment
      contract={contract}
      comment={comment}
      trackingLocation={trackingLocation}
      highlighted={false}
      bets={bets}
      seeReplies={seeReplies}
      numReplies={numReplies}
      isPinned={true}
    />
  )
}

export const BetsTabContent = memo(function BetsTabContent(props: {
  contract: Contract
  answer?: Answer
  recentBets?: Bet[]
  recentLps?: LiquidityProvision[]
  setReplyToBet?: (bet: Bet) => void
}) {
  const { contract, answer, setReplyToBet, recentBets, recentLps } = props

  const pageSize = 50

  const existingItems = useMemo(
    () => getTradesListItems(pageSize, recentBets, recentLps),
    [recentBets, recentLps]
  )

  const paginationCallback = useCallback(
    getTradesListQuery(contract.id, answer?.id),
    [contract.id, answer?.id]
  )

  const pagination = usePagination({
    pageSize,
    q: paginationCallback,
    prefix: existingItems,
  })

  return (
    <>
      <Col className="mb-4 items-start gap-7">
        {pagination.items.map((d) =>
          d.kind === 'bet' ? (
            <FeedBet
              onReply={setReplyToBet}
              key={d.data.id}
              contract={contract}
              bet={d.data}
            />
          ) : (
            <FeedLiquidity key={`${d.kind}-${d.data.id}`} liquidity={d.data} />
          )
        )}
        <PaginationNextPrev {...pagination} />
      </Col>
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
    <Row className="items-center justify-end gap-4 whitespace-nowrap">
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

type TradesListItem =
  | { kind: 'bet'; data: Bet }
  | { kind: 'lp'; data: LiquidityProvision }

function getTradesListItems(
  limit: number,
  bets?: Bet[],
  lps?: LiquidityProvision[]
) {
  const items = [
    ...(bets ?? []).map((b) => ({ kind: 'bet', data: b })),
    ...(lps ?? []).map((lp) => ({ kind: 'lp', data: lp })),
  ] as TradesListItem[]
  return sortBy(items, (x) => -x.data.createdTime).slice(0, limit)
}

function getTradesListQuery(contractId: string, answerId?: string) {
  return async (limit: number, after?: { data: { createdTime: number } }) => {
    const betsQ = getBets(db, {
      contractId: contractId,
      answerId: answerId,
      filterRedemptions: true,
      filterAntes: true,
      beforeTime: after?.data.createdTime,
      order: 'desc',
      limit,
    })
    const lpsQ = getLiquidityProvisions(db, {
      contractId: contractId,
      filterHouse: true,
      filterAntes: true,
      beforeTime: after?.data.createdTime,
      order: 'desc',
      limit,
    })
    const [bets, lps] = await Promise.all([betsQ, lpsQ])
    return getTradesListItems(limit, bets, lps)
  }
}
