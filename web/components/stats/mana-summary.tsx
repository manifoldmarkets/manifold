import { Row as rowFor } from 'common/supabase/utils'
import { useEffect, useMemo, useRef } from 'react'
import { select } from 'd3-selection'
import { scaleBand, scaleLinear, scaleOrdinal } from 'd3-scale'
import { stack } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { max } from 'd3-array'
import { unzip, zip, pick } from 'lodash'
import { renderToString } from 'react-dom/server'
import { Col } from 'web/components/layout/col'
import { formatWithCommas } from 'common/util/format'
import { Title } from 'web/components/widgets/title'

type DateAndCategoriesToTotals = { date: string } & {
  [key: string]: number
}

const categoryToLabel = {
  total_value: 'total mana (-loans)',
  balance: 'mana balance',
  spice_balance: 'spice balance',
  investment_value: 'invested',
  loan_total: 'loans',
  amm_liquidity: 'amm liquidity',
  total_cash_value: 'total prize cash',
  cash_balance: 'prize cash balance',
  cash_investment_value: 'invested',
  amm_cash_liquidity: 'amm liquidity',
}

const categoryToColor = {
  total_value: '#FFF0FF',
  balance: '#B690D6',
  spice_balance: '#FFA620',
  investment_value: '#30A0C6',
  loan_total: '#FFB7B7',
  amm_liquidity: '#B7FFB7',
  total_cash_value: '#FFFFF0',
  cash_balance: '#FFD700',
  cash_investment_value: '#60D0C6',
  amm_cash_liquidity: '#20D020',
}

const [categories, colors] = zip(...Object.entries(categoryToColor)) as [
  string[],
  string[]
]
const colorScale = scaleOrdinal<string>().domain(categories).range(colors)

export const ManaSupplySummary = (props: {
  manaSupplyStats: rowFor<'mana_supply_stats'>[]
}) => {
  const { manaSupplyStats } = props
  const [manaData, cashData] = orderAndGroupData(manaSupplyStats)

  return (
    <>
      <Title>Mana supply over time</Title>
      <StackedChart data={manaData} />
      <Title className="mt-4">Prize cash supply supply over time</Title>
      <StackedChart data={cashData} />
    </>
  )
}

const StackedChart = (props: {
  data: ({ date: string } & Partial<rowFor<'mana_supply_stats'>>)[]
}) => {
  const { data } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const xAxisRef = useRef<SVGGElement>(null)
  const yAxisRef = useRef<SVGGElement>(null)
  const margin = { top: 20, right: 20, bottom: 10, left: 10 }
  const width = 900
  const height = 500
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const { xScale, layers, yScale, keys } = useMemo(() => {
    const xScale = scaleBand()
      .domain(data.map((d) => d.date))
      .range([0, innerWidth])
      .padding(0.1)

    const yScale = scaleLinear().range([innerHeight, 0])

    const keys = Array.from(
      new Set(data.flatMap((d) => Object.keys(d)))
    ).filter(
      (key) => !['date', 'total_value', 'total_cash_value'].includes(key)
    )

    const stackGen = stack<{ [key: string]: number }>().keys(keys)
    const layers = stackGen(data as any)
    const maxY = max(layers, (layer) => max(layer, (d) => d[1] as number)) || 0
    xScale.domain(data.map((d) => d.date))
    yScale.domain([0, maxY]).nice()
    return { data, xScale, yScale, keys, colorScale, layers }
  }, [data.length])

  useEffect(() => {
    if (xScale && xAxisRef.current) {
      select(xAxisRef.current).call(axisBottom(xScale).tickFormat(() => ''))
    }
    if (yScale && yAxisRef.current) {
      select(yAxisRef.current).call(axisRight(yScale))
    }
  }, [xScale, yScale])

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
            layers.map((layer, i) => (
              <g key={`layer-${i}`} fill={colorScale(keys[i])}>
                {layer.map((d, j) => (
                  <rect
                    key={`rect-${d.data.date}-${keys[j]}`}
                    x={xScale(d.data.date as any)}
                    y={yScale(d[1])}
                    height={yScale(d[0]) - yScale(d[1])}
                    width={xScale?.bandwidth()}
                    onMouseOver={() => {
                      const datum = d.data as DateAndCategoriesToTotals
                      select(tooltipRef.current)
                        .style('opacity', 1)
                        .style('z-index', 1000)
                        .html(
                          renderToString(<StackedChartTooltip data={datum} />)
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
          textAlign: 'left',
          width: 'auto',
          height: 'auto',
          padding: '8px',
          font: '12px sans-serif',
          background: 'black',
          borderRadius: '8px',
          pointerEvents: 'none',
          opacity: 0,
        }}
      ></div>
    </div>
  )
}

const orderAndGroupData = (data: rowFor<'mana_supply_stats'>[]) => {
  return unzip(
    data.map((datum) => [
      {
        date: datum.start_time,
        ...pick(datum, [
          'total_value',
          'balance',
          'spice_balance',
          'investment_value',
          'loan_total',
          'amm_liquidity',
        ]),
      },
      {
        date: datum.start_time,
        ...pick(datum, [
          'total_cash_value',
          'cash_balance',
          'cash_investment_value',
          'amm_cash_liquidity',
        ]),
      },
    ])
  )
}

const StackedChartTooltip = (props: { data: DateAndCategoriesToTotals }) => {
  const { data } = props
  return (
    <Col className={'max-w-xs gap-1 text-lg text-white'}>
      {new Date(Date.parse(data.date)).toLocaleString('en-us', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
      })}
      <br />
      {Object.keys(data)
        .filter((k) => k !== 'date')
        .map((key) => (
          <span
            style={{
              color: categoryToColor[key as keyof typeof categoryToColor],
            }}
            key={key}
          >
            {categoryToLabel[key as keyof typeof categoryToLabel]}:{' '}
            {formatWithCommas(data[key])}
          </span>
        ))}
    </Col>
  )
}
