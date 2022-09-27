import { ResponsiveLine } from '@nivo/line'
import { PortfolioMetrics } from 'common/user'
import { filterDefined } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import dayjs from 'dayjs'
import { last } from 'lodash'
import { memo } from 'react'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Col } from '../layout/col'

export const PortfolioValueGraph = memo(function PortfolioValueGraph(props: {
  portfolioHistory: PortfolioMetrics[]
  mode: 'value' | 'profit'
  handleGraphDisplayChange: (arg0: string | number | null) => void
  height?: number
}) {
  const { portfolioHistory, height, mode, handleGraphDisplayChange } = props
  const { width } = useWindowSize()

  const valuePoints = getPoints('value', portfolioHistory)
  const posProfitPoints = getPoints('posProfit', portfolioHistory)
  const negProfitPoints = getPoints('negProfit', portfolioHistory)

  const valuePointsY = valuePoints.map((p) => p.y)
  const posProfitPointsY = posProfitPoints.map((p) => p.y)
  const negProfitPointsY = negProfitPoints.map((p) => p.y)

  let data

  if (mode === 'value') {
    data = [{ id: 'value', data: valuePoints, color: '#4f46e5' }]
  } else {
    data = [
      {
        id: 'negProfit',
        data: negProfitPoints,
        color: '#dc2626',
      },
      {
        id: 'posProfit',
        data: posProfitPoints,
        color: '#14b8a6',
      },
    ]
  }
  const numYTickValues = 2
  const endDate = last(data[0].data)?.x

  const yMin =
    mode === 'value'
      ? Math.min(...filterDefined(valuePointsY))
      : Math.min(
          ...filterDefined(negProfitPointsY),
          ...filterDefined(posProfitPointsY)
        )

  const yMax =
    mode === 'value'
      ? Math.max(...filterDefined(valuePointsY))
      : Math.max(
          ...filterDefined(negProfitPointsY),
          ...filterDefined(posProfitPointsY)
        )

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: height ?? (!width || width >= 800 ? 200 : 100) }}
      onMouseLeave={() => handleGraphDisplayChange(null)}
    >
      <ResponsiveLine
        margin={{ top: 10, right: 0, left: 40, bottom: 10 }}
        data={data}
        xScale={{
          type: 'time',
          min: valuePoints[0]?.x,
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
        pointSize={valuePoints.length > 100 ? 0 : 6}
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
          handleGraphDisplayChange(slice.points[0].data.yFormatted)
          return (
            <div className="rounded bg-white px-4 py-2 opacity-80">
              <div
                key={slice.points[0].id}
                className="text-xs font-semibold sm:text-sm"
              >
                <Col>
                  <div>
                    {dayjs(slice.points[0].data.xFormatted).format('MMM/D/YY')}
                  </div>
                  <div className="text-greyscale-6 text-2xs font-normal sm:text-xs">
                    {dayjs(slice.points[0].data.xFormatted).format('h:mm A')}
                  </div>
                </Col>
              </div>
              {/* ))} */}
            </div>
          )
        }}
      ></ResponsiveLine>
    </div>
  )
})

export function getPoints(
  line: 'value' | 'posProfit' | 'negProfit',
  portfolioHistory: PortfolioMetrics[]
) {
  const points = portfolioHistory.map((p) => {
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
        line === 'value' ? value : line === 'posProfit' ? posProfit : negProfit,
    }
  })
  return points
}
