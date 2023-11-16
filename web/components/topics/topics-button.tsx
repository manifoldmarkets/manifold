import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Row } from 'web/components/layout/row'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track, withTracking } from 'web/lib/service/analytics'
import { unfollowTopic, SearchGroupInfo } from 'web/lib/supabase/groups'
import { Button, SizeType } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Subtitle } from '../widgets/subtitle'
import { followTopic } from 'web/lib/firebase/api'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Group } from 'common/group'
import { TopicOptions } from 'web/components/topics/topic-options'
import { BookmarkIcon } from '@heroicons/react/outline'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'

function LeavePrivateTopicButton(props: {
  group: SearchGroupInfo
  user: User | undefined | null
  setIsMember: (isMember: boolean) => void
  isMobile?: boolean
  disabled?: boolean
  className?: string
  size?: SizeType
}) {
  const { group, size, user, setIsMember, isMobile, disabled, className } =
    props
  const leavePrivateGroup = user
    ? withTracking(() => {
        unfollowTopic(group.id, user.id)
          .then(() => setIsMember(false))
          .catch(() => {
            toast.error('Failed to unfollow group')
          })
      }, 'leave group')
    : firebaseLogin

  return (
    <>
      <ConfirmationButton
        openModalBtn={{
          className: clsx(
            isMobile
              ? 'bg-inherit hover:bg-inherit inline-flex items-center justify-center disabled:cursor-not-allowed shadow-none px-1'
              : '',
            className
          ),
          color: isMobile ? 'none' : 'indigo',
          disabled: disabled,
          label: isMobile ? '' : ' Leave',
          size: size ?? 'xs',
        }}
        cancelBtn={{
          label: 'Cancel',
        }}
        submitBtn={{
          label: 'Leave group',
          color: 'red',
        }}
        onSubmit={() => {
          leavePrivateGroup()
        }}
      >
        <LeavePrivateGroupModal />
      </ConfirmationButton>
    </>
  )
}

export function LeavePrivateGroupModal() {
  return (
    <>
      <Subtitle className="!mt-0">Are you sure?</Subtitle>
      <p className="text-sm">
        You can't rejoin this group unless invited back. You also won't be able
        to access any questions you have shares in.
      </p>
    </>
  )
}

export function FollowOrUnfolowTopicButton(props: {
  group: SearchGroupInfo
  isMember: boolean | undefined
  user: User | undefined | null
  size?: SizeType
  label?: string
}) {
  const { group, size, user, label } = props
  const isMobile = useIsMobile()

  // Handle both non-live and live updating isMember state
  const [isMember, setIsMember] = useState(props.isMember)
  useEffect(() => {
    setIsMember(props.isMember)
  }, [props.isMember])

  if (group.privacyStatus === 'private') {
    return (
      <LeavePrivateTopicButton
        group={group}
        setIsMember={setIsMember}
        user={user}
        isMobile={isMobile}
        size={size}
      />
    )
  }

  const unfollow = user
    ? withTracking(() => {
        unfollowTopic(group.id, user.id)
          .then(() => setIsMember(false))
          .catch(() => {
            toast.error('Failed to unfollow category')
          })
      }, 'leave group')
    : firebaseLogin
  const follow = user
    ? withTracking(() => {
        followTopic({ groupId: group.id })
          .then(() => setIsMember(true))
          .catch((e) => {
            console.error(e)
            toast.error('Failed to follow category')
          })
      }, 'join group')
    : firebaseLogin

  if (isMember) {
    return (
      <Button
        size={size ?? 'xs'}
        color="gray-outline"
        className={'group'}
        onClick={(e) => {
          e.preventDefault()
          unfollow()
        }}
      >
        <Row className="gap-1">
          <BookmarkIcon className={'group-hover:fill-ink-500 h-5 w-5'} />
          Unfollow{label ? ` ${label}` : ''}
        </Row>
      </Button>
    )
  }
  if (TOPIC_IDS_YOU_CANT_FOLLOW.includes(group.id)) return null
  return (
    <Button
      size={size ?? 'xs'}
      color="indigo"
      className={'group'}
      onClick={(e) => {
        e.preventDefault()
        follow()
      }}
    >
      <Row className="gap-1">
        <BookmarkIcon
          className={'h-5 w-5 transition-colors group-hover:fill-white'}
        />
        Follow{label ? ` ${label}` : ''}
      </Row>
    </Button>
  )
}
export const internalFollowTopic = async (
  user: User | null | undefined,
  group: Group
) => {
  if (!user) return firebaseLogin()
  await followTopic({ groupId: group.id })
    .then(() => {
      toast(`You'll see markets related to ${group.name} on your home feed!`)
    })
    .catch((e) => {
      console.error(e)
      toast.error('Failed to follow topic')
    })
  track('join group', { slug: group.slug })
}
export const unfollowTopicInternal = async (
  user: User | null | undefined,
  group: Group
) => {
  if (!user) return firebaseLogin()
  await unfollowTopic(group.id, user.id)
    .then(() => {
      toast(`You won't see markets related to ${group.name} on your home feed.`)
    })
    .catch(() => {
      toast.error('Failed to unfollow topic')
    })
  track('leave group', { slug: group.slug })
}
export const TopicOptionsButton = (props: {
  group: Group
  yourGroupIds: string[] | undefined
  user: User | null | undefined
  className?: string
}) => {
  const { group, className, yourGroupIds, user } = props
  const [isMember, setIsMember] = useState(
    yourGroupIds ? yourGroupIds.includes(group.id) : false
  )
  useEffect(() => {
    if (yourGroupIds) setIsMember(yourGroupIds.includes(group.id))
  }, [yourGroupIds?.length])

  return (
    <span className={className}>
      <TopicOptions
        group={group}
        user={user}
        isMember={isMember}
        unfollow={() => {
          unfollowTopicInternal(user, group).then(() => {
            setIsMember(false)
          })
        }}
      />
    </span>
  )
}
