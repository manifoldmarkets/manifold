import { Row as rowFor } from 'common/supabase/utils'
import { useEffect, useMemo, useState } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { sortBy, sumBy, uniq } from 'lodash'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from '../widgets/title'
import { useGroupsFromIds } from 'web/hooks/use-group-supabase'
import { MultiValueHistoryChart } from '../charts/generic-charts'
import { formatLargeNumber } from 'common/util/format'
import { HistoryPoint } from 'common/chart'
import { nthColor } from '../charts/contract/choice'
import { HOUR_MS } from 'common/util/time'

export function TopicDauSummary(props: { stats: rowFor<'daily_stats'>[] }) {
  const { stats } = props
  const [shownTopics, setShownTopics] = useState<string[]>([])
  const width = 900
  const height = 500

  // Get all unique group IDs from the stats
  const allGroupIds = useMemo(() => {
    return uniq(
      stats
        .flatMap((s) => Object.keys(s.topic_daus ?? {}))
        .filter((id): id is string => id !== 'date')
    )
  }, [JSON.stringify(stats.map((s) => s.topic_daus))])

  // Fetch group information
  const groups = useGroupsFromIds(allGroupIds)

  const getGroupName = (id: string) =>
    groups?.find((g) => g.id === id)?.name ?? id

  const { data, xScale, yScale, topics } = useMemo(() => {
    // Convert stats data into format needed for MultiValueHistoryChart
    const data: Record<string, { points: HistoryPoint[]; color: string }> = {}
    const allPoints: { x: number; y: number }[] = []

    // Sort topics by total DAUs
    const topicTotals = allGroupIds.map((id) => ({
      id,
      total: sumBy(stats, (s) => (s.topic_daus as any)?.[id] ?? 0),
    }))
    const topics = sortBy(topicTotals, (t) => -t.total).map((t) => t.id)

    topics.forEach((topicId, i) => {
      const points = stats
        .filter((s) => s.topic_daus && (s.topic_daus as any)[topicId])
        .map((s) => ({
          x: new Date(s.start_date).getTime(),
          y: (s.topic_daus as any)[topicId] as number,
        }))

      if (points.length > 0) {
        // If there's only one point, create a second point slightly offset so it's visible on the chart
        if (points.length === 1) {
          const point = points[0]
          points.push({
            x: point.x + 12 * HOUR_MS,
            y: point.y,
          })
        }

        data[topicId] = {
          points,
          color: nthColor(i),
        }
        if (shownTopics.includes(topicId)) {
          allPoints.push(...points)
        }
      }
    })

    const times = allPoints.map((p) => p.x)
    const values = allPoints.map((p) => p.y)

    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const maxValue = Math.max(...values, 1)

    const xScale = scaleTime(
      [minTime || Date.now(), maxTime || Date.now()],
      [0, width]
    )
    const yScale = scaleLinear([0, maxValue], [height, 0])

    return { data, xScale, yScale, topics }
  }, [stats, allGroupIds, width, height, shownTopics])

  useEffect(() => {
    // Show top 10 topics by default once groups are loaded
    if (groups) {
      setShownTopics(topics.slice(0, 10))
    }
  }, [topics.length, JSON.stringify(groups)])

  const onClickTopic = (topic: string) => {
    if (shownTopics.includes(topic)) {
      setShownTopics(shownTopics.filter((t) => t !== topic))
    } else {
      setShownTopics([...shownTopics, topic])
    }
  }

  if (!groups) {
    return <div>Loading groups...</div>
  }

  const shownData = Object.fromEntries(
    Object.entries(data).filter(([id]) => shownTopics.includes(id))
  )
  return (
    <>
      <Title>Daily Active Users by Group</Title>
      <p className="text-ink-500 mb-4">
        Number of unique users who traded, commented, or created markets in each
        group.
      </p>
      <MultiValueHistoryChart
        w={width}
        h={height}
        xScale={xScale}
        yScale={yScale}
        data={shownData}
        Tooltip={(props) => (
          <GroupTooltip ttProps={props as any} getGroupName={getGroupName} />
        )}
        yKind="amount"
      />
      <Row className="mb-2 mt-8 flex-wrap gap-2">
        {topics.map((topic) => (
          <button
            key={topic}
            onClick={() => onClickTopic(topic)}
            className="flex items-center gap-2 text-xs"
          >
            <div
              className="flex h-4 w-4 rounded-sm p-1"
              style={
                shownTopics.includes(topic)
                  ? { backgroundColor: data[topic]?.color }
                  : { outline: '1px solid currentColor' }
              }
            >
              {!shownTopics.includes(topic) && (
                <svg
                  viewBox="0 0 100 100"
                  stroke="currentColor"
                  strokeWidth={20}
                >
                  <line x1="0" y1="0" x2="100" y2="100" />
                  <line x1="100" y1="0" x2="0" y2="100" />
                </svg>
              )}
            </div>
            <div className="mr-4 text-left">{getGroupName(topic)}</div>
          </button>
        ))}
      </Row>
    </>
  )
}

const GroupTooltip = (props: {
  ttProps: { prev: HistoryPoint; ans: string }
  getGroupName: (id: string) => string
}) => {
  const { ttProps, getGroupName } = props
  const { prev, ans } = ttProps

  return (
    <Col className="gap-1">
      <div>
        {new Date(prev.x).toLocaleDateString('en-us', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </div>
      <div>
        {getGroupName(ans)}: {formatLargeNumber(prev.y)}
      </div>
    </Col>
  )
}
