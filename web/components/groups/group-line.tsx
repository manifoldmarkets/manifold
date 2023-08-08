import clsx from 'clsx'
import { Group, groupPath } from 'common/group'
import { User } from 'common/user'
import Link from 'next/link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Row } from '../layout/row'
import { MemberRoleTag } from './group-member-modal'
import { PRIVACY_STATUS_ITEMS } from './group-privacy-modal'
import { JoinOrLeaveGroupButton } from './groups-button'
import { richTextToString } from 'common/util/parse'

export function GroupLine(props: {
  group: Group
  isMember: boolean
  user: User | undefined | null
  role?: string | undefined | null
}) {
  const { group, isMember, user, role } = props

  const isCreator = user?.id == group.creatorId
  const isMobile = useIsMobile()
  const isPrivate = group.privacyStatus == 'private'

  return (
    <Link
      href={groupPath(group.slug)}
      className={clsx('hover:bg-canvas-0', 'rounded-md p-2')}
    >
      <div className={clsx('flex cursor-pointer items-center justify-between')}>
        {group.name}
        <Row className="gap-4">
          {(role || isCreator) && (
            <MemberRoleTag
              role={role}
              isCreator={isCreator}
              className="ml-1 w-min opacity-60"
            />
          )}
          {!isPrivate && !isCreator && (
            <JoinOrLeaveGroupButton
              group={group}
              user={user}
              isMember={isMember}
              iconClassName={'text-canvas-50 '}
              isMobile={isMobile}
            />
          )}
        </Row>
      </div>
      <GroupSummary group={group} />
    </Link>
  )
}

function GroupSummary(props: { group: Group }) {
  const { group } = props
  const { about: desc } = group
  const stringDesc = typeof desc === 'string' ? desc : richTextToString(desc)
  const { icon, status } = PRIVACY_STATUS_ITEMS[group.privacyStatus]
  return (
    <Row className={clsx('text-ink-500 gap- gap-2 text-sm')}>
      {group.privacyStatus !== 'public' && (
        <Row className={clsx('items-center gap-0.5')}>
          {icon}
          {status}
        </Row>
      )}
      <span className={'line-clamp-1'}>{stringDesc}</span>
    </Row>
  )
}
