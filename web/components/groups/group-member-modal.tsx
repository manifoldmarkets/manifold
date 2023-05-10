import { DotsVerticalIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { buildArray } from 'common/util/array'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useRealtimeGroupMembers } from 'web/hooks/use-group-supabase'
import { useIntersection } from 'web/hooks/use-intersection'
import { useUser } from 'web/hooks/use-user'
import { updateMemberRole } from 'web/lib/firebase/api'
import { searchUserInGroup } from 'web/lib/supabase/group'
import DropdownMenu from '../comments/dropdown-menu'
import { Col } from '../layout/col'
import { MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { Input } from '../widgets/input'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { UserLink } from '../widgets/user-link'
import { UncontrolledTabs } from '../layout/tabs'
import { AddMemberContent } from './add-member-modal'
import { Spacer } from '../layout/spacer'

const SEARCH_MEMBER_QUERY_SIZE = 15

export function GroupMemberModalContent(props: {
  group: Group
  canEdit: boolean
  numMembers: number | undefined
  defaultIndex?: number
}) {
  const { group, canEdit, numMembers, defaultIndex } = props
  const [query, setQuery] = useState<string>('')
  return (
    <Col className={clsx(MODAL_CLASS, 'h-[85vh]')}>
      {canEdit && (
        <UncontrolledTabs
          defaultIndex={defaultIndex ?? 0}
          tabs={[
            {
              title: 'Members',
              content: (
                <MemberTab
                  query={query}
                  setQuery={setQuery}
                  group={group}
                  canEdit={canEdit}
                  numMembers={numMembers}
                />
              ),
            },
            {
              title: 'Invite',
              content: (
                <AddMemberContent
                  query={query}
                  setQuery={setQuery}
                  group={group}
                />
              ),
            },
          ]}
          className="w-full"
        />
      )}
      {!canEdit && (
        <MemberTab
          query={query}
          setQuery={setQuery}
          group={group}
          canEdit={canEdit}
          numMembers={numMembers}
        />
      )}
    </Col>
  )
}

export function MemberTab(props: {
  query: string
  setQuery: (query: string) => void
  group: Group
  canEdit: boolean
  numMembers: number | undefined
}) {
  const { query, setQuery, group, canEdit, numMembers } = props
  return (
    <>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members"
        className={clsx('placeholder:text-ink-400 w-full')}
      />
      {query !== '' && (
        <SearchGroupMemberModalContent
          group={group}
          canEdit={canEdit}
          query={query}
        />
      )}

      <div className={clsx(query !== '' ? 'hidden' : '')}>
        <NonSearchGroupMemberModalContent
          group={group}
          canEdit={canEdit}
          numMembers={numMembers}
        />
      </div>
    </>
  )
}

export function SearchGroupMemberModalContent(props: {
  group: Group
  canEdit: boolean
  query: string
}) {
  const { group, canEdit, query } = props
  const requestId = useRef(0)
  const [loading, setLoading] = useState(false)
  const [searchMemberResult, setSearchMemberResult] = useState<JSONContent[]>(
    []
  )
  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    searchUserInGroup(group.id, query, SEARCH_MEMBER_QUERY_SIZE)
      .then((results) => {
        // if there's a more recent request, forget about this one
        if (id === requestId.current) {
          setSearchMemberResult(results)
        }
      })
      .finally(() => setLoading(false))
  }, [query])
  const length = searchMemberResult.length
  if (length == 0 && !loading) {
    return <div>No results...</div>
  }
  return (
    <div
      className={clsx(
        'flex w-full flex-col gap-3',
        SCROLLABLE_MODAL_CLASS,
        loading ? 'animate-pulse' : ''
      )}
    >
      {searchMemberResult.map((member, index) => (
        <>
          <Member
            key={member.member_id}
            group={group}
            member={member}
            canEdit={canEdit}
          />
          {length - 1 === index && <Spacer h={24} />}
        </>
      ))}
    </div>
  )
}

export function NonSearchGroupMemberModalContent(props: {
  group: Group
  canEdit: boolean
  numMembers: number | undefined
}) {
  const { group, canEdit, numMembers } = props
  const modalRootRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef<HTMLDivElement | null>(null)
  const hitBottom = useIntersection(loadingRef, '0px', modalRootRef)
  const { admins, moderators, members, loadMore } = useRealtimeGroupMembers(
    group.id,
    hitBottom,
    numMembers
  )

  return (
    <div
      ref={modalRootRef}
      className={clsx('flex w-full flex-col', SCROLLABLE_MODAL_CLASS)}
    >
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
          <div className="bg-ink-400 h-4 w-32 animate-pulse" />
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
  const length = members?.length
  return (
    <Col className="w-full gap-3">
      <MemberRoleHeader
        headerText={`${role.toLocaleUpperCase()}S`}
        description={
          group.privacyStatus === 'curated' && role === 'member'
            ? undefined
            : roleDescription[role]
        }
      />
      {members === undefined || length === undefined ? (
        <LoadingIndicator />
      ) : length === 0 ? (
        <div className="text-ink-400">{`No ${role}s yet...`}</div>
      ) : (
        members.map((member, index) => {
          return (
            <>
              <Member
                key={member.member_id}
                group={group}
                member={member}
                canEdit={canEdit}
              />
              {role === 'member' && length - 1 === index && <Spacer h={24} />}
            </>
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
    <Col className="text-ink-400 bg-canvas-0 gap-0.5 pt-4 text-sm">
      <Row className="w-full gap-2 font-semibold">
        <div className="bg-ink-400 my-auto flex h-[1px] grow" />
        {headerText}
        <div className="bg-ink-400 my-auto flex h-[1px] grow" />
      </Row>
      {description && <div className="text-ink-500 text-xs">{description}</div>}
    </Col>
  )
}

export function MemberRoleTag(role: any | undefined, isCreator: boolean) {
  if (!role) {
    return <></>
  }
  return (
    <div
      className={clsx(
        'text-ink-0 h-min w-full rounded px-1 py-0.5 text-xs font-semibold',
        isCreator
          ? 'bg-primary-400'
          : role === 'admin'
          ? 'bg-primary-300'
          : 'bg-ink-300'
      )}
    >
      {isCreator ? 'CREATOR' : `${role.toLocaleUpperCase()}`}
    </div>
  )
}

export function Member(props: {
  group: Group
  member: JSONContent
  canEdit: boolean
}) {
  const { group, member, canEdit } = props
  const isCreator = member.member_id === member.creator_id

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
      <Row className="mr-4 items-center gap-1">
        <MemberRoleTag role={member.role} isCreator={isCreator} />
        <AdminRoleDropdown group={group} member={member} canEdit={canEdit} />
      </Row>
    </Row>
  )
}

// the dropdown for each member that is available to group admins
export function AdminRoleDropdown(props: {
  group: Group
  member: JSONContent
  canEdit: boolean
  className?: string
}) {
  const { group, member, canEdit, className } = props
  const user = useUser()
  if (!user) {
    return <></>
  }
  const errorMessage = 'Could not change role, try again?'
  const groupMemberOptions = buildArray(
    // ADMIN ONLY: if the member is below admin, can upgrade to admin
    canEdit &&
      (!member.role || member.role === 'moderator') && {
        name: 'Make admin',
        onClick: async () => {
          toast.promise(
            updateMemberRole({
              groupId: group.id,
              memberId: member.member_id,
              role: 'admin',
            }),
            {
              loading: `Promoting ${member.name} to admin...`,
              success: `${member.name} is now a admin!`,
              error: errorMessage,
            }
          )
        },
      },
    //ADMIN ONLY: if the member is below moderator, can upgrade to moderator
    canEdit &&
      !member.role && {
        name: 'Make moderator',
        onClick: async () => {
          toast.promise(
            updateMemberRole({
              memberId: member.member_id,
              groupId: group.id,
              role: 'moderator',
            }),
            {
              loading: `Promoting ${member.name} to moderator...`,
              success: `${member.name} is now a moderator!`,
              error: errorMessage,
            }
          )
        },
      },
    // ADMIN ONLY: if the member is a moderator, can demote
    canEdit &&
      member.role === 'moderator' && {
        name: 'Remove as moderator',
        onClick: async () => {
          toast.promise(
            updateMemberRole({
              groupId: group.id,
              memberId: member.member_id,
              role: 'member',
            }),
            {
              loading: `Removing ${member.name} as moderator...`,
              success: `${member.name} has been removed as moderator`,
              error: errorMessage,
            }
          )
        },
      },
    // member can remove self as admin if member is not group creator
    user?.id === member.member_id &&
      user?.id != member.creator_id &&
      member.role === 'admin' && {
        name: 'Remove self as admin',
        onClick: async () => {
          toast.promise(
            updateMemberRole({
              groupId: group.id,
              memberId: member.member_id,
              role: 'member',
            }),
            {
              loading: `Removing self as admin...`,
              success: `Successfully removed self as admin`,
              error: errorMessage,
            }
          )
        },
      },
    // member can remove self as moderator
    user?.id === member.member_id &&
      member.role === 'moderator' && {
        name: 'Remove self as moderator',
        onClick: async () => {
          toast.promise(
            updateMemberRole({
              groupId: group.id,
              memberId: member.member_id,
              role: 'member',
            }),
            {
              loading: `Removing self as moderator...`,
              success: `Successfully removed self as moderator`,
              error: errorMessage,
            }
          )
        },
      }
  )

  if (groupMemberOptions.length > 0) {
    return (
      <DropdownMenu
        Items={groupMemberOptions}
        Icon={<DotsVerticalIcon className={clsx('text-ink-400 h-5 w-5')} />}
        menuWidth={'w-40'}
        className={clsx(className)}
      />
    )
  } else {
    return <div className="'h-5 w-5 bg-inherit" />
  }
}
