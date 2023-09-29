import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Row } from 'web/components/layout/row'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track, withTracking } from 'web/lib/service/analytics'
import { leaveGroup, SearchGroupInfo } from 'web/lib/supabase/groups'
import { Button, SizeType } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Subtitle } from '../widgets/subtitle'
import { joinGroup } from 'web/lib/firebase/api'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Group } from 'common/group'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { TopicOptions } from 'web/components/topics/topic-options'
import { Col } from 'web/components/layout/col'
import { BookmarkIcon } from '@heroicons/react/outline'

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
        leaveGroup(group.id, user.id)
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
  useEffect(() => setIsMember(props.isMember), [props.isMember])

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
        leaveGroup(group.id, user.id)
          .then(() => setIsMember(false))
          .catch(() => {
            toast.error('Failed to unfollow category')
          })
      }, 'leave group')
    : firebaseLogin
  const follow = user
    ? withTracking(() => {
        joinGroup({ groupId: group.id })
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
        onClick={(e) => {
          e.preventDefault()
          unfollow()
        }}
      >
        <Row className="gap-1">Unfollow{label ? ` ${label}` : ''}</Row>
      </Button>
    )
  }

  return (
    <Button
      size={size ?? 'xs'}
      color="indigo"
      onClick={(e) => {
        e.preventDefault()
        follow()
      }}
    >
      <Row className="gap-1">Follow{label ? ` ${label}` : ''}</Row>
    </Button>
  )
}
export const followTopic = async (
  user: User | null | undefined,
  group: Group
) => {
  if (!user) return firebaseLogin()
  await joinGroup({ groupId: group.id })
    .then(() => {
      toast(`You'll see markets related to ${group.name} on your home feed!`)
    })
    .catch((e) => {
      console.error(e)
      toast.error('Failed to follow category')
    })
  track('join group', { slug: group.slug })
}
export const unfollowTopic = async (
  user: User | null | undefined,
  group: Group
) => {
  if (!user) return firebaseLogin()
  await leaveGroup(group.id, user.id)
    .then(() => {
      toast(`You won't see markets related to ${group.name} on your home feed.`)
    })
    .catch(() => {
      toast.error('Failed to unfollow category')
    })
  track('leave group', { slug: group.slug })
}
export const TopicOptionsButton = (props: {
  group: Group
  yourGroupIds: string[] | undefined
  user: User | null | undefined
  className?: string
  selected: boolean
}) => {
  const { group, selected, className, yourGroupIds, user } = props
  const isCreator = user?.id == group.creatorId
  const [isMember, setIsMember] = useState(
    yourGroupIds ? yourGroupIds.includes(group.id) : false
  )
  useEffect(() => {
    if (yourGroupIds) setIsMember(yourGroupIds.includes(group.id))
  }, [yourGroupIds?.length])
  const [loading, setLoading] = useState(false)
  const isPrivate = group.privacyStatus == 'private'

  return (
    <Col className={className}>
      {!isPrivate && !isCreator && !isMember && yourGroupIds && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setLoading(true)
            followTopic(user, group)
              .then(() => setIsMember(true))
              .finally(() => setLoading(false))
          }}
          className={'h-5 w-5'}
        >
          {loading ? (
            <LoadingIndicator size={'sm'} />
          ) : (
            <BookmarkIcon
              className={'text-ink-600 hover:fill-ink-600 h-5 w-5'}
            />
          )}
        </button>
      )}
      {(isCreator || isMember) && (
        <TopicOptions
          group={group}
          user={user}
          isMember={isMember}
          unfollow={() => {
            setLoading(true)
            unfollowTopic(user, group)
              .then(() => {
                setIsMember(false)
              })
              .finally(() => setLoading(false))
          }}
          selected={selected}
        />
      )}
    </Col>
  )
}
