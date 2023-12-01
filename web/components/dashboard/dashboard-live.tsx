import { useGroupsFromIds } from 'web/hooks/use-group-supabase'
import { ActivityLog } from '../activity-log'
import { Col } from '../layout/col'
import { Subtitle } from '../widgets/subtitle'

export function DashboardLive(props: { topics: string[]; editing?: boolean }) {
  const { topics, editing } = props
  const groups = useGroupsFromIds(topics)

  if (!groups?.length) return <></>

  return (
    <Col>
      <Subtitle>Recent Activity</Subtitle>
      <ActivityLog
        count={editing ? 4 : 100}
        topicSlugs={groups?.map((t) => t.slug)}
      />
    </Col>
  )
}
