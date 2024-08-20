import React, { memo, useEffect, useState } from 'react'
 import { ChevronUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Reaction } from 'common/reaction'
import { User } from 'common/user'
import { useVotesOnComment } from 'web/hooks/use-comment-votes'
import useLongTouch from 'web/hooks/use-long-touch'
import { upvote, RemoveUpvote } from 'web/lib/supabase/reactions'
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

export const UpButton = memo(function UpButton(props: {
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
  const votes = useVotesOnComment('comment' as const, contentId)
  const [voted, setVoted] = useState(false)
  useEffect(() => {
    if (votes) setVoted(votes.some((v) => v.user_id === user?.id))
  }, [votes, user])

  const totalVotes =
    (votes ? votes.filter((v) => v.user_id !== user?.id).length : 0) +
    (voted ? 1 : 0)

  const disabled = props.disabled || !user
  const isMe = contentCreatorId === user?.id
  const [modalOpen, setModalOpen] = useState(false)

  const onVote = async (shouldVote: boolean) => {
    if (!user) return
    setVoted(shouldVote)
    if (shouldVote) {
      await upvote(contentId, 'comment')

      track(
        'vote',
        removeUndefinedProps({
          itemId: contentId,
          location: trackingLocation,
          commentId: contentId,
          feedReason,
        })
      )
    } else {
      await RemoveUpvote(contentId, 'comment')
    }
  }

  function handleVoted() {
    onVote(!voted)
  }

  const voteLongPress = useLongTouch(
    () => {
      setModalOpen(true)
    },
    () => {
      if (!disabled) {
        if (isMe) {
          toast("Of course you'd like yourself", { icon: '🙄' })
        } else {
          handleVoted()
        }
      }
    }
  )

  const otherVotes = voted ? totalVotes - 1 : totalVotes
  const showList = otherVotes > 0

  return (
    <>
      <Tooltip
        text={
          showList ? (
            <UserVotedPopup
              contentId={contentId}
              onRequestModal={() => setModalOpen(true)}
              user={user}
              userVoted={voted}
            />
          ) : (
            'Upvote'
          )
        }
        placement={placement}
        noTap
        hasSafePolygon={showList}
        className="flex items-center"
      >
        {TWOMBA_ENABLED && trackingLocation == 'contract page' ? (
          <button
            disabled={disabled}
            className={clsx(
              'disabled:cursor-not-allowed',
              'disabled:text-ink-500',
              className
            )}
            {...voteLongPress}
          >
            <Row className={'items-center gap-0.5'}>
              <div className="relative">
                <ChevronUpIcon
                  className={clsx(
                    'stroke-ink-500 h-4 w-4',
                    voted &&
                      'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
                  )}
                />
              </div>
              {totalVotes > 0 && (
                <div className=" text-sm disabled:opacity-50">{totalVotes}</div>
              )}
            </Row>
          </button>
        ) : (
          <Button
            color={'gray-white'}
            disabled={disabled}
            size={size}
            className={clsx(
              'text-ink-500 disabled:cursor-not-allowed',
              'disabled:text-ink-500',
              className
            )}
            {...voteLongPress}
          >
            <Row className={'items-center gap-1.5'}>
              <div className="relative">
                <ChevronUpIcon
                  className={clsx(
                    'h-6 w-6',
                    voted &&
                      'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
                  )}
                />
              </div>
              {totalVotes > 0 && (
                <div className="text-ink-500 my-auto h-5  text-sm disabled:opacity-50">
                  {totalVotes}
                </div>
              )}
            </Row>
          </Button>
        )}
      </Tooltip>
      {modalOpen && (
        <UserVotedFullList
          contentId={contentId}
          user={user}
          userVoted={voted}
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
  userVoted?: boolean
  setOpen: (isOpen: boolean) => void
  titleName?: string
}) {
  const { contentId, user, userVoted, setOpen, titleName } = props
  const reacts = useVotesOnComment('comment' as const, contentId)
  const displayInfos = useVoteDisplayList(reacts, user, userVoted)

  return (
    <MultiUserTransactionModal
      userInfos={displayInfos}
      modalLabel={
        <span>
          💖 Upvoted {' '}
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
  userVoted?: boolean
}) {
  const { contentId, onRequestModal, user, userVoted } = props
  const reacts = useVotesOnComment('comment' as const, contentId)
  const displayInfos = useVoteDisplayList(reacts, user, userVoted)

  if (displayInfos == null) {
    return (
      <Col className="min-w-[6rem] items-start">
        <div className="mb-1 font-bold">Upvote</div>
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
