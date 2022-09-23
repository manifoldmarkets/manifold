import { ResponsiveLine } from '@nivo/line'
import { PortfolioMetrics } from 'common/user'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { memo } from 'react'
import { useWindowSize } from 'web/hooks/use-window-size'
import { formatTime } from 'web/lib/util/time'

export const PortfolioValueGraph = memo(function PortfolioValueGraph(props: {
  portfolioHistory: PortfolioMetrics[]
  mode: 'value' | 'profit'
  height?: number
  includeTime?: boolean
}) {
  const { portfolioHistory, height, includeTime, mode } = props
  const { width } = useWindowSize()

  function getPoints(line: 'value' | 'posProfit' | 'negProfit') {
    let points = portfolioHistory.map((p) => {
      const { timestamp, balance, investmentValue, totalDeposits } = p
      const value = balance + investmentValue
      const profit = value - totalDeposits
      let posProfit = null
      let negProfit = null

      // const profit = value - totalDeposits
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
  const numXTickValues = !width || width < 800 ? 2 : 5
  const numYTickValues = 4
  const endDate = last(firstPoints)?.x

  const firstPointsY = firstPoints
    .filter((p) => {
      return p.y !== null
    })
    .map((p) => p.y)
  // console.log(firstPointsY)

  console.log(
    'MIN: ',
    mode === 'value'
      ? Math.min(...firstPointsY)
      : Math.min(
          ...firstPointsY,
          ...data[1].data
            .filter((p) => {
              return p.y !== null
            })
            .map((p) => p.y)
        ),

    'MAX: ',
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
  )

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: height ?? (!width || width >= 800 ? 350 : 250) }}
    >
      <ResponsiveLine
        data={data}
        margin={{ top: 20, right: 28, bottom: 22, left: 60 }}
        xScale={{
          type: 'time',
          min: firstPoints[0]?.x,
          max: endDate,
        }}
        yScale={{
          type: 'linear',
          stacked: false,
          min:
            mode === 'value'
              ? Math.min(...firstPointsY)
              : Math.min(
                  ...firstPointsY,
                  ...data[1].data
                    .filter((p) => {
                      return p.y !== null
                    })
                    .map((p) => p.y)
                ),
          max:
            mode === 'value'
              ? Math.max(...firstPointsY)
              : Math.max(
                  ...firstPointsY,
                  ...data[1].data
                    .filter((p) => {
                      return p.y !== null
                    })
                    .map((p) => p.y)
                ),
        }}
        gridYValues={numYTickValues}
        curve="linear"
        enablePoints={false}
        colors={{ datum: 'color' }}
        axisBottom={{
          tickValues: numXTickValues,
          format: (time) => formatTime(+time, !!includeTime),
        }}
        pointBorderColor="#fff"
        pointSize={firstPoints.length > 100 ? 0 : 6}
        axisLeft={{
          tickValues: numYTickValues,
          format: (value) => formatMoney(value),
        }}
        enableGridX={!!width && width >= 800}
        enableGridY={true}
        enableSlices="x"
        animate={false}
        yFormat={(value) => formatMoney(+value)}
        // defs={[
        //   {
        //     id: 'purpleGradient',
        //     type: 'linearGradient',
        //     colors: [
        //       { offset: 0, color: '#7c3aed' },
        //       {
        //         offset: 100,
        //         color: '#inherit',
        //         opacity: 0,
        //       },
        //     ],
        //   },
        // ]}
        enableArea={true}
      ></ResponsiveLine>
    </div>
  )
})
