import { useGroupsFromIds } from 'web/hooks/use-group-supabase'
import { ActivityLog } from '../activity-log'
import { Col } from '../layout/col'
import { Subtitle } from '../widgets/subtitle'

export function DashboardLive(props: { topics: string[] }) {
  const groups = useGroupsFromIds(props.topics)

  if (!groups?.length) return <></>

  return (
    <Col>
      <Subtitle>Recent Activity</Subtitle>
      <ActivityLog count={100} topicSlugs={groups?.map((t) => t.slug)} />
    </Col>
  )
}
