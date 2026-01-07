import { charities } from 'common/charity'
import { formatMoney, formatMoneyWithDecimals } from 'common/util/format'
import { sortBy } from 'lodash'
import { useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'
import { Select } from 'web/components/widgets/select'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import {
  calculateTicketsFromMana,
  getCurrentLotteryTicketPrice,
} from 'common/charity-lottery'

// Format tickets with appropriate precision
function formatTickets(tickets: number): string {
  if (tickets >= 1000) {
    return tickets.toLocaleString(undefined, { maximumFractionDigits: 1 })
  } else if (tickets >= 1) {
    return tickets.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } else {
    return tickets.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
}

// Color palette for the pie chart
const COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
]

export default function CharityLotteryPage() {
  const user = useUser()
  const { data, refresh } = useAPIGetter('get-charity-lottery', {})

  const [selectedCharityId, setSelectedCharityId] = useState<string>('')
  const [hoveredCharityId, setHoveredCharityId] = useState<string | null>(null)
  const [manaAmount, setManaAmount] = useState<number>(10)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // The charity to preview (hovered takes precedence over selected)
  const previewCharityId = hoveredCharityId || selectedCharityId

  const lottery = data ? data.lottery : undefined
  const charityStats = data ? data.charityStats : []
  const totalTickets = data ? data.totalTickets : 0
  const totalManaSpent = charityStats.reduce(
    (sum, s) => sum + s.totalManaSpent,
    0
  )

  // Calculate time remaining
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  useEffect(() => {
    if (!lottery) return
    const updateTime = () => {
      const now = Date.now()
      const diff = lottery.closeTime - now
      if (diff <= 0) {
        setTimeRemaining('Closed')
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      )
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h`)
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`)
      } else {
        setTimeRemaining(`${minutes}m`)
      }
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [lottery?.closeTime])

  // Get current tickets for selected charity (for display)
  const selectedCharityStats = charityStats.find(
    (s) => s.charityId === selectedCharityId
  )
  const currentCharityTickets = selectedCharityStats?.totalTickets ?? 0

  // Calculate tickets from mana input using TOTAL tickets (single bonding curve)
  const numTickets = useMemo(() => {
    if (manaAmount <= 0) return 0
    return calculateTicketsFromMana(totalTickets, manaAmount)
  }, [totalTickets, manaAmount])

  // Current price based on total tickets across all charities
  const currentPrice = getCurrentLotteryTicketPrice(totalTickets)

  const isClosed = lottery && lottery.closeTime <= Date.now()

  const handleBuyTickets = async () => {
    if (!lottery || !selectedCharityId || numTickets <= 0) return
    setIsSubmitting(true)
    try {
      const result = await api('buy-charity-lottery-tickets', {
        lotteryNum: lottery.lotteryNum,
        charityId: selectedCharityId,
        numTickets,
      })
      toast.success(
        `Purchased ${formatTickets(
          result.numTickets
        )} tickets for ${formatMoney(result.manaSpent)}!`
      )
      refresh()
    } catch (e) {
      const msg =
        e instanceof APIError ? e.message : 'Failed to purchase tickets'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (data === undefined) {
    return (
      <Page trackPageView={'charity lottery'}>
        <Col className="items-center justify-center py-20">
          <LoadingIndicator />
        </Col>
      </Page>
    )
  }

  if (!lottery) {
    return (
      <Page trackPageView={'charity lottery'}>
        <SEO
          title="Manifold Charity Lottery"
          description="Buy lottery tickets for your favorite charity to win $1,000!"
          url="/charity-lottery"
        />
        <Col className="mx-auto w-full max-w-4xl items-center justify-center gap-4 px-4 py-20">
          <Title>Manifold Charity Lottery</Title>
          <p className="text-ink-500">
            No active lottery at the moment. Check back soon!
          </p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView={'charity lottery'}>
      <SEO
        title="Manifold Charity Lottery"
        description="Buy lottery tickets for your favorite charity to win $1,000!"
        url="/charity-lottery"
      />
      <Col className="mx-auto w-full max-w-4xl gap-6 px-4 py-6">
        <Col className="gap-4">
          <Title>Manifold Charity Lottery</Title>
          <p className="text-ink-600 text-lg">
            Buy lottery tickets for your favorite charity. At the end of
            February, one ticket will be randomly selected and its charity wins
            the prize!
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="bg-canvas-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                ${lottery.prizeAmountUsd.toLocaleString()}
              </div>
              <div className="text-ink-500 text-sm">Prize</div>
            </div>
            <div className="bg-canvas-50 rounded-lg p-4 text-center">
              <div
                className={clsx(
                  'text-2xl font-bold',
                  isClosed ? 'text-red-500' : 'text-amber-600'
                )}
              >
                {timeRemaining}
              </div>
              <div className="text-ink-500 text-sm">Time Left</div>
            </div>
            <div className="bg-canvas-50 rounded-lg p-4 text-center">
              <div className="text-ink-900 text-2xl font-bold">
                {Math.round(totalTickets).toLocaleString()}
              </div>
              <div className="text-ink-500 text-sm">Total Tickets</div>
            </div>
            <div className="bg-canvas-50 rounded-lg p-4 text-center">
              <div className="text-ink-900 text-2xl font-bold">
                {formatMoney(totalManaSpent)}
              </div>
              <div className="text-ink-500 text-sm">Mana Spent</div>
            </div>
          </div>
        </Col>

        {/* Pie Chart */}
        <LotteryPieChart
          charityStats={charityStats}
          totalTickets={totalTickets}
          hoveredCharityId={hoveredCharityId}
          onHoverCharity={setHoveredCharityId}
          onSelectCharity={setSelectedCharityId}
        />

        {/* Charity Preview (shown when hovering from pie chart, even when not logged in) */}
        {!isClosed &&
          previewCharityId &&
          !user &&
          (() => {
            const previewCharity = charities.find(
              (c) => c.id === previewCharityId
            )
            if (!previewCharity) return null
            return (
              <Row className="gap-4 rounded-lg bg-indigo-50 p-4 ring-2 ring-indigo-400 transition-all">
                {previewCharity.photo && (
                  <img
                    src={previewCharity.photo}
                    alt={previewCharity.name}
                    className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                  />
                )}
                <Col className="min-w-0 flex-1 gap-1">
                  <div className="text-ink-900 font-semibold">
                    {previewCharity.name}
                    <span className="text-ink-500 ml-2 text-sm font-normal">
                      (sign in to buy tickets)
                    </span>
                  </div>
                  <div className="text-ink-600 line-clamp-2 text-sm">
                    {previewCharity.preview}
                  </div>
                </Col>
              </Row>
            )
          })()}

        {/* Purchase Form */}
        {!isClosed && user && (
          <Col className="bg-canvas-50 rounded-lg p-6">
            <h3 className="text-ink-900 mb-4 text-lg font-semibold">
              Buy Tickets
            </h3>
            <Col className="gap-4">
              <Col className="gap-2">
                <label className="text-ink-600 text-sm font-medium">
                  Select a charity
                </label>
                <Select
                  value={selectedCharityId}
                  onChange={(e) => setSelectedCharityId(e.target.value)}
                  className="w-full"
                >
                  <option value="">Choose a charity...</option>
                  {sortBy(charities, 'name').map((charity) => (
                    <option key={charity.id} value={charity.id}>
                      {charity.name}
                    </option>
                  ))}
                </Select>
              </Col>

              {/* Charity Preview (shown when hovering or selected) */}
              {previewCharityId &&
                (() => {
                  const previewCharity = charities.find(
                    (c) => c.id === previewCharityId
                  )
                  if (!previewCharity) return null
                  const isHovering =
                    hoveredCharityId === previewCharityId && !selectedCharityId
                  return (
                    <Row
                      className={clsx(
                        'gap-4 rounded-lg p-4 transition-all',
                        isHovering
                          ? 'bg-indigo-50 ring-2 ring-indigo-400'
                          : 'bg-canvas-0'
                      )}
                    >
                      {previewCharity.photo && (
                        <img
                          src={previewCharity.photo}
                          alt={previewCharity.name}
                          className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <Col className="min-w-0 flex-1 gap-1">
                        <div className="text-ink-900 font-semibold">
                          {previewCharity.name}
                          {isHovering && (
                            <span className="text-ink-500 ml-2 text-sm font-normal">
                              (click to select)
                            </span>
                          )}
                        </div>
                        <div className="text-ink-600 line-clamp-2 text-sm">
                          {previewCharity.preview}
                        </div>
                      </Col>
                    </Row>
                  )
                })()}

              {/* Purchase form only shows when a charity is actually selected */}
              {selectedCharityId && (
                <>
                  <Col className="gap-2">
                    <label className="text-ink-600 text-sm font-medium">
                      Amount to spend
                    </label>
                    <Row className="items-center gap-2">
                      <Row className="items-center gap-1">
                        <ManaCoin />
                        <Input
                          type="number"
                          min={0.1}
                          step={1}
                          value={manaAmount}
                          onChange={(e) =>
                            setManaAmount(
                              Math.max(0, parseFloat(e.target.value) || 0)
                            )
                          }
                          className="w-32"
                        />
                      </Row>
                      <Row className="gap-1">
                        {[10, 100, 1000].map((n) => (
                          <Button
                            key={n}
                            size="xs"
                            color="gray-outline"
                            onClick={() => setManaAmount(n)}
                          >
                            {formatMoney(n)}
                          </Button>
                        ))}
                      </Row>
                    </Row>
                  </Col>

                  <Col className="bg-canvas-0 text-ink-700 rounded-md p-4 text-sm">
                    <Row className="justify-between">
                      <span>Current ticket price:</span>
                      <span>{formatMoneyWithDecimals(currentPrice)}</span>
                    </Row>
                    <Row className="justify-between">
                      <span>Total tickets sold:</span>
                      <span>{formatTickets(totalTickets)}</span>
                    </Row>
                    <Row className="justify-between">
                      <span>
                        Tickets for{' '}
                        {
                          charities.find((c) => c.id === selectedCharityId)
                            ?.name
                        }
                        :
                      </span>
                      <span>{formatTickets(currentCharityTickets)}</span>
                    </Row>
                    <Row className="border-ink-200 mt-2 justify-between border-t pt-2 font-semibold">
                      <span>You will receive:</span>
                      <span>
                        {formatTickets(numTickets)} ticket
                        {numTickets !== 1 ? 's' : ''}
                      </span>
                    </Row>
                  </Col>

                  <Button
                    color="indigo"
                    onClick={handleBuyTickets}
                    loading={isSubmitting}
                    disabled={
                      !selectedCharityId || numTickets <= 0 || isSubmitting
                    }
                  >
                    Buy {formatTickets(numTickets)} tickets for{' '}
                    {formatMoney(manaAmount)}
                  </Button>
                </>
              )}
            </Col>
          </Col>
        )}

        {isClosed && (
          <div className="rounded-lg bg-amber-50 p-4 text-center text-amber-800">
            This lottery has closed.{' '}
            {lottery.winningTicketId
              ? 'A winner has been selected!'
              : 'Winner will be announced soon.'}
          </div>
        )}

        {!user && !isClosed && !previewCharityId && (
          <div className="bg-canvas-50 rounded-lg p-4 text-center">
            Sign in to buy lottery tickets!
          </div>
        )}

        {/* Sales History */}
        <SalesHistory lotteryNum={lottery.lotteryNum} />
      </Col>
    </Page>
  )
}

function LotteryPieChart(props: {
  charityStats: {
    charityId: string
    totalTickets: number
    totalManaSpent: number
  }[]
  totalTickets: number
  hoveredCharityId: string | null
  onHoverCharity: (charityId: string | null) => void
  onSelectCharity: (charityId: string) => void
}) {
  const {
    charityStats,
    totalTickets,
    hoveredCharityId,
    onHoverCharity,
    onSelectCharity,
  } = props

  if (charityStats.length === 0) {
    return (
      <Col className="bg-canvas-50 items-center justify-center rounded-lg p-8">
        <p className="text-ink-500">No tickets purchased yet. Be the first!</p>
      </Col>
    )
  }

  // Sort by tickets and assign colors
  const sortedStats = sortBy(charityStats, (s) => -s.totalTickets)
  const segments = sortedStats.map((stat, i) => {
    const charity = charities.find((c) => c.id === stat.charityId)
    return {
      charityId: stat.charityId,
      label: charity?.name ?? stat.charityId,
      value: stat.totalTickets,
      color: COLORS[i % COLORS.length],
    }
  })

  const radius = 15
  const circumference = 2 * Math.PI * radius

  // Calculate start angles for each segment for hit detection
  const segmentAngles: {
    charityId: string
    startAngle: number
    endAngle: number
  }[] = []
  let currentAngle = 0
  for (const segment of segments) {
    const angle = (segment.value / totalTickets) * 360
    segmentAngles.push({
      charityId: segment.charityId,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
    })
    currentAngle += angle
  }

  // Handle mouse move on the chart to detect which segment we're over
  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2

    // Calculate distance from center
    const distance = Math.sqrt(x * x + y * y)
    const maxRadius = rect.width / 2
    const innerRadius = maxRadius * 0.5 // donut hole
    const outerRadius = maxRadius * 0.95

    // Check if we're in the donut ring area
    if (distance < innerRadius || distance > outerRadius) {
      return // In the center hole or outside - don't change hover
    }

    // Calculate angle (adjusted for SVG rotation)
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90
    if (angle < 0) angle += 360

    // Find which segment this angle belongs to
    for (const seg of segmentAngles) {
      if (angle >= seg.startAngle && angle < seg.endAngle) {
        if (hoveredCharityId !== seg.charityId) {
          onHoverCharity(seg.charityId)
        }
        return
      }
    }
  }

  return (
    <Col className="bg-canvas-50 rounded-lg p-6">
      <h3 className="text-ink-900 mb-4 text-lg font-semibold">
        Ticket Distribution
      </h3>
      <Row className="flex-wrap items-center justify-center gap-8">
        {/* Chart */}
        <div className="relative" onMouseLeave={() => onHoverCharity(null)}>
          <svg
            width="200"
            height="200"
            viewBox="0 0 40 40"
            className="-rotate-90 transform"
            onMouseMove={handleChartMouseMove}
          >
            {/* Render all segments */}
            {(() => {
              let accumulatedOffset = 0
              return segments.map((segment, index) => {
                const isHovered = hoveredCharityId === segment.charityId
                const strokeDasharray = `${
                  (segment.value / totalTickets) * circumference
                } ${circumference}`
                const strokeDashoffset = -accumulatedOffset
                accumulatedOffset +=
                  (segment.value / totalTickets) * circumference

                return (
                  <circle
                    key={index}
                    cx="20"
                    cy="20"
                    r={radius}
                    fill="transparent"
                    stroke={segment.color}
                    strokeWidth={isHovered ? 7 : 5}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="cursor-pointer transition-all duration-150"
                    style={{
                      opacity: hoveredCharityId && !isHovered ? 0.4 : 1,
                      filter: isHovered
                        ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                        : 'none',
                    }}
                    onClick={() => onSelectCharity(segment.charityId)}
                  />
                )
              })
            })()}
          </svg>
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center">
            <div className="text-ink-900 text-xl font-bold">
              {Math.round(totalTickets).toLocaleString()}
            </div>
            <div className="text-ink-500 text-sm">tickets</div>
          </div>
        </div>

        {/* Legend */}
        <Col className="gap-1">
          {segments.slice(0, 10).map((segment, index) => {
            const percentage = ((segment.value / totalTickets) * 100).toFixed(1)
            const isHovered = hoveredCharityId === segment.charityId
            return (
              <Row
                key={index}
                className={clsx(
                  'cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-all duration-150',
                  isHovered
                    ? 'scale-105 bg-indigo-100 shadow-md'
                    : 'hover:bg-canvas-100'
                )}
                onMouseEnter={() => onHoverCharity(segment.charityId)}
                onMouseLeave={() => onHoverCharity(null)}
                onClick={() => onSelectCharity(segment.charityId)}
              >
                <span
                  className={clsx(
                    'flex-shrink-0 rounded transition-all duration-150',
                    isHovered ? 'h-4 w-4' : 'h-3 w-3'
                  )}
                  style={{ backgroundColor: segment.color }}
                />
                <span
                  className={clsx(
                    'truncate transition-all duration-150',
                    isHovered ? 'text-ink-900 font-semibold' : 'text-ink-700'
                  )}
                  style={{ maxWidth: 200 }}
                >
                  {segment.label}
                </span>
                <span
                  className={clsx(
                    'ml-auto whitespace-nowrap transition-all duration-150',
                    isHovered ? 'text-ink-700' : 'text-ink-500'
                  )}
                >
                  {segment.value.toLocaleString()} ({percentage}%)
                </span>
              </Row>
            )
          })}
          {segments.length > 10 && (
            <span className="text-ink-500 px-2 text-sm">
              +{segments.length - 10} more charities
            </span>
          )}
        </Col>
      </Row>
    </Col>
  )
}

function SalesHistory(props: { lotteryNum: number }) {
  const { lotteryNum } = props
  const { data } = useAPIGetter('get-charity-lottery-sales', {
    lotteryNum,
    limit: 50,
  })

  const sales = data?.sales ?? []

  if (sales.length === 0) {
    return null
  }

  return (
    <Col className="gap-4">
      <h3 className="text-ink-900 text-lg font-semibold">Recent Purchases</h3>
      <div className="bg-canvas-50 overflow-hidden rounded-lg">
        <table className="min-w-full">
          <thead className="bg-canvas-100">
            <tr>
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                User
              </th>
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                Charity
              </th>
              <th className="text-ink-600 px-4 py-3 text-right text-sm font-medium">
                Tickets
              </th>
              <th className="text-ink-600 px-4 py-3 text-right text-sm font-medium">
                Cost
              </th>
              <th className="text-ink-600 px-4 py-3 text-right text-sm font-medium">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-ink-200 divide-y">
            {sales.map((sale) => {
              const charity = charities.find((c) => c.id === sale.charityId)
              return (
                <SaleRow
                  key={sale.id}
                  sale={sale}
                  charityName={charity?.name ?? sale.charityId}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </Col>
  )
}

function SaleRow(props: {
  sale: {
    id: string
    userId: string
    charityId: string
    numTickets: number
    manaSpent: number
    createdTime: number
  }
  charityName: string
}) {
  const { sale, charityName } = props
  const { data: userData } = useAPIGetter('user/by-id/:id', { id: sale.userId })

  return (
    <tr className="hover:bg-canvas-100">
      <td className="px-4 py-3">
        {userData ? (
          <Row className="items-center gap-2">
            <Avatar
              username={userData.username}
              avatarUrl={userData.avatarUrl}
              size="xs"
            />
            <UserLink user={userData} />
          </Row>
        ) : (
          <span className="text-ink-400">Loading...</span>
        )}
      </td>
      <td className="text-ink-700 max-w-[200px] truncate px-4 py-3 text-sm">
        {charityName}
      </td>
      <td className="text-ink-900 px-4 py-3 text-right text-sm font-medium">
        {formatTickets(sale.numTickets)}
      </td>
      <td className="text-ink-700 px-4 py-3 text-right text-sm">
        {formatMoney(sale.manaSpent)}
      </td>
      <td className="text-ink-500 px-4 py-3 text-right text-sm">
        <RelativeTimestamp time={sale.createdTime} />
      </td>
    </tr>
  )
}
