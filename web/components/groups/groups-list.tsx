import { Group } from 'common/group'
import { useUser } from 'web/hooks/use-user'
import { GroupAndRoleType } from 'web/lib/supabase/groups'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { GroupLine } from './discover-groups'

export function GroupsList(props: {
  groups: Group[] | undefined
  loadMore?: () => Promise<boolean>
  yourGroupIds?: string[]
  className?: string
  yourGroupRoles?: GroupAndRoleType[] | null
  stateIsEmpty?: boolean
}) {
  const {
    groups,
    loadMore,
    yourGroupIds,
    className,
    yourGroupRoles,
    stateIsEmpty = true,
  } = props

  const user = useUser()

  if (groups === undefined) {
    return <LoadingIndicator />
  }

  if (groups.length === 0) {
    if (stateIsEmpty) {
      return <div>No groups found</div>
    }
    return <></>
  }
  return (
    <Col className={className}>
      {groups &&
        groups.map((group) => (
          <GroupLine
            key={group.id}
            group={group}
            user={user}
            isMember={!!yourGroupIds?.includes(group.id)}
            yourGroupRoles={yourGroupRoles}
          />
        ))}

      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
}
