import { useState } from 'react'
import { useGroupsFromIds } from 'web/hooks/use-group-supabase'
import { PillOptions, LivePillOptions, ActivityLog } from '../activity-log'
import { Col } from '../layout/col'
import { Subtitle } from '../widgets/subtitle'

export function DashboardLive(props: { topics: string[] }) {
  const groups = useGroupsFromIds(props.topics)
  const [pill, setPill] = useState<PillOptions>('all')

  if (!groups?.length) return <></>

  return (
    <Col>
      <Subtitle>Recent Activity</Subtitle>
      <LivePillOptions pill={pill} setPill={setPill} />
      <div className="h-2" />
      <ActivityLog
        count={30}
        pill={pill}
        topicSlugs={groups?.map((t) => t.slug)}
      />
    </Col>
  )
}
