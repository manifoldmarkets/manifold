import clsx from 'clsx'
import { range } from 'lodash'
import { useState } from 'react'

import { scaleLinear } from 'd3-scale'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SizedContainer } from 'web/components/sized-container'
import { getFullUserByUsername } from 'web/lib/supabase/users'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
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

      {/* Performance Stats - 2 rows of 4 on desktop */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Profit"
          value={formatMoney(data.performanceStats.totalProfit, 'MANA')}
          color={data.performanceStats.totalProfit >= 0 ? 'teal' : 'scarlet'}
          tooltip="Net profit across all resolved and unrealized positions"
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
        <StatCard
          label="Markets Traded"
          value={formatWithCommas(data.performanceStats.totalMarkets)}
          tooltip="Total unique markets you've traded on"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Volume"
          value={formatMoney(data.performanceStats.totalVolume, 'MANA')}
          tooltip="Total amount traded (sum of absolute bet values)"
        />
        <StatCard
          label="Sharpe Ratio"
          value={data.performanceStats.sharpeRatio.toFixed(2)}
          color={
            data.performanceStats.sharpeRatio >= 1
              ? 'teal'
              : data.performanceStats.sharpeRatio < 0
              ? 'scarlet'
              : undefined
          }
          tooltip="Risk-adjusted return (annualized return / volatility). Above 1 is good, above 2 is excellent"
        />
        <StatCard
          label="Volatility"
          value={`${data.performanceStats.volatility.toFixed(1)}%`}
          tooltip="Daily standard deviation of portfolio returns (higher = more variable returns)"
        />
        <StatCard
          label="Max Drawdown"
          value={`-${data.performanceStats.maxDrawdown.toFixed(1)}%`}
          color={
            data.performanceStats.maxDrawdown > 30
              ? 'scarlet'
              : data.performanceStats.maxDrawdown < 15
              ? 'teal'
              : undefined
          }
          tooltip="Largest peak-to-trough decline in portfolio value"
        />
      </div>

      {/* Calibration Chart */}
      <Card className="overflow-hidden">
        <div className="border-ink-200 border-b bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-5 dark:from-indigo-500/5 dark:via-purple-500/5 dark:to-pink-500/5">
          <h2 className="text-ink-900 text-xl font-bold">Calibration Chart</h2>
          <p className="text-ink-500 mt-1 text-sm">
            When you {TRADE_TERM} YES at X%, how often does the market resolve
            YES?
          </p>
        </div>
        <div className="p-6">
          {data.calibration.totalBets > 0 ? (
            <>
              <div className="relative mx-auto max-w-[560px]">
                {/* Chart container with nice background */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 shadow-xl">
                  {/* Y-axis label */}
                  <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90">
                    <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wider text-slate-400">
                      Resolved YES %
                    </span>
                  </div>

                  <SizedContainer className="aspect-square w-full">
                    {(w, h) => (
                      <UserCalibrationChart
                        yesPoints={data.calibration.yesPoints}
                        noPoints={data.calibration.noPoints}
                        width={w}
                        height={h}
                      />
                    )}
                  </SizedContainer>

                  {/* X-axis label */}
                  <div className="mt-2 text-center">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Predicted Probability
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-5 flex justify-center gap-8">
                  <Row className="items-center gap-2.5">
                    <div className="h-4 w-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30" />
                    <span className="text-ink-700 text-sm font-medium">
                      YES {TRADE_TERM}s
                    </span>
                  </Row>
                  <Row className="items-center gap-2.5">
                    <div className="h-4 w-4 rounded-full bg-gradient-to-br from-rose-400 to-red-500 shadow-lg shadow-rose-500/30" />
                    <span className="text-ink-700 text-sm font-medium">
                      NO {TRADE_TERM}s
                    </span>
                  </Row>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-indigo-200/50 bg-gradient-to-r from-indigo-50 to-purple-50 p-4 dark:border-indigo-800/30 dark:from-indigo-950/30 dark:to-purple-950/30">
                <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-200">
                  <strong className="text-indigo-700 dark:text-indigo-300">
                    How to read:
                  </strong>{' '}
                  Points above the diagonal line indicate profitable trading at
                  that probability. Green dots should ideally be above the line
                  (markets resolved YES more often than predicted), and red dots
                  below (markets resolved YES less often than predicted).
                </p>
              </div>
            </>
          ) : (
            <div className="text-ink-500 py-12 text-center">
              <div className="mb-3 text-4xl">📊</div>
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
          <div className="mb-6 grid grid-cols-3 gap-4">
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
              <span
                className={clsx(
                  'text-xl font-bold',
                  data.loanStats.utilizationRate > 80
                    ? 'text-scarlet-500'
                    : data.loanStats.utilizationRate > 50
                    ? 'text-amber-500'
                    : 'text-teal-500'
                )}
              >
                {data.loanStats.utilizationRate.toFixed(1)}%
              </span>
            </Col>
          </div>

          {/* Utilization Bar */}
          <div className="mb-4">
            <div className="bg-ink-200 h-4 w-full overflow-hidden rounded-full">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  data.loanStats.utilizationRate > 80
                    ? 'bg-scarlet-500'
                    : data.loanStats.utilizationRate > 50
                    ? 'bg-amber-500'
                    : 'bg-teal-500'
                )}
                style={{
                  width: `${Math.min(data.loanStats.utilizationRate, 100)}%`,
                }}
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
      <Row className="mb-1 items-center justify-between">
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
        <div className="bg-ink-200 h-2 flex-1 overflow-hidden rounded-full">
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
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number
    y: number
    type: 'yes' | 'no'
  } | null>(null)

  const margin = { top: 20, right: 30, bottom: 40, left: 50 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const xScale = scaleLinear().domain([0, 1]).range([0, innerWidth])
  const yScale = scaleLinear().domain([0, 1]).range([innerHeight, 0])

  const px = (p: { x: number; y: number }) => xScale(p.x)
  const py = (p: { x: number; y: number }) => yScale(p.y)

  // Grid lines
  const gridLines = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
  const axisLabels = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg width={width} height={height}>
      <defs>
        {/* Gradients for points */}
        <radialGradient id="yesGradient" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </radialGradient>
        <radialGradient id="noGradient" cx="30%" cy="30%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#ef4444" />
        </radialGradient>
        {/* Glow filters */}
        <filter id="yesGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#10b981" floodOpacity="0.5" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="noGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#ef4444" floodOpacity="0.5" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Background grid */}
        {gridLines.map((val) => (
          <g key={val}>
            <line
              x1={0}
              y1={yScale(val)}
              x2={innerWidth}
              y2={yScale(val)}
              stroke="rgba(148, 163, 184, 0.15)"
              strokeWidth={1}
            />
            <line
              x1={xScale(val)}
              y1={0}
              x2={xScale(val)}
              y2={innerHeight}
              stroke="rgba(148, 163, 184, 0.15)"
              strokeWidth={1}
            />
          </g>
        ))}

        {/* Confidence band around diagonal */}
        <path
          d={`
            M ${xScale(0)} ${yScale(0.1)}
            L ${xScale(0.9)} ${yScale(1)}
            L ${xScale(1)} ${yScale(1)}
            L ${xScale(1)} ${yScale(0.9)}
            L ${xScale(0.1)} ${yScale(0)}
            L ${xScale(0)} ${yScale(0)}
            Z
          `}
          fill="rgba(99, 102, 241, 0.08)"
        />

        {/* Diagonal reference line */}
        <line
          x1={xScale(0)}
          y1={yScale(0)}
          x2={xScale(1)}
          y2={yScale(1)}
          stroke="rgba(129, 140, 248, 0.6)"
          strokeWidth={2}
          strokeDasharray="8 4"
        />

        {/* Axis lines */}
        <line
          x1={0}
          y1={innerHeight}
          x2={innerWidth}
          y2={innerHeight}
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth={1}
        />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={innerHeight}
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth={1}
        />

        {/* X-axis labels */}
        {axisLabels.map((val) => (
          <text
            key={`x-${val}`}
            x={xScale(val)}
            y={innerHeight + 25}
            textAnchor="middle"
            fill="rgba(148, 163, 184, 0.8)"
            fontSize={12}
            fontWeight={500}
          >
            {Math.round(val * 100)}%
          </text>
        ))}

        {/* Y-axis labels */}
        {axisLabels.map((val) => (
          <text
            key={`y-${val}`}
            x={-15}
            y={yScale(val)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(148, 163, 184, 0.8)"
            fontSize={12}
            fontWeight={500}
          >
            {Math.round(val * 100)}%
          </text>
        ))}

        {/* NO points (red circles) */}
        {noPoints.map((p, i) => (
          <g key={`no-${i}`}>
            <circle
              cx={px(p)}
              cy={py(p)}
              r={
                hoveredPoint?.x === p.x && hoveredPoint?.type === 'no' ? 10 : 8
              }
              fill="url(#noGradient)"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={2}
              filter={
                hoveredPoint?.x === p.x && hoveredPoint?.type === 'no'
                  ? 'url(#noGlow)'
                  : undefined
              }
              style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
              onMouseEnter={() => setHoveredPoint({ ...p, type: 'no' })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          </g>
        ))}

        {/* YES points (green circles) */}
        {yesPoints.map((p, i) => (
          <g key={`yes-${i}`}>
            <circle
              cx={px(p)}
              cy={py(p)}
              r={
                hoveredPoint?.x === p.x && hoveredPoint?.type === 'yes' ? 10 : 8
              }
              fill="url(#yesGradient)"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={2}
              filter={
                hoveredPoint?.x === p.x && hoveredPoint?.type === 'yes'
                  ? 'url(#yesGlow)'
                  : undefined
              }
              style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
              onMouseEnter={() => setHoveredPoint({ ...p, type: 'yes' })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          </g>
        ))}

        {/* Tooltip */}
        {hoveredPoint && (
          <g transform={`translate(${px(hoveredPoint)}, ${py(hoveredPoint)})`}>
            <rect
              x={15}
              y={-35}
              width={120}
              height={50}
              rx={8}
              fill="rgba(15, 23, 42, 0.95)"
              stroke={hoveredPoint.type === 'yes' ? '#10b981' : '#ef4444'}
              strokeWidth={1}
            />
            <text x={25} y={-15} fill="white" fontSize={11} fontWeight={600}>
              {hoveredPoint.type === 'yes' ? 'YES' : 'NO'} at{' '}
              {Math.round(hoveredPoint.x * 100)}%
            </text>
            <text x={25} y={5} fill="rgba(148, 163, 184, 0.9)" fontSize={11}>
              Resolved YES: {Math.round(hoveredPoint.y * 100)}%
            </text>
          </g>
        )}
      </g>
    </svg>
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
  const area = `${line} L ${xScale(data[data.length - 1].timestamp)} ${yScale(
    0
  )} L ${xScale(data[0].timestamp)} ${yScale(0)} Z`

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
          fill={
            isPositive ? 'rgba(20, 184, 166, 0.2)' : 'rgba(239, 68, 68, 0.2)'
          }
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

  const xScale = scaleLinear()
    .domain([0, data.length - 1])
    .range([0, innerWidth])
  const yScale = scaleLinear()
    .domain([0, maxAmount * 1.1])
    .range([innerHeight, 0])

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
          d={`${line} L ${xScale(data.length - 1)} ${yScale(0)} L ${xScale(
            0
          )} ${yScale(0)} Z`}
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
