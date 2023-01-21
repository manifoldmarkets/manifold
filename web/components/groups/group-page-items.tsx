import { UserGroupIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { useState } from 'react'
import { useMembers } from 'web/hooks/use-group'
import {
  default as ClosedDoorIcon,
  default as OpenDoorIcon,
} from 'web/lib/icons/open-door-icon'
import { getGroupAdmins, getGroupFollowers } from 'web/lib/supabase/groups'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { MultiUserTransactionModal } from '../multi-user-transaction-link'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'

export default function GroupOpenClosedWidget(props: { group: Group }) {
  const { group } = props
  return (
    <Row className="items-center gap-1 text-sm text-gray-700">
      {group.anyoneCanJoin && (
        <>
          <OpenDoorIcon className="h-4 w-4" />
          <span>Open</span>
        </>
      )}
      {!group.anyoneCanJoin && (
        <>
          <ClosedDoorIcon className="h-4 w-4" />
          <span>Closed</span>
        </>
      )}
    </Row>
  )
}

//for larget groups, getting a too many outstanding requests error
export function GroupMembersWidget(props: { group: Group }) {
  const { group } = props
  const [open, setOpen] = useState(false)
  // const groupMembers = useMembers(group.id)
  // const groupMembersItems = groupMembers
  //   .filter((groupMember) => groupMember)
  //   .map((groupMember) => {
  //     return {
  //       name: groupMember.name,
  //       username: groupMember.username,
  //       avatarUrl: groupMember.avatarUrl,
  //     }
  //   })
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Row className="cursor-pointer items-center gap-1 text-sm text-gray-700">
          <Row className="items-center gap-1 text-sm text-gray-700"></Row>
          <UserGroupIcon className="h-4 w-4" />
          <span>{group.totalMembers} members</span>
        </Row>
      </button>
      <GroupMembersModal group={group} open={open} setOpen={setOpen} />
    </>
  )
}

export function GroupMembersModal(props: {
  group: Group
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { group, open, setOpen } = props
  const [admins, setAdmins] = useState<JSONContent[] | undefined>(undefined)
  const [followers, setFollowers] = useState<JSONContent[] | undefined>(
    undefined
  )

  getGroupAdmins(group.id)
    .then((result) => setAdmins(result.data))
    .catch((e) => console.log(e))
  getGroupFollowers(group.id)
    .then((result) => {
      setFollowers(result.data)
    })
    .catch((e) => console.log(e))
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <Col className={clsx('h-full w-full', SCROLLABLE_MODAL_CLASS)}>
          <span className="text-xl">👥 Members</span>
          <MemberRoleSection members={admins} role={'admin'} />
          <MemberRoleSection members={followers} role={'follower'} />
          <Col className="w-full gap-3">
            <Row className="sticky -top-1 w-full gap-2 bg-white py-4 text-sm text-gray-400">
              <div className="my-auto flex h-[1px] grow bg-gray-400" />
              FOLLOWERS
              <div className="my-auto flex h-[1px] grow bg-gray-400" />
            </Row>
            {followers === undefined ? (
              <LoadingIndicator />
            ) : (
              followers.map((follower) => {
                return (
                  <Row
                    key={follower.member_id}
                    className="w-full items-center justify-between gap-2"
                  >
                    <Row className="items-center gap-2">
                      <Avatar
                        username={follower.username}
                        avatarUrl={follower.avatar_url}
                        size={'sm'}
                      />
                      {follower.name}
                    </Row>
                  </Row>
                )
              })
            )}
          </Col>
        </Col>
      </Col>
    </Modal>
  )
}

export type groupRoleType = 'admin' | 'contributor' | 'follower'

export function MemberRoleSection(props: {
  members: JSONContent[] | undefined
  role: groupRoleType
}) {
  const { members, role } = props
  return (
    <Col className="w-full gap-3">
      <MemberRoleHeader
        headerText={
          role === 'admin'
            ? 'ADMINS'
            : role === 'contributor'
            ? 'CONTRIBUTORS'
            : 'FOLLOWERS'
        }
      />
      {members === undefined ? (
        <LoadingIndicator />
      ) : members.length === 0 ? (
        <div className="text-gray-400">{`No ${role}s yet...`}</div>
      ) : (
        members.map((member) => {
          return <Member member={member} />
        })
      )}
    </Col>
  )
}

export function MemberRoleHeader(props: { headerText: string }) {
  const { headerText } = props
  return (
    <Row className="sticky -top-1 w-full gap-2 bg-white py-4 text-sm text-gray-400">
      <div className="my-auto flex h-[1px] grow bg-gray-400" />
      {headerText}
      <div className="my-auto flex h-[1px] grow bg-gray-400" />
    </Row>
  )
}

export function Member(props: { member: JSONContent }) {
  const { member } = props
  let tag
  if (member.role === 'admin') {
    const isCreator = member.member_id === member.creator_id
    tag = (
      <div
        className={clsx(
          'font-regular rounded px-2 py-1 text-xs text-white',
          isCreator ? 'bg-indigo-300' : 'bg-indigo-200'
        )}
      >
        {member.member_id === member.creator_id ? 'CREATOR' : 'ADMIN'}
      </div>
    )
  }

  if (member.role === 'contributor') {
    tag = (
      <div
        className={clsx(
          'font-regular rounded bg-gray-200 px-2 py-1 text-xs text-white'
        )}
      >
        CONTRIBUTOR
      </div>
    )
  }
  return (
    <Row
      key={member.member_id}
      className="w-full items-center justify-between gap-2"
    >
      <Row className="items-center gap-2">
        <Avatar
          username={member.username}
          avatarUrl={member.avatar_url}
          size={'sm'}
        />
        {member.name}
      </Row>
      {tag}
    </Row>
  )
}
