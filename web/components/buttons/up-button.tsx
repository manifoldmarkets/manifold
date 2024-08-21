import React, { memo, useEffect, useState, useCallback } from 'react'
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Reaction } from 'common/reaction'
import { User } from 'common/user'
import { useVotesOnComment } from 'web/hooks/use-comment-votes'
import useLongTouch from 'web/hooks/use-long-touch'
import {
  upvote,
  downvote,
  RemoveUpvote,
  RemoveDownvote,
} from 'web/lib/supabase/reactions'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  MultiUserLinkInfo,
  MultiUserTransactionModal,
} from '../multi-user-transaction-link'
import { Avatar } from '../widgets/avatar'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Button, SizeType } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import { track } from 'web/lib/service/analytics'
import { buildArray } from 'common/util/array'
import { UserHovercard } from '../user/user-hovercard'
import { removeUndefinedProps } from 'common/util/object'
import { useUsers } from 'web/hooks/use-user-supabase'
import { DisplayUser } from 'common/api/user-types'
import { TWOMBA_ENABLED } from 'common/envs/constants'

const VOTES_SHOWN = 3

export const CommentVoteButton = memo(function VoteButton(props: {
  contentId: string
  contentCreatorId: string
  user: User | null | undefined
  contentText: string
  trackingLocation: string
  className?: string
  placement?: 'top' | 'bottom'
  size?: SizeType
  disabled?: boolean
  feedReason?: string
  commentId?: string
}) {
  const {
    user,
    contentCreatorId,
    contentId,
    contentText,
    className,
    trackingLocation,
    placement = 'bottom',
    feedReason,
    size,
    commentId,
  } = props

  const votes = useVotesOnComment('comment', contentId)
  const [upvoted, setUpvoted] = useState(false)
  const [downvoted, setDownvoted] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (votes && user) {
      setUpvoted(
        votes.reactions.some(
          (v) => v.user_id === user.id && v.reaction_id === 'upvote'
        )
      )
      setDownvoted(
        votes.reactions.some(
          (v) => v.user_id === user.id && v.reaction_id === 'downvote'
        )
      )
    }
  }, [votes, user])

  const totalUpvotes = votes ? votes.upvotes : 0 // filter((v) => v.reaction_id === 'upvote' && v.user_id !== user?.id).length : 0
  const totalDownvotes = votes ? votes.downvotes : 0 // filter((v) => v.reaction_id === 'downvote' && v.user_id !== user?.id).length : 0

  const disabled = props.disabled || !user
  const isMe = contentCreatorId === user?.id

  const onVote = useCallback(
    async (voteType: 'upvote' | 'downvote') => {
      if (!user) return
      if (isMe) {
        toast("You can't vote on your own content", { icon: '🤨' })
        return
      }

      if (voteType === 'upvote') {
        if (upvoted) {
          await RemoveUpvote(contentId, 'comment')
          setUpvoted(false)
        } else {
          await upvote(contentId, 'comment')
          setUpvoted(true)
          if (downvoted) {
            await RemoveDownvote(contentId, 'comment')
            setDownvoted(false)
          }
        }
      } else {
        if (downvoted) {
          await RemoveDownvote(contentId, 'comment')
          setDownvoted(false)
        } else {
          await downvote(contentId, 'comment')
          setDownvoted(true)
          if (upvoted) {
            await RemoveUpvote(contentId, 'comment')
            setUpvoted(false)
          }
        }
      }
      track(
        'vote',
        removeUndefinedProps({
          itemId: contentId,
          location: trackingLocation,
          commentId: contentId,
          feedReason,
          voteType,
        })
      )
    },
    [user, isMe, contentId, upvoted, downvoted, trackingLocation, feedReason]
  )

  const handleUpvote = useCallback(() => onVote('upvote'), [onVote])
  const handleDownvote = useCallback(() => onVote('downvote'), [onVote])

  const openModal = useCallback(() => setModalOpen(true), [])

  const upvoteLongPress = useLongTouch(openModal, handleUpvote)
  const downvoteLongPress = useLongTouch(openModal, handleDownvote)

  const otherVotes =
    (upvoted ? totalUpvotes + 1 : totalUpvotes) -
    (downvoted ? totalDownvotes + 1 : totalDownvotes)
  const showList = otherVotes !== 0

  return (
    <>
      <Tooltip
        text={
          showList ? (
            <UserVotedPopup
              contentId={contentId}
              onRequestModal={openModal}
              user={user}
              userUpvoted={upvoted}
              userDownvoted={downvoted}
            />
          ) : (
            'Vote'
          )
        }
        placement={placement}
        noTap
        hasSafePolygon={showList}
        className="flex items-center"
      >
        <Row className="items-center gap-1">
          <Button
            color={'gray-white'}
            disabled={disabled}
            size={size}
            className={clsx(
              'text-ink-500 disabled:cursor-not-allowed',
              'disabled:text-ink-500',
              className
            )}
            {...upvoteLongPress}
          >
            <ChevronUpIcon
              className={clsx(
                'h-6 w-6',
                upvoted && 'fill-blue-200 stroke-blue-300 dark:stroke-blue-600'
              )}
            />
          </Button>
          <div className="text-ink-500 my-auto h-5 text-sm disabled:opacity-50">
            {otherVotes}
          </div>
          <Button
            color={'gray-white'}
            disabled={disabled}
            size={size}
            className={clsx(
              'text-ink-500 disabled:cursor-not-allowed',
              'disabled:text-ink-500',
              className
            )}
            {...downvoteLongPress}
          >
            <ChevronDownIcon
              className={clsx(
                'h-6 w-6',
                downvoted &&
                  'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
              )}
            />
          </Button>
        </Row>
      </Tooltip>
      {modalOpen && (
        <UserVotedFullList
          contentId={contentId}
          user={user}
          userUpvoted={upvoted}
          userDownvoted={downvoted}
          setOpen={setModalOpen}
          titleName={contentText}
        />
      )}
    </>
  )
})

function useVoteDisplayList(
  reacts: Reaction[] = [],
  self?: User | null,
  prependSelf?: boolean
) {
  const users = useUsers(reacts.map((r) => r.user_id))

  return buildArray([
    prependSelf && self,
    users?.filter((u): u is DisplayUser => !!u && u.id !== self?.id),
  ])
}

function UserVotedFullList(props: {
  contentId: string
  user?: User | null
  userUpvoted?: boolean
  userDownvoted?: boolean
  setOpen: (isOpen: boolean) => void
  titleName?: string
}) {
  const { contentId, user, userUpvoted, userDownvoted, setOpen, titleName } =
    props
  const react = useVotesOnComment('comment' as const, contentId)
  const displayInfos = useVoteDisplayList(
    react?.reactions,
    user,
    userUpvoted || userDownvoted
  )

  return (
    <MultiUserTransactionModal
      userInfos={displayInfos}
      modalLabel={
        <span>
          {userUpvoted
            ? '💖 Upvoted'
            : userDownvoted
            ? '👎 Downvoted'
            : 'Voted on'}{' '}
          <span className="font-bold">
            {titleName ? titleName : 'this comment'}
          </span>
        </span>
      }
      open={true}
      setOpen={setOpen}
      short={true}
    />
  )
}

function UserVotedPopup(props: {
  contentId: string
  onRequestModal: () => void
  user?: User | null
  userUpvoted?: boolean
  userDownvoted?: boolean
}) {
  const { contentId, onRequestModal, user, userUpvoted, userDownvoted } = props
  const reacts = useVotesOnComment('comment' as const, contentId)
  const displayInfos = useVoteDisplayList(
    reacts?.reactions,
    user,
    userUpvoted || userDownvoted
  )

  if (displayInfos == null) {
    return (
      <Col className="min-w-[6rem] items-start">
        <div className="mb-1 font-bold">Vote</div>
        <LoadingIndicator className="mx-auto my-2" size="sm" />
      </Col>
    )
  }

  // only show "& n more" for n > 1
  const shown =
    displayInfos.length <= VOTES_SHOWN + 1
      ? displayInfos
      : displayInfos.slice(0, VOTES_SHOWN)

  return (
    <Col className="min-w-[6rem] items-start">
      <div className="mb-1 font-bold">Vote</div>
      {shown.map((u, i) => {
        return <UserVotedItem key={i} userInfo={u} />
      })}
      {displayInfos.length > shown.length && (
        <div
          className="text-primary-300 hover:text-primary-200 w-full cursor-pointer text-left"
          onClick={onRequestModal}
        >
          & {displayInfos.length - shown.length} more
        </div>
      )}
    </Col>
  )
}

function UserVotedItem(props: { userInfo: MultiUserLinkInfo }) {
  const { userInfo } = props
  return (
    <UserHovercard userId={userInfo.id}>
      <Row className="items-center gap-1.5">
        <Avatar
          username={userInfo.username}
          avatarUrl={userInfo.avatarUrl}
          size="2xs"
        />
        <UserLink user={userInfo} short={true} />
      </Row>
    </UserHovercard>
  )
}
