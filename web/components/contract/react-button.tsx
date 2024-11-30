import { HeartIcon, ThumbDownIcon, ThumbUpIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { DisplayUser } from 'common/api/user-types'
import { Reaction, ReactionContentTypes, ReactionType } from 'common/reaction'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import { capitalize } from 'lodash'
import { memo, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, SizeType } from 'web/components/buttons/button'
import useLongTouch from 'web/hooks/use-long-touch'
import { useReactionsOnContent } from 'web/hooks/use-reactions'
import { useUsers } from 'web/hooks/use-user-supabase'
import { track } from 'web/lib/service/analytics'
import { react, unreact } from 'web/lib/supabase/reactions'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  MultiUserLinkInfo,
  MultiUserTransactionModal,
} from '../multi-user-transaction-link'
import { UserHovercard } from '../user/user-hovercard'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'

const LIKES_SHOWN = 3

export const ReactButton = memo(function ReactButton(props: {
  contentId: string
  contentCreatorId: string
  user: User | null | undefined
  contentType: ReactionContentTypes
  contentText: string
  trackingLocation: string
  className?: string
  placement?: 'top' | 'bottom'
  reactionType?: ReactionType
  iconType?: 'heart' | 'thumb'
  size?: SizeType
  disabled?: boolean
  feedReason?: string
  contractId?: string
  commentId?: string
  heartClassName?: string
  userReactedWith?: 'like' | 'dislike' | 'none'
  onReact?: () => void
  onUnreact?: () => void
  hideReactList?: boolean
}) {
  const {
    user,
    contentType,
    contentCreatorId,
    contentId,
    contentText,
    className,
    trackingLocation,
    placement = 'bottom',
    feedReason,
    size,
    iconType = 'heart',
    contractId,
    commentId,
    heartClassName,
    reactionType = 'like',
    userReactedWith,
    hideReactList,
  } = props
  const allReactions = useReactionsOnContent(contentType, contentId)
  const reactions = allReactions?.filter(
    (reaction: Reaction) => reaction.reaction_type == reactionType
  )

  const [reacted, setReacted] = useState(
    userReactedWith ? userReactedWith == reactionType : false
  )

  useEffect(() => {
    setReacted(userReactedWith == reactionType)
  }, [userReactedWith])

  useEffect(() => {
    if (reactions)
      setReacted(
        reactions.some(
          (l: Reaction) =>
            l.user_id === user?.id && l.reaction_type == reactionType
        )
      )
  }, [allReactions, user])

  const totalReactions =
    (reactions
      ? reactions.filter((l: Reaction) => l.user_id != user?.id).length
      : 0) + (reacted ? 1 : 0)

  const disabled = props.disabled || !user
  const isMe = contentCreatorId === user?.id
  const [modalOpen, setModalOpen] = useState(false)

  const onReact = async (shouldReact: boolean) => {
    if (!user) return
    setReacted(shouldReact)
    if (shouldReact) {
      if (props.onReact) props.onReact()
      await react(contentId, contentType, reactionType)

      track(
        reactionType,
        removeUndefinedProps({
          itemId: contentId,
          location: trackingLocation,
          contractId:
            contractId ?? (contentType === 'contract' ? contentId : undefined),
          commentId:
            commentId ?? (contentType === 'comment' ? contentId : undefined),
          feedReason,
        })
      )
    } else {
      if (props.onUnreact) props.onUnreact()
      await unreact(contentId, contentType, reactionType)
    }
  }

  function handleReacted(liked: boolean) {
    onReact(liked)
  }

  const likeLongPress = useLongTouch(
    () => {
      if (!hideReactList) {
        setModalOpen(true)
      }
    },
    () => {
      if (!disabled) {
        if (isMe && reactionType === 'like') {
          toast("Of course you'd like yourself", { icon: '🙄' })
        } else {
          handleReacted(!reacted)
        }
      }
    }
  )

  const otherLikes = reacted ? totalReactions - 1 : totalReactions
  const showList = otherLikes > 0 && !hideReactList
  const thumbIcon = iconType == 'thumb' || reactionType == 'dislike'

  console.log(reactionType, 'showList', showList)

  return (
    <>
      <Tooltip
        text={
          showList ? (
            <UserReactedPopup
              contentType={contentType}
              contentId={contentId}
              onRequestModal={() => setModalOpen(true)}
              user={user}
              userReacted={reacted}
              reactionType={reactionType}
            />
          ) : (
            capitalize(reactionType)
          )
        }
        placement={placement}
        noTap
        hasSafePolygon={showList}
        className="flex items-center"
        tooltipClassName="z-40"
      >
        {size == '2xs' ? (
          <button
            disabled={disabled}
            className={clsx(
              'disabled:cursor-not-allowed',
              'disabled:text-ink-500',
              className
            )}
            {...likeLongPress}
          >
            <Row className={'text-ink-600 items-center gap-0.5'}>
              <div className="relative">
                {thumbIcon ? (
                  reactionType == 'dislike' ? (
                    <ThumbDownIcon
                      className={clsx(
                        'stroke-ink-500 h-4 w-4',
                        reacted && 'stroke-scarlet-500 fill-scarlet-200'
                      )}
                    />
                  ) : (
                    <ThumbUpIcon
                      className={clsx(
                        'stroke-ink-500 h-4 w-4',
                        reacted && 'fill-teal-200 stroke-teal-500 '
                      )}
                    />
                  )
                ) : (
                  <HeartIcon
                    className={clsx(
                      'stroke-ink-500 h-4 w-4',
                      reacted &&
                        'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
                    )}
                  />
                )}
              </div>
              {totalReactions > 0 && (
                <div className=" text-sm disabled:opacity-50">
                  {totalReactions}
                </div>
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
            {...likeLongPress}
          >
            <Row className={'items-center gap-1.5'}>
              <div className="relative">
                {thumbIcon ? (
                  reactionType == 'dislike' ? (
                    <ThumbDownIcon
                      className={clsx(
                        'h-6 w-6',
                        heartClassName,
                        reacted && 'fill-scarlet-200 stroke-scarlet-500 '
                      )}
                    />
                  ) : (
                    <ThumbUpIcon
                      className={clsx(
                        'h-6 w-6',
                        heartClassName,
                        reacted && 'fill-teal-200 stroke-teal-500 '
                      )}
                    />
                  )
                ) : (
                  <HeartIcon
                    className={clsx(
                      'h-6 w-6',
                      heartClassName,
                      reacted &&
                        'fill-scarlet-200 stroke-scarlet-300 dark:stroke-scarlet-600'
                    )}
                  />
                )}
              </div>
              {totalReactions > 0 && (
                <div className="my-auto h-5  text-sm disabled:opacity-50">
                  {totalReactions}
                </div>
              )}
            </Row>
          </Button>
        )}
      </Tooltip>
      {modalOpen && (
        <UserReactedFullList
          contentType={contentType}
          contentId={contentId}
          user={user}
          userReacted={reacted}
          setOpen={setModalOpen}
          titleName={contentText}
          reactionType={reactionType}
        />
      )}
    </>
  )
})

function useReactedDisplayList(
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

function UserReactedFullList(props: {
  contentType: ReactionContentTypes
  contentId: string
  user?: User | null
  userReacted?: boolean
  setOpen: (isOpen: boolean) => void
  titleName?: string
  reactionType: ReactionType
}) {
  const {
    contentType,
    contentId,
    user,
    userReacted,
    setOpen,
    titleName,
    reactionType,
  } = props
  const reacts = useReactionsOnContent(contentType, contentId)?.filter(
    (reaction: Reaction) => reaction.reaction_type == reactionType
  )

  const displayInfos = useReactedDisplayList(reacts, user, userReacted)

  return (
    <MultiUserTransactionModal
      userInfos={displayInfos}
      modalLabel={
        <span>
          {capitalize(reactionType + 'd ')}
          <span className="font-bold">
            {titleName
              ? titleName
              : contentType === 'contract'
              ? 'this question'
              : `this ${contentType}`}
          </span>
        </span>
      }
      open={true}
      setOpen={setOpen}
      short={true}
    />
  )
}

function UserReactedPopup(props: {
  contentType: ReactionContentTypes
  contentId: string
  onRequestModal: () => void
  user?: User | null
  userReacted?: boolean
  reactionType: ReactionType
}) {
  const {
    contentType,
    contentId,
    onRequestModal,
    user,
    userReacted,
    reactionType,
  } = props
  const reacts = useReactionsOnContent(contentType, contentId)?.filter(
    (reaction: Reaction) => reaction.reaction_type == reactionType
  )

  const displayInfos = useReactedDisplayList(reacts, user, userReacted)

  if (displayInfos == null) {
    return (
      <Col className="min-w-[6rem] items-start">
        <div className="mb-1 font-bold">{capitalize(reactionType)}</div>
        <LoadingIndicator className="mx-auto my-2" size="sm" />
      </Col>
    )
  }

  // only show "& n more" for n > 1
  const shown =
    displayInfos.length <= LIKES_SHOWN + 1
      ? displayInfos
      : displayInfos.slice(0, LIKES_SHOWN)

  return (
    <Col className="min-w-[6rem] items-start">
      <div className="mb-1 font-bold">{capitalize(reactionType)}</div>
      {shown.map((u, i) => {
        return <UserReactedItem key={i} userInfo={u} />
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

function UserReactedItem(props: { userInfo: MultiUserLinkInfo }) {
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
