import { Dashboard } from 'common/dashboard'
import { shortFormatNumber } from 'common/util/format'
import { useEffect, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { ContractCommentInput } from '../feed/feed-comments'
import { CommentInput } from '../comments/comment-input'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { Button } from '../buttons/button'
import { track, withTracking } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import clsx from 'clsx'
import { ArrowRightIcon } from '@heroicons/react/solid'
import { Editor } from '@tiptap/core'
import { createDashboardComment } from 'web/lib/firebase/api'

export function DashboardComments(props: { dashboard: Dashboard }) {
  const { dashboard } = props

  //   const [totalComments, setTotalComments] = useState(comments.length)

  //   const commentTitle =
  //     totalComments === 0
  //       ? 'Comments'
  //       : `${shortFormatNumber(totalComments)} Comments`

  //   // Firebase useComments
  //   const newComments =
  //     useComments(
  //       contract.id,
  //       maxBy(props.comments, (c) => c.createdTime)?.createdTime ?? Date.now()
  //     ) ?? []
  //   const oldComments = useCommentsOnContract(contract.id) ?? props.comments
  //   const comments = uniqBy([...oldComments, ...newComments], (c) => c.id).filter(
  //     (c) => !blockedUserIds.includes(c.userId)
  //   )

  // Supabase use realtime comments
  // const comments = (
  //   useRealtimeCommentsOnContract(contract.id) ?? props.comments
  // ).filter((c) => !blockedUserIds.includes(c.userId))

  //   const [parentCommentsToRender, setParentCommentsToRender] = useState(
  //     props.comments.filter((c) => !c.replyToCommentId).length
  //   )

  const user = useUser()

  const [sort, setSort] = usePersistentInMemoryState<'Newest' | 'Best'>(
    'Newest',
    `dashboard-comments-sort-${dashboard.id}`
  )
  //   const likes = comments.some((c) => (c?.likes ?? 0) > 0)

  //   // replied to answers/comments are NOT newest, otherwise newest first
  //   const isReply = (c: ContractComment) => c.replyToCommentId !== undefined

  //   const strictlySortedComments = sortBy(comments, [
  //     sort === 'Best'
  //       ? isBountiedQuestion
  //         ? (c) =>
  //             isReply(c)
  //               ? c.createdTime
  //               : // For your own recent comments, show first.
  //               c.createdTime > Date.now() - 10 * MINUTE_MS &&
  //                 c.userId === user?.id
  //               ? -Infinity
  //               : -((c.bountyAwarded ?? 0) * 1000 + (c.likes ?? 0))
  //         : (c) =>
  //             isReply(c)
  //               ? c.createdTime
  //               : // Is this too magic? If there are likes, 'Best' shows your own comments made within the last 10 minutes first, then sorts by score
  //               likes &&
  //                 c.createdTime > Date.now() - 10 * MINUTE_MS &&
  //                 c.userId === user?.id
  //               ? -Infinity
  //               : -(c?.likes ?? 0)
  //       : (c) => c,
  //     (c) => (isReply(c) ? c.createdTime : -c.createdTime),
  //   ])

  //   const commentsByParent = groupBy(
  //     strictlySortedComments,
  //     (c) => c.replyToCommentId ?? '_'
  //   )

  //   const commentById = keyBy(comments, 'id')

  //   // lump comments on load/sort to prevent jumping
  //   const [frozenCommentIds, refreezeIds] = useReducer(
  //     () => strictlySortedComments.map((c) => c.id),
  //     strictlySortedComments.map((c) => c.id)
  //   )

  //   const firstOldCommentIndex = strictlySortedComments.findIndex((c) =>
  //     frozenCommentIds.includes(c.id)
  //   )

  //   const sortedComments = [
  //     ...strictlySortedComments.slice(0, firstOldCommentIndex),
  //     // Lump the original comments in a contiguous chunk so they don't jump around.
  //     ...frozenCommentIds.map((id) => commentById[id]).filter(Boolean),
  //     ...strictlySortedComments
  //       .slice(firstOldCommentIndex)
  //       .filter((c) => !frozenCommentIds.includes(c.id)),
  //   ]

  //   const parentComments = sortedComments.filter(
  //     (c) => c.replyToCommentId === undefined
  //   )

  //   const childrensBounties = isBountiedQuestion
  //     ? mapValues(commentsByParent, (comments) =>
  //         sumBy(comments, (c) => c?.bountyAwarded ?? 0)
  //       )
  //     : {}

  //   const visibleCommentIds = useMemo(
  //     () =>
  //       parentComments
  //         .slice(0, parentCommentsToRender)
  //         .map((c) => [c.id, ...(commentsByParent[c.id] ?? []).map((c) => c.id)])
  //         .flat(),
  //     [comments.length]
  //   )
  //   const hashInUrl = useHashInUrl()
  //   useEffect(() => {
  //     if (hashInUrl) {
  //       const currentlyVisible = visibleCommentIds.includes(hashInUrl)
  //       if (!currentlyVisible) setParentCommentsToRender(comments.length)
  //     }
  //     setCommentsLength?.(comments.length)
  //   }, [hashInUrl, comments.length])

  //   const loadMore = () => setParentCommentsToRender((prev) => prev + LOAD_MORE)
  //   const onVisibilityUpdated = useEvent((visible: boolean) => {
  //     if (visible) loadMore()
  //   })

  const privateUser = usePrivateUser()
  const onSubmitComment = useEvent(async (editor: Editor) => {
    if (!user) {
      track('sign in to comment on dashboard')
      return await firebaseLogin()
    }
    await createDashboardComment({
      dashboard: dashboard,
      content: editor.getJSON()
      //   replyToCommentId: parentCommentId,
      //   replyToBetId: replyToBet?.id,
    })
    track('dashboard comment', {
      location: 'dashboard page',
      //   replyTo: replyToAnswerId
      //     ? 'answer'
      //     : replyToBet
      //     ? 'bet'
      //     : replyToUserInfo
      //     ? 'user'
      //     : undefined,
    })
  })

  return (
    <>
      {user && (
        <CommentInput
          //   replyToUserInfo={replyToUserInfo}
          //   parentCommentId={parentCommentId}
          onSubmitComment={onSubmitComment}
          pageId={`dashboard-${dashboard.id}`}
          //   className={className}
          blocked={isBlocked(privateUser, dashboard.creator_id)}
        />
      )}
      {/* {comments.length > 0 && (
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
      )} */}
      {/* {parentComments.slice(0, parentCommentsToRender).map((parent) => (
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
        />
      ))} */}

      {/* <div className="relative w-full">
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="pointer-events-none absolute bottom-0 h-[75vh]"
        />
      </div> */}

      {!user && (
        <Button
          onClick={withTracking(
            firebaseLogin,
            'sign up to comment button click'
          )}
          className={clsx(
            'mt-4'
            //   , comments.length > 0 && 'ml-12'
          )}
          size="lg"
          color="gradient"
        >
          Sign up to comment <ArrowRightIcon className="ml-2 h-4 w-4" />
        </Button>
      )}
    </>
  )
}
