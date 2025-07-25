import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { useContractBets } from 'client-common/hooks/use-bets'
import { useSubscribeNewComments } from 'client-common/hooks/use-comments'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { buildArray } from 'common/util/array'
import { MINUTE_MS } from 'common/util/time'
import { groupBy, keyBy, mapValues, sortBy, sumBy, uniqBy } from 'lodash'
import { memo, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { ParentFeedComment } from 'web/components/comments/comment'
import { ContractCommentInput } from 'web/components/comments/comment-input'
import { FeedCommentThread } from 'web/components/comments/comment-thread'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import generateFilterDropdownItems from 'web/components/search/search-dropdown-helpers'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Tooltip } from 'web/components/widgets/tooltip'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useCommentThreads } from 'web/hooks/use-comments'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

export const CommentsTabContent = memo(function CommentsTabContent(props: {
  staticContract: Contract // contains the comments
  liveContract: Contract // you trade on this
  comments: ContractComment[]
  blockedUserIds: string[]
  setTotalComments?: (length: number) => void
  totalComments: number
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
    comments: staticComments,
    blockedUserIds,
    setTotalComments,
    totalComments,
    replyTo,
    clearReply,
    className,
    highlightCommentId,
    pinnedComments: staticPinnedComments,
    scrollToEnd,
  } = props
  const user = useUser()

  const { threads, loadMore, loading } = useCommentThreads(
    staticContract.id,
    10,
    !!highlightCommentId
  )
  const [highlightedThreads, setHighlightedThreads] = useState<
    { parent: ContractComment; replies: ContractComment[] }[]
  >([])
  const [isLoadingHighlighted, setIsLoadingHighlighted] = useState(false)

  const bets = useContractBets(
    staticContract.id,
    {
      commentRepliesOnly: true,
    },
    useIsPageVisible,
    (params) => api('bets', params)
  )

  const newComments = useSubscribeNewComments(staticContract.id)

  const allComments = useMemo(() => {
    const dynamicComments = threads.flatMap((t) => [t.parent, ...t.replies])
    const highlightedComments = highlightedThreads.flatMap((t) => [
      t.parent,
      ...t.replies,
    ])
    return uniqBy(
      [
        ...(newComments ?? []),
        ...staticComments,
        ...dynamicComments,
        ...highlightedComments,
      ],
      'id'
    ).filter((c) => !blockedUserIds.includes(c.userId))
  }, [newComments, staticComments, threads, highlightedThreads, blockedUserIds])

  const commentExistsLocally = useMemo(
    () => allComments.some((c) => c.id === highlightCommentId),
    [allComments, highlightCommentId]
  )

  const isLoadingHighlightedComment =
    !!highlightCommentId &&
    !commentExistsLocally &&
    (loading || isLoadingHighlighted)

  useEffect(() => {
    if (highlightCommentId && !commentExistsLocally && !loading) {
      setIsLoadingHighlighted(true)
      api('comment-thread', {
        contractId: staticContract.id,
        commentId: highlightCommentId,
      }).then((res) => {
        const {
          parentComment,
          replyComments,
          parentComments,
          nextParentComments,
          nextReplyComments,
        } = res
        if (parentComment) {
          const newThreads = [
            { parent: parentComment, replies: replyComments },
            ...parentComments.map((p) => ({ parent: p, replies: [] })),
          ]
          if (nextParentComments) {
            const repliesByParent = groupBy(
              nextReplyComments,
              'replyToCommentId'
            )
            nextParentComments.forEach((p) => {
              newThreads.push({
                parent: p,
                replies: repliesByParent[p.id] ?? [],
              })
            })
          }
          setHighlightedThreads(newThreads)
        }
        setIsLoadingHighlighted(false)
      })
    }
  }, [highlightCommentId, commentExistsLocally, loading])

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

  const strictlySortedComments = sortBy(allComments, [
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

  const commentById = keyBy(allComments, 'id')

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

  useEffect(() => {
    if (allComments.length > totalComments) {
      setTotalComments?.(allComments.length)
    }
  }, [allComments.length, totalComments])

  const pinnedComments = uniqBy(
    staticPinnedComments.concat(
      allComments.filter((comment) => comment.pinned)
    ),
    'id'
  )
  const onVisibilityUpdated = useEvent((visible: boolean) => {
    if (visible && !loading) loadMore()
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

      {allComments.length > 0 && (
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
                      totalComments: allComments.length,
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
        parentComments.map((parent) => (
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
              (b: Bet) =>
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
      {loading && (
        <Col className="h-32 items-center justify-center">
          <LoadingIndicator />
        </Col>
      )}
    </Col>
  )
})
