import { Row as rowFor } from 'common/supabase/utils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { scaleBand, scaleLinear, scaleOrdinal } from 'd3-scale'
import { stack } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { max } from 'd3-array'
import { mapValues, sortBy, sumBy, uniq } from 'lodash'
import { formatLargeNumber } from 'common/util/format'
import { renderToString } from 'react-dom/server'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from '../widgets/title'
import { useGroupsFromIds } from 'web/hooks/use-group-supabase'

const stringToColor = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  const h = hash % 360
  return `hsl(${h}, 70%, 45%)`
}

export function TopicDauSummary(props: { stats: rowFor<'daily_stats'>[] }) {
  const { stats } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const xAxisRef = useRef<SVGGElement>(null)
  const yAxisRef = useRef<SVGGElement>(null)
  const margin = { top: 20, right: 20, bottom: 10, left: 10 }
  const width = 900
  const height = 500
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const [shownTopics, setShownTopics] = useState<string[]>([])

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

  const { data, xScale, stackGen, colorScale, yScale, topics } = useMemo(() => {
    const data = stats
      .filter((s) => s.topic_daus)
      .map((s) => ({
        date: s.start_date,
        ...(s.topic_daus as Record<string, number>),
      }))

    const xScale = scaleBand()
      .domain(data.map((d) => d.date))
      .range([0, innerWidth])
      .padding(0.1)

    const yScale = scaleLinear().range([innerHeight, 0])

    const topics = sortBy(
      uniq(data.flatMap(Object.keys).filter((k) => k !== 'date')),
      (k) => -sumBy(data, (d) => (k in d ? Number(d[k as keyof typeof d]) : 0))
    )

    const shownKeys = topics.filter((k) => shownTopics.includes(k))

    const colorScale = scaleOrdinal<string>()
      .domain(topics)
      .range(topics.map(stringToColor))

    const shownData = data.map((day) =>
      mapValues(day, (v, k) => (k === 'date' || shownKeys.includes(k) ? v : 0))
    ) as { [key: string]: number }[]

    const stackGen = stack<{ [key: string]: number }>().keys(topics)
    const layers = stackGen(shownData)
    const maxY = max(layers, (layer) => max(layer, (d) => d[1] as number)) || 0
    xScale.domain(data.map((d) => d.date))
    yScale.domain([0, maxY]).nice()
    return { data: shownData, xScale, yScale, topics, colorScale, stackGen }
  }, [stats.length, JSON.stringify(shownTopics)])

  useEffect(() => {
    // Show top 10 topics by default once groups are loaded
    if (groups) {
      setShownTopics(topics.slice(0, 10))
    }
  }, [topics.length, JSON.stringify(groups)])

  useEffect(() => {
    if (xScale && xAxisRef.current) {
      select(xAxisRef.current).call(axisBottom(xScale).tickFormat(() => ''))
    }
    if (yScale && yAxisRef.current) {
      select(yAxisRef.current)
        .transition()
        .duration(300)
        .call(axisRight(yScale))
    }
  }, [xScale, yScale])

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

  return (
    <>
      <Title>Daily Active Users by Group</Title>
      <p className="text-ink-500 mb-4">
        Number of unique users who traded, commented, or created markets in each
        group.
      </p>
      <div>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          overflow="visible"
        >
          <g transform="translate(10,20)">
            {data.length > 0 &&
              topics.length > 0 &&
              stackGen?.(data).map((layer) => (
                <g key={layer.key} fill={colorScale(layer.key)}>
                  {layer.map((d) => (
                    <rect
                      key={d.data.date}
                      x={xScale(d.data.date as any)}
                      y={yScale(d[1])}
                      height={yScale(d[0]) - yScale(d[1])}
                      width={xScale?.bandwidth()}
                      style={{
                        transition: 'y 0.3s ease, height 0.3s ease',
                      }}
                      onMouseOver={() => {
                        select(tooltipRef.current)
                          .style('opacity', 1)
                          .style('z-index', 1000)
                          .html(
                            renderToString(
                              <TopicTooltip
                                data={d.data as DateAndTopicToTotals}
                                getGroupName={getGroupName}
                              />
                            )
                          )
                      }}
                      onMouseMove={(event) => {
                        select(tooltipRef.current)
                          .style('left', `${event.pageX - 150}px`)
                          .style('top', `${event.pageY + 5}px`)
                      }}
                      onMouseOut={() => {
                        select(tooltipRef.current).style('opacity', 0)
                      }}
                    />
                  ))}
                </g>
              ))}
            <g
              ref={yAxisRef}
              className="y axis"
              transform={`translate(${innerWidth},0)`}
            />
          </g>
        </svg>
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            width: 'auto',
            height: 'auto',
            pointerEvents: 'none',
            opacity: 0,
          }}
        ></div>
        <Row className="mb-4 mt-2 flex-wrap gap-2">
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
                    ? { backgroundColor: colorScale(topic) }
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
      </div>
    </>
  )
}

type DateAndTopicToTotals = { date: string } & {
  [key: string]: number
}

const TopicTooltip = (props: {
  data: DateAndTopicToTotals
  getGroupName: (id: string) => string
}) => {
  const { data, getGroupName } = props
  return (
    <Col className="bg-canvas-0 border-ink-900 max-w-xs gap-1 rounded-lg border p-2 text-sm">
      {new Date(data.date).toLocaleString('en-us', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}
      <br />
      {Object.entries(data)
        .filter(([k, v]) => k !== 'date' && v != 0)
        .sort((a, b) => (-b[1] as number) + (a[1] as number))
        .map(([k, v]) => (
          <span style={{ color: stringToColor(k) }} key={k}>
            {getGroupName(k)}: {formatLargeNumber(v as number)}
          </span>
        ))}
    </Col>
  )
}
