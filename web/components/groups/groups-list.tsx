import { useUser } from 'web/hooks/use-user'
import { GroupAndRoleType } from 'web/lib/supabase/groups'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { GroupLine } from './group-line'
import { Group } from 'common/group'

export function GroupsList(props: {
  groups: Group[] | undefined
  loadMore?: () => Promise<boolean>
  yourGroupIds?: string[]
  className?: string
  yourGroupRoles?: GroupAndRoleType[] | null
  emptyState?: React.ReactNode
}) {
  const {
    groups,
    loadMore,
    yourGroupIds,
    className,
    yourGroupRoles,
    emptyState = null,
  } = props

  const user = useUser()

  if (groups === undefined) {
    return <LoadingIndicator />
  }

  if (groups.length === 0) {
    return <>{emptyState}</>
  }
  return (
    <Col className={className}>
      {groups.map((group) => (
        <GroupLine
          key={group.id}
          group={group}
          user={user}
          isMember={!yourGroupIds || yourGroupIds.includes(group.id)}
          role={yourGroupRoles?.find((r) => r.group_id === group.id)?.role}
        />
      ))}

      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
}
