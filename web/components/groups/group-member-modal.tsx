import { DotsVerticalIcon, HashtagIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { useEffect, useRef, useState } from 'react'
import { useRealtimeGroupMembers } from 'web/hooks/use-group-supabase'
import { useIntersection } from 'web/hooks/use-intersection'
import { useUser } from 'web/hooks/use-user'
import { removeRole, updateRole } from 'web/lib/firebase/groups'
import {
  getGroupMembers,
  getGroupOfRole,
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
  numMembers: number
}) {
  const { group, canEdit, numMembers } = props
  const modalRootRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef<HTMLDivElement | null>(null)
  const hitBottom = useIntersection(loadingRef, '0px', modalRootRef)

  const { admins, moderators, members, loadMore } = useRealtimeGroupMembers(
    group.id,
    hitBottom
  )

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
            numMembers > admins.length + moderators.length + members.length &&
            !loadMore
              ? ''
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
  admin: `Can appoint roles, edit the group, and add or delete anyone's content from group`,
  moderator: `Can add or delete anyone's content from group`,
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
  if (role === 'moderator') {
    console.log('section', role, members)
  }
  return (
    <Col className="w-full gap-3">
      <MemberRoleHeader
        headerText={`${role.toLocaleUpperCase()}S`}
        description={roleDescription[role]}
      />
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
    <Col className="gap-0.5 bg-white pt-4 text-sm text-gray-400">
      <Row className="w-full gap-2 font-semibold">
        <div className="my-auto flex h-[1px] grow bg-gray-400" />
        {headerText}
        <div className="my-auto flex h-[1px] grow bg-gray-400" />
      </Row>
      {description && (
        <div className="text-xs text-gray-500">{description}</div>
      )}
    </Col>
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
          ? 'bg-indigo-400'
          : member.role === 'admin'
          ? 'bg-indigo-300'
          : 'bg-gray-300'
      )}
    >
      {isCreator ? 'CREATOR' : `${member.role.toLocaleUpperCase()}`}
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
      <Row className="items-center gap-1">
        {tag}
        {canEdit && member.role != 'admin' && (
          <AdminRoleDropdown group={group} member={member} />
        )}
      </Row>
    </Row>
  )
}

// the dropdown for each member that is available to group admins
export function AdminRoleDropdown(props: {
  group: Group
  member: JSONContent
  className?: string
}) {
  const { group, member, className } = props
  const groupMemberOptions = buildArray(
    // if the member is below admin, can upgrade to admin
    (!member.role || member.role === 'moderator') && {
      name: 'Make admin',
      onClick: () => {
        updateRole(group.id, member.member_id, 'admin')
      },
    },
    // if the member is below moderator, can upgrade to moderator
    !member.role && {
      name: 'Make moderator',
      onClick: () => {
        updateRole(group.id, member.member_id, 'moderator')
      },
    },
    // if the member is a moderator, can demote
    member.role === 'moderator' && {
      name: 'Remove as moderator',
      onClick: () => {
        removeRole(group.id, member.member_id)
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
