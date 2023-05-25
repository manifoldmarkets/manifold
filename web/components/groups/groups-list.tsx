import { Group } from 'common/group'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { GroupLine } from './discover-groups'

export function GroupsList(props: {
  groups: Group[] | undefined
  loadMore?: () => Promise<boolean>
  yourGroupIds?: string[]
  className?: string
}) {
  const { groups, loadMore, yourGroupIds, className } = props
  const [expandedId, setExpandeId] = useState<string | null>(null)

  const user = useUser()

  if (groups === undefined) {
    return <LoadingIndicator />
  }

  if (groups.length === 0) {
    return <div>No groups found</div>
  }
  return (
    <Col className={className}>
      {groups &&
        groups.map((group) => (
          <GroupLine
            key={group.id}
            group={group as Group}
            user={user}
            isMember={!!yourGroupIds?.includes(group.id)}
            expandedId={expandedId}
            setExpandedId={setExpandeId}
          />
        ))}

      {loadMore && (
        <LoadMoreUntilNotVisible
          loadMore={loadMore}
          className="relative -top-96 h-1"
        />
      )}
    </Col>
  )
}
