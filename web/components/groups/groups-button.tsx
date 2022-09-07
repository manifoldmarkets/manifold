import clsx from 'clsx'
import { User } from 'common/user'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { useMemberGroups, useMemberIds } from 'web/hooks/use-group'
import { TextButton } from 'web/components/text-button'
import { Group } from 'common/group'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { firebaseLogin } from 'web/lib/firebase/users'
import { GroupLinkItem } from 'web/pages/groups'
import toast from 'react-hot-toast'

export function GroupsButton(props: { user: User }) {
  const { user } = props
  const [isOpen, setIsOpen] = useState(false)
  const groups = useMemberGroups(user.id)

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)}>
        <span className="font-semibold">{groups?.length ?? ''}</span> Groups
      </TextButton>

      <GroupsDialog
        user={user}
        groups={groups ?? []}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </>
  )
}

function GroupsDialog(props: {
  user: User
  groups: Group[]
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, groups, isOpen, setIsOpen } = props

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="rounded bg-white p-6">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="p-2 pt-0 text-sm text-gray-500">@{user.username}</div>
        <GroupsList groups={groups} />
      </Col>
    </Modal>
  )
}

function GroupsList(props: { groups: Group[] }) {
  const { groups } = props
  return (
    <Col className="gap-2">
      {groups.length === 0 && (
        <div className="text-gray-500">No groups yet...</div>
      )}
      {groups
        .sort((group1, group2) => group2.createdTime - group1.createdTime)
        .map((group) => (
          <GroupItem key={group.id} group={group} />
        ))}
    </Col>
  )
}

function GroupItem(props: { group: Group; className?: string }) {
  const { group, className } = props
  const user = useUser()
  const memberIds = useMemberIds(group.id)
  return (
    <Row className={clsx('items-center justify-between gap-2 p-2', className)}>
      <Row className="line-clamp-1 items-center gap-2">
        <GroupLinkItem group={group} />
      </Row>
      <JoinOrLeaveGroupButton
        group={group}
        user={user}
        isMember={user ? memberIds?.includes(user.id) : false}
      />
    </Row>
  )
}

export function JoinOrLeaveGroupButton(props: {
  group: Group
  isMember: boolean
  user: User | undefined | null
  small?: boolean
  className?: string
}) {
  const { group, small, className, isMember, user } = props
  const smallStyle =
    'btn !btn-xs border-2 border-gray-500 bg-white normal-case text-gray-500 hover:border-gray-500 hover:bg-white hover:text-gray-500'

  if (!user) {
    if (!group.anyoneCanJoin)
      return <div className={clsx(className, 'text-gray-500')}>Closed</div>
    return (
      <button
        onClick={firebaseLogin}
        className={clsx('btn btn-sm', small && smallStyle, className)}
      >
        Login to follow
      </button>
    )
  }
  const onJoinGroup = () => {
    joinGroup(group, user.id).catch(() => {
      toast.error('Failed to join group')
    })
  }
  const onLeaveGroup = () => {
    leaveGroup(group, user.id).catch(() => {
      toast.error('Failed to leave group')
    })
  }

  if (isMember) {
    return (
      <button
        className={clsx(
          'btn btn-outline btn-xs',
          small && smallStyle,
          className
        )}
        onClick={withTracking(onLeaveGroup, 'leave group')}
      >
        Unfollow
      </button>
    )
  }

  if (!group.anyoneCanJoin)
    return <div className={clsx(className, 'text-gray-500')}>Closed</div>
  return (
    <button
      className={clsx('btn btn-sm', small && smallStyle, className)}
      onClick={withTracking(onJoinGroup, 'join group')}
    >
      Follow
    </button>
  )
}
