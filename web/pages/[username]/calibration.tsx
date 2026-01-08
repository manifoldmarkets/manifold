import clsx from 'clsx'
import { range } from 'lodash'
import { useState } from 'react'

import { axisBottom, axisRight } from 'd3-axis'
import { scaleLinear } from 'd3-scale'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SizedContainer } from 'web/components/sized-container'
import { SVGChart, formatPct } from 'web/components/charts/helpers'
import { getFullUserByUsername } from 'web/lib/supabase/users'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { formatMoney, formatPercent, formatWithCommas } from 'common/util/format'
import Custom404 from '../404'
import { User } from 'web/lib/firebase/users'
import { Card } from 'web/components/widgets/card'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import Link from 'next/link'
import { TRADE_TERM } from 'common/envs/constants'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getFullUserByUsername(username)

  return {
    props: {
      user,
    },
    revalidate: 60 * 60, // Regenerate after an hour
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function CalibrationPage(props: { user: User | null }) {
  const { user } = props

  if (!user) {
    return <Custom404 />
  }

  if (user.userDeleted) {
    return <DeletedUser />
  }

  return (
    <Page
      trackPageView={'user calibration page'}
      trackPageProps={{ username: user.username }}
    >
      <SEO
        title={`${user.name}'s Trading Performance`}
        description="Trading performance, calibration, and analytics"
      />
      <Col className="mx-auto w-full max-w-4xl px-4 py-6">
        <UserCalibrationContent user={user} />
      </Col>
    </Page>
  )
}

function DeletedUser() {
  return (
    <Page trackPageView={'deleted user calibration'}>
      <div className="flex h-full flex-col items-center justify-center">
        <Title>Deleted account</Title>
        <p>This user's account has been deleted.</p>
      </div>
    </Page>
  )
}

function UserCalibrationContent({ user }: { user: User }) {
  const { data, loading, error } = useAPIGetter('get-user-calibration', {
    userId: user.id,
  })

  if (loading) {
    return (
      <Col className="items-center justify-center py-20">
        <LoadingIndicator />
        <span className="text-ink-500 mt-4">Loading trading data...</span>
      </Col>
    )
  }

  if (error) {
    return (
      <Col className="items-center justify-center py-20">
        <span className="text-scarlet-500">Error loading data</span>
      </Col>
    )
  }

  if (!data) {
    return null
  }

  return (
    <Col className="gap-6">
      {/* Header */}
      <Row className="items-center gap-4">
        <Link href={`/${user.username}`}>
          <Avatar
            avatarUrl={user.avatarUrl}
            username={user.username}
            size="lg"
            noLink
          />
        </Link>
        <Col>
          <Row className="items-center gap-2">
            <UserLink user={user} className="text-2xl font-bold" />
            <span className="text-ink-500 text-lg">Trading Analytics</span>
          </Row>
          <span className="text-ink-500 text-sm">
            Calibration, performance metrics, and profit breakdown
          </span>
        </Col>
      </Row>

      {/* Performance Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Profit"
          value={formatMoney(data.performanceStats.totalProfit, 'MANA')}
          color={data.performanceStats.totalProfit >= 0 ? 'teal' : 'scarlet'}
          tooltip="Net profit across all resolved and unrealized positions"
        />
        <StatCard
          label="Total Volume"
          value={formatMoney(data.performanceStats.totalVolume, 'MANA')}
          tooltip="Total amount traded (sum of absolute bet values)"
        />
        <StatCard
          label="ROI"
          value={formatPercent(data.performanceStats.roi / 100)}
          color={data.performanceStats.roi >= 0 ? 'teal' : 'scarlet'}
          tooltip="Return on investment (profit / volume)"
        />
        <StatCard
          label="Win Rate"
          value={`${data.performanceStats.winRate.toFixed(1)}%`}
          tooltip="Percentage of resolved markets with positive profit"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Markets Traded"
          value={formatWithCommas(data.performanceStats.totalMarkets)}
          tooltip="Total unique markets you've traded on"
        />
        <StatCard
          label="Resolved Markets"
          value={formatWithCommas(data.performanceStats.resolvedMarkets)}
          tooltip="Markets that have resolved"
        />
        <StatCard
          label="Calibration Score"
          value={data.calibration.score.toFixed(2)}
          color={getScoreColor(data.calibration.score)}
          tooltip="How well calibrated your bets are (-100 worst to 0 perfect)"
        />
        <StatCard
          label="Calibration Grade"
          value={getGrade(data.calibration.score)}
          color={getScoreColor(data.calibration.score)}
          tooltip="Letter grade based on calibration score"
        />
            </div>

      {/* Calibration Chart */}
      <Card className="overflow-hidden">
        <div className="bg-canvas-50 border-ink-200 border-b p-4">
          <h2 className="text-ink-900 text-lg font-semibold">
            Calibration Chart
          </h2>
          <p className="text-ink-500 mt-1 text-sm">
            When you {TRADE_TERM} YES at X%, how often does the market resolve YES?
          </p>
        </div>
        <div className="p-6">
          {data.calibration.totalBets > 0 ? (
            <>
              <div className="bg-canvas-50 border-ink-100 relative w-full rounded-md border p-4 pr-12">
            <div className="absolute bottom-0 right-4 top-0 flex items-center">
              <span className="text-ink-800 text-sm [writing-mode:vertical-rl]">
                Resolution probability
              </span>
            </div>
                <SizedContainer className="aspect-square w-full max-w-[500px] pb-8 pr-8 mx-auto">
              {(w, h) => (
                    <UserCalibrationChart
                      yesPoints={data.calibration.yesPoints}
                      noPoints={data.calibration.noPoints}
                  width={w}
                  height={h}
                />
              )}
            </SizedContainer>
            <div className="text-ink-800 text-center text-sm">
              Probability after {TRADE_TERM}
            </div>
          </div>

              <div className="mt-4 flex gap-6 justify-center">
                <Row className="items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-teal-500" />
                  <span className="text-ink-600 text-sm">YES {TRADE_TERM}s</span>
                </Row>
                <Row className="items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-scarlet-500" />
                  <span className="text-ink-600 text-sm">NO {TRADE_TERM}s</span>
                </Row>
              </div>

              <div className="bg-primary-50 border-primary-100 mt-6 rounded-lg border p-4">
                <p className="text-primary-800 text-sm">
                  <strong>Interpretation:</strong> The green dots show when you bought YES at X%, what percentage of those markets resolved YES. For perfect calibration, green dots should be above the diagonal line, and red dots below. A score of 0 means perfect calibration.
                </p>
              </div>
            </>
          ) : (
            <div className="text-ink-500 py-8 text-center">
              Not enough resolved {TRADE_TERM}s to calculate calibration
            </div>
          )}
        </div>
      </Card>

      {/* Portfolio Performance Graph */}
      {data.portfolioHistory.length > 0 && (
        <Card className="overflow-hidden">
          <div className="bg-canvas-50 border-ink-200 border-b p-4">
            <h2 className="text-ink-900 text-lg font-semibold">
              Portfolio Performance
            </h2>
            <p className="text-ink-500 mt-1 text-sm">
              Your portfolio value and profit over time
            </p>
          </div>
          <div className="p-6">
            <SizedContainer className="h-64 w-full">
              {(w, h) => (
                <PortfolioChart
                  data={data.portfolioHistory}
                  width={w}
                  height={h}
                />
              )}
            </SizedContainer>
          </div>
        </Card>
      )}

      {/* Profit by Topic */}
      {data.profitByTopic.length > 0 && (
        <Card className="overflow-hidden">
          <div className="bg-canvas-50 border-ink-200 border-b p-4">
            <h2 className="text-ink-900 text-lg font-semibold">
              Profit by Topic
            </h2>
            <p className="text-ink-500 mt-1 text-sm">
              Your trading performance across different categories
            </p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {data.profitByTopic.slice(0, 10).map((topic) => (
                <TopicProfitRow key={topic.topic} {...topic} />
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Loan Utilization */}
      <Card className="overflow-hidden">
        <div className="bg-canvas-50 border-ink-200 border-b p-4">
          <h2 className="text-ink-900 text-lg font-semibold">
            Loan Utilization
          </h2>
          <p className="text-ink-500 mt-1 text-sm">
            Daily loan usage and capacity
          </p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Col className="items-center">
              <span className="text-ink-500 text-sm">Current Loan</span>
              <span className="text-xl font-bold">
                {formatMoney(data.loanStats.currentLoan, 'MANA')}
              </span>
            </Col>
            <Col className="items-center">
              <span className="text-ink-500 text-sm">Max Loan Capacity</span>
              <span className="text-xl font-bold">
                {formatMoney(data.loanStats.maxLoan, 'MANA')}
              </span>
            </Col>
            <Col className="items-center">
              <span className="text-ink-500 text-sm">Utilization</span>
              <span className={clsx(
                'text-xl font-bold',
                data.loanStats.utilizationRate > 80 ? 'text-scarlet-500' : 
                data.loanStats.utilizationRate > 50 ? 'text-amber-500' : 'text-teal-500'
              )}>
                {data.loanStats.utilizationRate.toFixed(1)}%
              </span>
            </Col>
          </div>

          {/* Utilization Bar */}
          <div className="mb-4">
            <div className="bg-ink-200 h-4 w-full rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  data.loanStats.utilizationRate > 80 ? 'bg-scarlet-500' :
                  data.loanStats.utilizationRate > 50 ? 'bg-amber-500' : 'bg-teal-500'
                )}
                style={{ width: `${Math.min(data.loanStats.utilizationRate, 100)}%` }}
              />
            </div>
          </div>

          {data.loanStats.loanHistory.length > 0 && (
            <SizedContainer className="h-48 w-full">
              {(w, h) => (
                <LoanHistoryChart
                  data={data.loanStats.loanHistory}
                  width={w}
                  height={h}
                />
              )}
            </SizedContainer>
          )}
        </div>
      </Card>
        </Col>
  )
}

// Stat Card Component
function StatCard({
  label,
  value,
  color,
  tooltip,
}: {
  label: string
  value: string
  color?: 'teal' | 'scarlet' | 'amber'
  tooltip?: string
}) {
  return (
    <Card className="p-4">
      <Row className="items-center gap-1">
        <span className="text-ink-500 text-sm">{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </Row>
      <span
        className={clsx(
          'text-xl font-bold',
          color === 'teal' && 'text-teal-600',
          color === 'scarlet' && 'text-scarlet-600',
          color === 'amber' && 'text-amber-600'
        )}
      >
        {value}
      </span>
    </Card>
  )
}

// Topic Profit Row
function TopicProfitRow({
  topic,
  profit,
  volume,
  marketCount,
}: {
  topic: string
  profit: number
  volume: number
  marketCount: number
}) {
  const maxProfit = Math.abs(profit)
  const barWidth = Math.min((maxProfit / 10000) * 100, 100)

  return (
    <div>
      <Row className="items-center justify-between mb-1">
        <span className="font-medium">{topic}</span>
        <span
          className={clsx(
            'font-bold',
            profit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
          )}
        >
          {formatMoney(profit, 'MANA')}
        </span>
      </Row>
      <Row className="items-center gap-2">
        <div className="bg-ink-200 h-2 flex-1 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full',
              profit >= 0 ? 'bg-teal-500' : 'bg-scarlet-500'
            )}
            style={{ width: `${barWidth}%` }}
          />
      </div>
        <span className="text-ink-400 w-24 text-right text-xs">
          {marketCount} markets
                  </span>
      </Row>
    </div>
  )
}

// Calibration Chart
const CALIBRATION_POINTS = [1, 3, 5, ...range(10, 100, 10), 95, 97, 99]

function UserCalibrationChart({
  yesPoints,
  noPoints,
  width,
  height,
}: {
  yesPoints: { x: number; y: number }[]
  noPoints: { x: number; y: number }[]
  width: number
  height: number
}) {
  const xScale = scaleLinear().domain([0, 1]).range([0, width])
  const yScale = scaleLinear().domain([0, 1]).range([height, 0])

  const tickVals = CALIBRATION_POINTS.map((p) => p / 100)

  const format = (d: number) =>
    (d <= 0.9 || d === 0.99) && (d >= 0.1 || d === 0.01) ? formatPct(d) : ''

  const xAxis = axisBottom<number>(xScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const yAxis = axisRight<number>(yScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const px = (p: { x: number; y: number }) => xScale(p.x)
  const py = (p: { x: number; y: number }) => yScale(p.y)

  const V3 = Math.sqrt(3)

  return (
    <SVGChart w={width} h={height} xAxis={xAxis} yAxis={yAxis} noGridlines>
      {/* Diagonal reference line */}
      <line
        x1={xScale(0)}
        y1={yScale(0)}
        x2={xScale(1)}
        y2={yScale(1)}
        stroke="rgb(99 102 241)"
        strokeWidth={1.5}
        strokeDasharray="4 8"
      />

      {/* NO points (red triangles pointing down) */}
      {noPoints.map((p, i) => (
        <polygon
          key={`no-${i}`}
          points={`
            ${px(p)},${py(p) + 6}
            ${px(p) - 3 * V3},${py(p) - 3}
            ${px(p) + 3 * V3},${py(p) - 3}
          `}
          fill="#ef4444"
          stroke="#b91c1c"
          strokeWidth={0.5}
        />
      ))}

      {/* YES points (green triangles pointing up) */}
      {yesPoints.map((p, i) => (
        <polygon
          key={`yes-${i}`}
          points={`
            ${px(p)},${py(p) - 6}
            ${px(p) - 3 * V3},${py(p) + 3}
            ${px(p) + 3 * V3},${py(p) + 3}
          `}
          fill="#10b981"
          stroke="#047857"
          strokeWidth={0.5}
        />
      ))}
    </SVGChart>
  )
}

// Portfolio Chart
function PortfolioChart({
  data,
  width,
  height,
}: {
  data: { timestamp: number; value: number; profit: number }[]
  width: number
  height: number
}) {
  if (data.length === 0) return null

  const margin = { top: 20, right: 40, bottom: 30, left: 10 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const xExtent = [data[0].timestamp, data[data.length - 1].timestamp]
  const yExtent = [
    Math.min(...data.map((d) => d.profit)),
    Math.max(...data.map((d) => d.profit)),
  ]
  // Pad y axis
  const yPadding = (yExtent[1] - yExtent[0]) * 0.1
  yExtent[0] -= yPadding
  yExtent[1] += yPadding

  const xScale = scaleLinear().domain(xExtent).range([0, innerWidth])
  const yScale = scaleLinear().domain(yExtent).range([innerHeight, 0])

  const line = data
    .map((d, i) => {
      const x = xScale(d.timestamp)
      const y = yScale(d.profit)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  // Create area path
  const area = `${line} L ${xScale(data[data.length - 1].timestamp)} ${yScale(0)} L ${xScale(data[0].timestamp)} ${yScale(0)} Z`

  const zeroY = yScale(0)
  const lastProfit = data[data.length - 1].profit
  const isPositive = lastProfit >= 0

  return (
    <svg width={width} height={height}>
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Zero line */}
        <line
          x1={0}
          y1={zeroY}
          x2={innerWidth}
          y2={zeroY}
          stroke="rgb(156 163 175)"
          strokeDasharray="4 4"
        />

        {/* Area fill */}
        <path
          d={area}
          fill={isPositive ? 'rgba(20, 184, 166, 0.2)' : 'rgba(239, 68, 68, 0.2)'}
        />

        {/* Line */}
        <path
          d={line}
          fill="none"
          stroke={isPositive ? 'rgb(20, 184, 166)' : 'rgb(239, 68, 68)'}
          strokeWidth={2}
        />

        {/* Y axis labels */}
        <text
          x={innerWidth + 5}
          y={yScale(yExtent[1])}
          className="fill-ink-500 text-xs"
        >
          {formatMoney(yExtent[1], 'MANA')}
        </text>
        <text
          x={innerWidth + 5}
          y={yScale(yExtent[0])}
          className="fill-ink-500 text-xs"
        >
          {formatMoney(yExtent[0], 'MANA')}
        </text>
      </g>
    </svg>
  )
}

// Loan History Chart
function LoanHistoryChart({
  data,
  width,
  height,
}: {
  data: { date: string; amount: number; utilized: number }[]
  width: number
  height: number
}) {
  if (data.length === 0) return null

  const margin = { top: 10, right: 40, bottom: 30, left: 10 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const maxAmount = Math.max(...data.map((d) => d.amount))
  
  const xScale = scaleLinear().domain([0, data.length - 1]).range([0, innerWidth])
  const yScale = scaleLinear().domain([0, maxAmount * 1.1]).range([innerHeight, 0])

  const line = data
    .map((d, i) => {
      const x = xScale(i)
      const y = yScale(d.amount)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height}>
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Area fill */}
        <path
          d={`${line} L ${xScale(data.length - 1)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`}
          fill="rgba(99, 102, 241, 0.2)"
        />

        {/* Line */}
        <path d={line} fill="none" stroke="rgb(99, 102, 241)" strokeWidth={2} />

        {/* X axis labels */}
        {data.length > 0 && (
          <>
            <text
              x={0}
              y={innerHeight + 20}
              className="fill-ink-500 text-xs"
              textAnchor="start"
            >
              {data[0].date}
            </text>
            <text
              x={innerWidth}
              y={innerHeight + 20}
              className="fill-ink-500 text-xs"
              textAnchor="end"
            >
              {data[data.length - 1].date}
            </text>
          </>
        )}

        {/* Y axis label */}
        <text
          x={innerWidth + 5}
          y={yScale(maxAmount)}
          className="fill-ink-500 text-xs"
        >
          {formatMoney(maxAmount, 'MANA')}
        </text>
      </g>
    </svg>
  )
}

// Utility functions
const getGrade = (score: number) => {
  if (score > -0.05) return 'S'
  if (score >= -0.15) return 'A+'
  if (score >= -0.5) return 'A'
  if (score >= -1) return 'A-'
  if (score >= -1.5) return 'B+'
  if (score >= -2.5) return 'B'
  if (score >= -4) return 'B-'
  if (score >= -5.5) return 'C+'
  if (score >= -7) return 'C'
  if (score >= -8.5) return 'C-'
  if (score >= -10) return 'D'
  return 'F'
}

const getScoreColor = (score: number): 'teal' | 'amber' | 'scarlet' => {
  if (score >= -2) return 'teal'
  if (score >= -5) return 'amber'
  return 'scarlet'
}
