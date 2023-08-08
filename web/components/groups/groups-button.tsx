import { UserAddIcon, UserRemoveIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Row } from 'web/components/layout/row'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { leaveGroup, SearchGroupInfo } from 'web/lib/supabase/groups'
import { groupButtonClass } from 'web/pages/group/[...slugs]'
import { Button } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Subtitle } from '../widgets/subtitle'
import { joinGroup } from 'web/lib/firebase/api'

export function LeavePrivateGroupButton(props: {
  group: SearchGroupInfo
  user: User | undefined | null
  setIsMember: (isMember: boolean) => void
  isMobile?: boolean
  disabled?: boolean
  className?: string
}) {
  const { group, user, setIsMember, isMobile, disabled, className } = props
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
          color: isMobile ? 'none' : 'dark-gray',
          disabled: disabled,
          icon: (
            <UserRemoveIcon
              className={clsx(
                'h-5 w-5',
                isMobile
                  ? 'disabled:text-ink-200 text-ink-500 hover:text-ink-900 transition-colors '
                  : ''
              )}
            />
          ),
          label: isMobile ? '' : ' Leave',
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

export function JoinOrLeaveGroupButton(props: {
  group: SearchGroupInfo
  isMember: boolean | undefined
  user: User | undefined | null
  className?: string
  iconClassName?: string
  isMobile?: boolean
  disabled?: boolean
}) {
  const { group, user, isMobile, disabled, iconClassName } = props

  // Handle both non-live and live updating isMember state
  const [isMember, setIsMember] = useState(props.isMember)
  useEffect(() => setIsMember(props.isMember), [props.isMember])

  const className = clsx(
    isMobile ? 'rounded p-1' : '',
    isMobile
      ? isMember
        ? 'dark:bg-ink-400 hover:bg-ink-700 bg-gray-500'
        : 'bg-primary-500 hover:bg-primary-600'
      : 'px-1 py-1',
    props.className
  )
  if (group.privacyStatus === 'private') {
    return (
      <LeavePrivateGroupButton
        group={group}
        setIsMember={setIsMember}
        user={user}
        isMobile={isMobile}
        disabled={disabled}
        className={className}
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
    if (isMobile) {
      return (
        <button
          className={className}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            unfollow()
          }}
          disabled={disabled}
        >
          <UserRemoveIcon
            className={clsx('h-5 w-5', groupButtonClass, iconClassName)}
          />
        </button>
      )
    }
    return (
      <Button
        color="dark-gray"
        className={className}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          unfollow()
        }}
        disabled={disabled}
      >
        <Row className="gap-1">
          <UserRemoveIcon className="h-5 w-5" />
          Unfollow
        </Row>
      </Button>
    )
  }

  if (isMobile) {
    return (
      <button
        className={className}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          follow()
        }}
        disabled={disabled}
      >
        <UserAddIcon
          className={clsx('h-5 w-5', groupButtonClass, iconClassName)}
        />
      </button>
    )
  }
  return (
    <Button
      color="indigo"
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        follow()
      }}
    >
      <Row className="gap-1">
        <UserAddIcon className="h-5 w-5" />
        Follow
      </Row>
    </Button>
  )
}
