import { ResponsiveLine } from '@nivo/line'
import { PortfolioMetrics } from 'common/user'
import { formatMoney } from 'common/util/format'
import dayjs from 'dayjs'
import { last, set } from 'lodash'
import { memo } from 'react'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Col } from '../layout/col'

export const PortfolioValueGraph = memo(function PortfolioValueGraph(props: {
  portfolioHistory: PortfolioMetrics[]
  mode: 'value' | 'profit'
  setGraphDisplayNumber: (arg0: number | string | null) => void
  height?: number
  includeTime?: boolean
}) {
  const { portfolioHistory, height, includeTime, mode, setGraphDisplayNumber } =
    props
  const { width } = useWindowSize()

  function getPoints(line: 'value' | 'posProfit' | 'negProfit') {
    let points = portfolioHistory.map((p) => {
      const { timestamp, balance, investmentValue, totalDeposits } = p
      const value = balance + investmentValue

      const profit = value - totalDeposits
      let posProfit = null
      let negProfit = null
      if (profit < 0) {
        negProfit = profit
      } else {
        posProfit = profit
      }

      return {
        x: new Date(timestamp),
        y:
          line === 'value'
            ? value
            : line === 'posProfit'
            ? posProfit
            : negProfit,
      }
    })
    return points
  }

  let data

  if (mode === 'value') {
    data = [{ id: 'value', data: getPoints('value'), color: '#4f46e5' }]
  } else {
    data = [
      {
        id: 'negProfit',
        data: getPoints('negProfit'),
        color: '#dc2626',
      },
      {
        id: 'posProfit',
        data: getPoints('posProfit'),
        color: '#14b8a6',
      },
    ]
  }
  const firstPoints = data[0].data
  // const numYTickValues = !width || width < 800 ? 2 : 4
  const numYTickValues = 2
  const endDate = last(firstPoints)?.x

  const firstPointsY = firstPoints
    .filter((p) => {
      return p.y !== null
    })
    .map((p) => p.y)

  const yMin =
    mode === 'value'
      ? Math.min(...firstPointsY)
      : Math.min(
          ...firstPointsY,
          ...data[1].data
            .filter((p) => {
              return p.y !== null
            })
            .map((p) => p.y)
        )

  const yMax =
    mode === 'value'
      ? Math.max(...firstPointsY)
      : Math.max(
          ...firstPointsY,
          ...data[1].data
            .filter((p) => {
              return p.y !== null
            })
            .map((p) => p.y)
        )

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: height ?? (!width || width >= 800 ? 200 : 100) }}
      onMouseLeave={() => setGraphDisplayNumber(null)}
    >
      <ResponsiveLine
        margin={{ top: 10, right: 0, left: 40, bottom: 10 }}
        data={data}
        xScale={{
          type: 'time',
          min: firstPoints[0]?.x,
          max: endDate,
        }}
        yScale={{
          type: 'linear',
          stacked: false,
          min: yMin,
          max: yMax,
        }}
        curve="stepAfter"
        enablePoints={false}
        colors={{ datum: 'color' }}
        axisBottom={{
          tickValues: 0,
        }}
        pointBorderColor="#fff"
        pointSize={firstPoints.length > 100 ? 0 : 6}
        axisLeft={{
          tickValues: numYTickValues,
          format: '.3s',
        }}
        enableGridX={false}
        enableGridY={true}
        gridYValues={numYTickValues}
        enableSlices="x"
        animate={false}
        yFormat={(value) => formatMoney(+value)}
        enableArea={true}
        areaOpacity={0.1}
        sliceTooltip={({ slice }) => {
          slice.points.map((point) =>
            setGraphDisplayNumber(point.data.yFormatted)
          )
          return (
            <div className="rounded bg-white px-4 py-2 opacity-80">
              {slice.points.map((point) => (
                <div
                  key={point.id}
                  className="text-xs font-semibold sm:text-sm"
                >
                  <Col>
                    <div>{dayjs(point.data.xFormatted).format('MMM/D/YY')}</div>
                    <div className="text-greyscale-6 text-2xs font-normal sm:text-xs">
                      {dayjs(point.data.xFormatted).format('h:mm A')}
                    </div>
                  </Col>
                </div>
              ))}
            </div>
          )
        }}
      ></ResponsiveLine>
    </div>
  )
})
