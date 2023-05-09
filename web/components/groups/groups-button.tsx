import { UserAddIcon, UserRemoveIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { TextButton } from 'web/components/buttons/text-button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useUser } from 'web/hooks/use-user'
import { leaveGroup } from 'web/lib/firebase/groups'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import {
  SearchGroupInfo,
  getMemberGroups,
  getMemberGroupsCount,
} from 'web/lib/supabase/groups'
import { groupButtonClass } from 'web/pages/group/[...slugs]'
import { GroupLinkItem } from 'web/pages/groups'
import { Button, buttonClass } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Subtitle } from '../widgets/subtitle'
import { joinGroup } from 'web/lib/firebase/api'

export function GroupsButton(props: { user: User; className?: string }) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)
  const [groups, setGroups] = useState<SearchGroupInfo[] | undefined>(undefined)
  const [groupsCount, setGroupsCount] = useState(0)
  useEffect(() => {
    if (isOpen) return
    getMemberGroupsCount(user.id).then(setGroupsCount)
  }, [user.id, isOpen])

  useEffect(() => {
    if (!isOpen) return
    getMemberGroups(user.id, db).then(setGroups)
  }, [isOpen, user.id])

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)} className={className}>
        <span className="font-semibold">{groupsCount}</span> Groups
      </TextButton>

      <GroupsDialog
        user={user}
        groups={groups}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </>
  )
}

function GroupsDialog(props: {
  user: User
  groups: SearchGroupInfo[] | undefined
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, isOpen, setIsOpen, groups } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user.id

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="bg-canvas-0 rounded p-6">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="text-ink-500 p-2 pt-0 text-sm">@{user.username}</div>
        <Col className="gap-2">
          {groups === undefined ? (
            <LoadingIndicator />
          ) : groups.length === 0 ? (
            <div className="text-ink-500">No groups yet...</div>
          ) : (
            groups.map((group) => (
              <Row
                className={clsx('items-center justify-between gap-2 p-2')}
                key={group.id}
              >
                <Row className="line-clamp-1 items-center gap-2">
                  <GroupLinkItem group={group} />
                </Row>
                {isCurrentUser && (
                  <JoinOrLeaveGroupButton
                    group={group}
                    user={user}
                    isMember={true}
                  />
                )}
              </Row>
            ))
          )}
        </Col>{' '}
      </Col>
    </Modal>
  )
}

export function LeavePrivateGroupButton(props: {
  group: SearchGroupInfo
  user: User | undefined | null
  setIsMember: (isMember: boolean) => void
  isMobile?: boolean
  disabled?: boolean
}) {
  const { group, user, setIsMember, isMobile, disabled } = props
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
              ? 'bg-inherit hover:bg-inherit inline-flex items-center justify-center disabled:cursor-not-allowed shadow-none px-1 '
              : buttonClass('md', 'dark-gray')
          ),
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
      <Subtitle>Are you sure?</Subtitle>
      <p className="text-sm">
        You can't rejoin this group unless invited back. You also won't be able
        to access any markets you have shares in.
      </p>
    </>
  )
}

export function JoinOrLeaveGroupButton(props: {
  group: SearchGroupInfo
  isMember: boolean | undefined
  user: User | undefined | null
  className?: string
  isMobile?: boolean
  disabled?: boolean
}) {
  const { group, className, user, isMobile, disabled } = props

  // Handle both non-live and live updating isMember state
  const [isMember, setIsMember] = useState(props.isMember)
  useEffect(() => setIsMember(props.isMember), [props.isMember])
  if (group.privacyStatus === 'private') {
    return (
      <LeavePrivateGroupButton
        group={group}
        setIsMember={setIsMember}
        user={user}
        isMobile={isMobile}
        disabled={disabled}
      />
    )
  }

  const unfollow = user
    ? withTracking(() => {
        leaveGroup(group.id, user.id)
          .then(() => setIsMember(false))
          .catch(() => {
            toast.error('Failed to unfollow group')
          })
      }, 'leave group')
    : firebaseLogin
  const follow = user
    ? withTracking(() => {
        joinGroup({ groupId: group.id })
          .then(() => setIsMember(true))
          .catch(() => {
            toast.error('Failed to follow group')
          })
      }, 'join group')
    : firebaseLogin

  if (isMember) {
    if (isMobile) {
      return (
        <button className={className} onClick={unfollow} disabled={disabled}>
          <UserRemoveIcon className={clsx('h-5 w-5', groupButtonClass)} />
        </button>
      )
    }
    return (
      <Button color="dark-gray" className={className} onClick={unfollow}>
        <Row className="gap-1">
          <UserRemoveIcon className="h-5 w-5" />
          Leave
        </Row>
      </Button>
    )
  }

  if (isMobile) {
    return (
      <button
        className={className}
        onClick={() => follow()}
        disabled={disabled}
      >
        <UserAddIcon className={clsx('h-5 w-5', groupButtonClass)} />
      </button>
    )
  }
  return (
    <Button color="indigo" className={className} onClick={() => follow()}>
      <Row className="gap-1">
        <UserAddIcon className="h-5 w-5" />
        Join
      </Row>
    </Button>
  )
}
