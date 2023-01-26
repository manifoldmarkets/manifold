import { DotsVerticalIcon, HashtagIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { buildArray } from 'common/util/array'
import { useEffect, useRef, useState } from 'react'
import { useIntersection } from 'web/hooks/use-intersection'
import { updateRole } from 'web/lib/firebase/groups'
import {
  getGroupAdmins,
  getGroupMembers,
  getGroupModerators,
  getNumGroupMembers,
} from 'web/lib/supabase/group'
import DropdownMenu from '../comments/dropdown-menu'
import { Col } from '../layout/col'
import { MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { UserLink } from '../widgets/user-link'

export function GroupMemberModalContent(props: {
  group: Group
  canEdit: boolean
}) {
  const { group, canEdit } = props
  const [admins, setAdmins] = useState<JSONContent[] | undefined>(undefined)
  const [moderators, setModerators] = useState<JSONContent[] | undefined>(
    undefined
  )
  const [members, setMembers] = useState<JSONContent[] | undefined>(undefined)
  const [membersOffset, setMembersOffset] = useState<number>(0)
  const [numMembers, setNumMembers] = useState<number | undefined>(undefined)
  const [loadMore, setLoadMore] = useState<boolean>(false)

  useEffect(() => {
    getNumGroupMembers(group.id)
      .then((result) => setNumMembers(result))
      .catch((e) => console.log(e))

    getGroupAdmins(group.id)
      .then((result) => setAdmins(result.data))
      .catch((e) => console.log(e))

    getGroupModerators(group.id)
      .then((result) => setModerators(result.data))
      .catch((e) => console.log(e))

    getGroupMembers(group.id, membersOffset)
      .then((result) => {
        setMembers(result.data)
      })
      .catch((e) => console.log(e))
  }, [])

  const modalRootRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef<HTMLDivElement | null>(null)
  const hitBottom = useIntersection(loadingRef, '0px', modalRootRef)

  useEffect(() => {
    if (hitBottom && !loadMore) {
      loadMoreMembers()
    }
  }, [hitBottom])

  function loadMoreMembers() {
    setLoadMore(true)
    getGroupMembers(group.id, membersOffset + 1)
      .then((result) => {
        if (members) {
          const prevMembers = members
          setMembers([...prevMembers, ...result.data])
        } else {
          setMembers(result.data)
        }
        setMembersOffset((membersOffset) => membersOffset + 1)
      })
      .catch((e) => console.log(e))
      .finally(() => setLoadMore(false))
  }
  return (
    <Col className={clsx(MODAL_CLASS, 'px-0')}>
      <div
        ref={modalRootRef}
        className={clsx('flex w-full flex-col px-8', SCROLLABLE_MODAL_CLASS)}
      >
        <span className="text-xl">👥 Members</span>
        <MemberRoleSection
          group={group}
          members={admins}
          role={'admin'}
          canEdit={canEdit}
        />
        <MemberRoleSection
          group={group}
          members={moderators}
          role={'moderator'}
          canEdit={canEdit}
        />
        <MemberRoleSection
          group={group}
          members={members}
          role={'member'}
          canEdit={canEdit}
        />
        <div
          ref={loadingRef}
          className={
            numMembers &&
            admins &&
            moderators &&
            members &&
            numMembers > admins.length + moderators.length + members.length
              ? // && !loadMore
                ''
              : 'hidden'
          }
        >
          <LoadingMember />
        </div>
      </div>
    </Col>
  )
}

export type groupRoleType = 'admin' | 'moderator' | 'member'
export const roleDescription = {
  admin: `Can appoint roles, add and delete anyone's content from group`,
  moderator: `Can add and delete anyone's content from group`,
  member: 'Can only add their own content to group',
}

export function LoadingMember(props: { className?: string }) {
  const { className } = props
  return (
    <Row
      className={clsx(
        'my-3 w-full items-center justify-between gap-2',
        className
      )}
    >
      <Row className="items-center gap-2">
        <Avatar
          username={undefined}
          avatarUrl={undefined}
          size={'sm'}
          className="animate-pulse"
        />
        <Col className="h-full justify-end">
          <div className="h-4 w-32 animate-pulse bg-gray-400" />
        </Col>
      </Row>
    </Row>
  )
}

export function MemberRoleSection(props: {
  group: Group
  members: JSONContent[] | undefined
  role: groupRoleType
  canEdit: boolean
}) {
  const { group, members, role, canEdit } = props
  return (
    <Col className="w-full gap-3">
      <MemberRoleHeader headerText={`${role.toLocaleUpperCase()}S`} />
      {members === undefined ? (
        <LoadingIndicator />
      ) : members.length === 0 ? (
        <div className="text-gray-400">{`No ${role}s yet...`}</div>
      ) : (
        members.map((member) => {
          return (
            <Member
              key={member.member_id}
              group={group}
              member={member}
              canEdit={canEdit}
            />
          )
        })
      )}
    </Col>
  )
}

export function MemberRoleHeader(props: {
  headerText: string
  description?: string
}) {
  const { headerText, description } = props
  return (
    <Row className="sticky -top-1 w-full gap-2 bg-white pt-4 text-sm text-gray-400">
      <div className="my-auto flex h-[1px] grow bg-gray-400" />
      {headerText}
      <div className="my-auto flex h-[1px] grow bg-gray-400" />
    </Row>
  )
}

export function Member(props: {
  group: Group
  member: JSONContent
  canEdit: boolean
}) {
  const { group, member, canEdit } = props
  const isCreator = member.member_id === member.creator_id
  const tag = member.role ? (
    <div
      className={clsx(
        'font-regular rounded px-2 py-1 text-xs text-white',
        isCreator
          ? 'bg-indigo-300'
          : member.role === 'admin'
          ? 'bg-indigo-200'
          : 'bg-gray-200'
      )}
    >
      {isCreator ? 'CREATOR' : `${member.role.toLocaleUpperCase()}S`}
    </div>
  ) : undefined

  return (
    <Row className="w-full items-center justify-between gap-2">
      <Row className="items-center gap-2">
        <Avatar
          username={member.username}
          avatarUrl={member.avatar_url}
          size={'sm'}
        />
        <UserLink name={member.name} username={member.username} />
      </Row>
      <Row className="gap-1">
        {tag}
        {canEdit && <MemberRoleDropdown group={group} member={member} />}
      </Row>
    </Row>
  )
}

export function MemberRoleDropdown(props: {
  group: Group
  member: JSONContent
  className?: string
}) {
  const { group, member, className } = props
  const groupMemberOptions = buildArray(
    (!member.role || member.role === 'moderator') && {
      name: 'Make admin',
      onClick: () => {
        updateRole(group.id, member.member_id, 'admin')
      },
    },
    !member.role && {
      name: 'Make moderator',
      onClick: () => {
        updateRole(group.id, member.member_id, 'moderator')
      },
    }
  )
  return (
    <DropdownMenu
      Items={groupMemberOptions}
      Icon={<DotsVerticalIcon className={clsx('h-5 w-5 text-gray-400')} />}
      menuWidth={'w-40'}
      className={clsx(className)}
    />
  )
}
