import { Row as rowFor } from 'common/supabase/utils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { scaleBand, scaleLinear, scaleOrdinal } from 'd3-scale'
import { stack } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { max } from 'd3-array'
import {
  groupBy,
  mapValues,
  orderBy,
  toPairs,
  fromPairs,
  sortBy,
  sumBy,
  uniq,
} from 'lodash'
import { formatLargeNumber } from 'common/util/format'
import { renderToString } from 'react-dom/server'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

type DateAndCategoriesToTotals = { date: string } & {
  [key: string]: number
}

export const BonusSummary = (props: {
  txnSummaryStats: rowFor<'txn_summary_stats'>[]
  days?: string[]
  defaultHidden?: string[]
}) => {
  const { txnSummaryStats, days, defaultHidden } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const xAxisRef = useRef<SVGGElement>(null)
  const yAxisRef = useRef<SVGGElement>(null)
  const margin = { top: 20, right: 20, bottom: 10, left: 10 }
  const width = 900
  const height = 500
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const [shownCategories, setSelectedCategories] = useState<string[]>([])

  const { data, xScale, stackGen, colorScale, yScale, keys } = useMemo(() => {
    const data = orderAndGroupData(txnSummaryStats, days)

    const xScale = scaleBand()
      .domain(data.map((d) => d.date))
      .range([0, innerWidth])
      .padding(0.1)

    const yScale = scaleLinear().range([innerHeight, 0])

    const keys = sortBy(
      uniq(data.flatMap(Object.keys).filter((k) => k !== 'date')),
      (k) => -sumBy(data, (d) => d[k])
    )

    const shownKeys = keys.filter((k) => shownCategories.includes(k))

    const colorScale = scaleOrdinal<string>()
      .domain(keys)
      .range(keys.map(getColor))

    const shownData = data.map((day) =>
      mapValues(day, (v, k) => (k === 'date' || shownKeys.includes(k) ? v : 0))
    )
    const stackGen = stack<{ [key: string]: number }>().keys(keys)
    const layers = stackGen(shownData)
    const maxY = max(layers, (layer) => max(layer, (d) => d[1] as number)) || 0
    xScale.domain(data.map((d) => d.date))
    yScale.domain([0, maxY]).nice()
    return { data: shownData, xScale, yScale, keys, colorScale, stackGen }
  }, [txnSummaryStats.length, shownCategories])

  useEffect(() => {
    setSelectedCategories(keys.filter((k) => !defaultHidden?.includes(k)))
  }, [])

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

  const onClickCategory = (category: string) => {
    // if all categories are shown, just show the one clicked
    if (shownCategories.length === keys.length) {
      setSelectedCategories([category])
    }
    // if the last category is clicked, just show all except that one
    // we do this to A) avoid the empty state and B) to make "show all except this one" an easy two-click action
    else if (shownCategories.length === 1 && shownCategories[0] === category) {
      setSelectedCategories(keys.filter((c) => c !== category))
    }
    // otherwise just toggle the category
    else if (shownCategories.includes(category)) {
      setSelectedCategories(shownCategories.filter((c) => c !== category))
    } else {
      setSelectedCategories([...shownCategories, category])
    }
  }

  return (
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
            keys.length > 0 &&
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
                            <StackedChartTooltip
                              data={d.data as DateAndCategoriesToTotals}
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
        {keys.map((category) => (
          <button
            key={category}
            onClick={() => onClickCategory(category)}
            className="flex items-center gap-2 text-xs"
          >
            <div
              className="flex h-4 w-4 rounded-sm p-1"
              style={
                shownCategories.includes(category)
                  ? { backgroundColor: getColor(category) }
                  : { outline: '1px solid currentColor' }
              }
            >
              {!shownCategories.includes(category) && (
                // an X
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
            <div className="mr-4 text-left">{category}</div>
          </button>
        ))}
      </Row>
    </div>
  )
}

const getCategoryForTxn = (txn: rowFor<'txn_summary_stats'>) =>
  (categoryToLabel as any)[txn.category] ||
  (txn.quest_type ? `${txn.quest_type}_` : '') +
    txn.category.replace('_REWARD', '').replace('_BONUS', '')

const orderAndGroupData = (
  data: rowFor<'txn_summary_stats'>[],
  days?: string[]
) => {
  const groupedData = groupBy(data, (row) => row.start_time.split(' ')[0])

  const summedData = mapValues(groupedData, (transactions, date) => {
    const groupedByCategory = groupBy(transactions, getCategoryForTxn)

    const dailyTotals = mapValues(groupedByCategory, (txns) =>
      sumBy(txns, 'total_amount')
    )
    const sortedDailyTotalsArray = orderBy(toPairs(dailyTotals), [1], ['desc'])
    const sortedDailyTotals = fromPairs(sortedDailyTotalsArray)
    return { date, ...sortedDailyTotals } as DateAndCategoriesToTotals
  })

  const values = Object.values(summedData)

  if (days) {
    return days.map(
      (day) => summedData[day] ?? ({ date: day } as DateAndCategoriesToTotals)
    )
  } else {
    return Object.values(summedData)
  }

  return values
}

const StackedChartTooltip = (props: { data: DateAndCategoriesToTotals }) => {
  const { data } = props
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
        .map(([k, v]) => (
          <span style={{ color: getColor(k) }} key={k}>
            {k}: {formatLargeNumber(v as number)}
          </span>
        ))}
    </Col>
  )
}

const categoryToLabel = {
  CASH_BONUS: 'MANA_PURCHASE_BONUS',
  CONVERT_CASH: 'CONVERT_CASH_TO_MANA',
}

const categoryToColor = {
  BET_FEES: '#FF5733',
  MARKET_BOOST_REDEEM_FEE: '#FFC300',
  CREATE_CONTRACT_ANTE: '#3498DB',
  KYC: '#30E080',
  SIGNUP: '#30E080',
  REFERRAL: '#10A040',
  MANIFOLD_TOP_UP: '#FF3060',
  MANA_PURCHASE: '#925cf0',
  MANA_PURCHASE_BONUS: '#925cf0',
  MARKETS_CREATED_QUEST: '#3498DB',
  PUSH_NOTIFICATION: '#FFC300',
  CASH_OUT: '#50C000',
  CONVERT_CASH_TO_MANA: '#7C3AED',
  CONVERT_CASH_DONE: '#7C3AED',
  LEAGUE_PRIZE_UNDO: '#7DC5E2',
}

// https://stackoverflow.com/a/3426956
const colorHash = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

const getColor = (str: string) =>
  (categoryToColor as any)[str] || colorHash(str)
