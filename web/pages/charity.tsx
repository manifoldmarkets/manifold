import { charities } from 'common/charity'
import { formatMoney, formatMoneyWithDecimals } from 'common/util/format'
import { sortBy } from 'lodash'
import { useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
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
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'

import {
  calculateTicketsFromMana,
  getCurrentGiveawayTicketPrice,
} from 'common/charity-giveaway'

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

// Horse charities to exclude from the giveaway
const EXCLUDED_CHARITY_IDS = [
  'new-vocations',
  'stable-recovery',
  'thoroughbred-retirement-foundation',
  'the-thoroughbred-aftercare-alliance',
  'old-friends',
  'new-york-racetrack-chaplaincy',
  'belmont-child-care-association',
  'thoroughbred-charities-of-america',
  'the-jockey-club-safety-net-foundation',
  'grayson-jockey-club-research-foundation',
  'mareworthy',
]

// Color palette for the pie chart
const COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#a855f7', // purple
  '#d946ef', // fuchsia
]

export default function CharityGiveawayPage() {
  const user = useUser()
  const { data, refresh } = useAPIGetter('get-charity-giveaway', {})

  const [selectedCharityId, setSelectedCharityId] = useState<string>('')
  const [hoveredCharityId, setHoveredCharityId] = useState<string | null>(null)
  const [manaAmount, setManaAmount] = useState<number>(100)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [salesRefreshKey, setSalesRefreshKey] = useState(0)

  const previewCharityId = hoveredCharityId || selectedCharityId

  const giveaway = data ? data.giveaway : undefined
  const charityStats = data ? data.charityStats : []
  const totalTickets = data ? data.totalTickets : 0
  const totalManaSpent = charityStats.reduce(
    (sum, s) => sum + s.totalManaSpent,
    0
  )

  // Calculate time remaining
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [timeRemainingDetailed, setTimeRemainingDetailed] = useState<string>('')
  useEffect(() => {
    if (!giveaway) return
    const updateTime = () => {
      const now = Date.now()
      const diff = giveaway.closeTime - now
      if (diff <= 0) {
        setTimeRemaining('Ended')
        setTimeRemainingDetailed('Drawing complete')
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      )
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h`)
        setTimeRemainingDetailed(`${days} days, ${hours} hours remaining`)
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`)
        setTimeRemainingDetailed(`${hours} hours, ${minutes} minutes remaining`)
      } else {
        setTimeRemaining(`${minutes}m`)
        setTimeRemainingDetailed(`${minutes} minutes remaining`)
      }
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [giveaway?.closeTime])

  const selectedCharityStats = charityStats.find(
    (s) => s.charityId === selectedCharityId
  )
  const currentCharityTickets = selectedCharityStats?.totalTickets ?? 0

  const numTickets = useMemo(() => {
    if (manaAmount <= 0) return 0
    return calculateTicketsFromMana(totalTickets, manaAmount)
  }, [totalTickets, manaAmount])

  const currentPrice = getCurrentGiveawayTicketPrice(totalTickets)
  const isClosed = giveaway && giveaway.closeTime <= Date.now()

  const handleBuyTickets = async () => {
    if (!giveaway || !selectedCharityId || numTickets <= 0) return
    setIsSubmitting(true)
    try {
      const result = await api('buy-charity-giveaway-tickets', {
        giveawayNum: giveaway.giveawayNum,
        charityId: selectedCharityId,
        numTickets,
      })
      toast.success(
        `Purchased ${formatTickets(
          result.numTickets
        )} tickets for ${formatMoney(result.manaSpent)}!`
      )
      track('charity giveaway purchase', {
        giveawayNum: giveaway.giveawayNum,
        charityId: selectedCharityId,
        charityName: charities.find((c) => c.id === selectedCharityId)?.name,
        numTickets: result.numTickets,
        manaSpent: result.manaSpent,
        ticketId: result.ticketId,
      })
      refresh()
      setSalesRefreshKey((k) => k + 1)
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
      <Page trackPageView={'charity giveaway'}>
        <Col className="items-center justify-center py-20">
          <LoadingIndicator />
        </Col>
      </Page>
    )
  }

  if (!giveaway) {
    return (
      <Page trackPageView={'charity giveaway'}>
        <SEO
          title="Charity Giveaway"
          description="Buy tickets for your favorite charity to win $1,000!"
          url="/charity"
        />
        <Col className="mx-auto w-full max-w-3xl items-center justify-center gap-6 px-4 py-20">
          <div className="text-ink-300 text-6xl">🎟️</div>
          <h1 className="text-ink-900 text-2xl font-semibold">
            No Active Giveaway
          </h1>
          <p className="text-ink-500 text-center">
            There's no giveaway running at the moment.
            <br />
            Check back soon for the next drawing!
          </p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView={'charity giveaway'}>
      <SEO
        title="Manifold Charity Giveaway"
        description="Buy tickets for your favorite charity to win $1,000!"
        url="/charity"
      />

      <Col className="mx-auto w-full max-w-3xl gap-8 px-4 py-8 sm:px-6">
        {/* Header */}
        <Col className="gap-4">
          <Row className="items-center gap-3">
            <span className="text-3xl">🎟️</span>
            <h1 className="text-ink-900 text-3xl font-bold tracking-tight">
              Manifold Charity Giveaway
            </h1>
          </Row>
          <p className="text-ink-600 text-lg leading-relaxed">
            Manifold is giving ${giveaway.prizeAmountUsd.toLocaleString()} to
            charity—you decide which one. Buy tickets to boost a charity's odds,
            and on March 1st, we'll draw one lucky ticket to determine the
            winning charity.
          </p>
        </Col>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Prize Pool"
            value={`$${giveaway.prizeAmountUsd.toLocaleString()}`}
            color="teal"
          />
          <StatCard
            label="Time Left"
            value={timeRemaining}
            sublabel={timeRemainingDetailed}
            color={isClosed ? 'red' : 'amber'}
          />
          <StatCard
            label="Tickets Sold"
            value={Math.round(totalTickets).toLocaleString()}
            color="indigo"
          />
          <StatCard
            label="Mana Spent"
            value={formatMoney(totalManaSpent)}
            color="violet"
          />
        </div>

        {/* Pie Chart */}
        <GiveawayPieChart
          charityStats={charityStats}
          totalTickets={totalTickets}
          hoveredCharityId={hoveredCharityId}
          onHoverCharity={setHoveredCharityId}
          onSelectCharity={setSelectedCharityId}
        />

        {/* Purchase Form */}
        {!isClosed && user && (
          <PurchaseForm
            selectedCharityId={selectedCharityId}
            setSelectedCharityId={setSelectedCharityId}
            previewCharityId={previewCharityId}
            hoveredCharityId={hoveredCharityId}
            manaAmount={manaAmount}
            setManaAmount={setManaAmount}
            numTickets={numTickets}
            currentPrice={currentPrice}
            totalTickets={totalTickets}
            currentCharityTickets={currentCharityTickets}
            isSubmitting={isSubmitting}
            handleBuyTickets={handleBuyTickets}
          />
        )}

        {!isClosed && !user && (
          <SignInPrompt previewCharityId={previewCharityId} />
        )}

        {isClosed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
            <div className="mb-2 text-2xl">🏆</div>
            <h3 className="text-ink-900 font-semibold">Giveaway Closed</h3>
            <p className="text-ink-600 mt-1 text-sm">
              {giveaway.winningTicketId
                ? 'A winner has been selected!'
                : 'The winning ticket will be drawn soon.'}
            </p>
          </div>
        )}

        {/* Sales History */}
        <SalesHistory
          giveawayNum={giveaway.giveawayNum}
          refreshKey={salesRefreshKey}
        />
      </Col>
    </Page>
  )
}

function StatCard(props: {
  label: string
  value: string
  sublabel?: string
  color: 'teal' | 'amber' | 'red' | 'indigo' | 'violet'
}) {
  const { label, value, sublabel, color } = props

  const colorClasses = {
    teal: 'text-teal-600 dark:text-teal-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-500 dark:text-red-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    violet: 'text-violet-600 dark:text-violet-400',
  }

  return (
    <div className="bg-canvas-0 border-canvas-50 flex flex-col rounded-xl border p-4 shadow-sm">
      <div className="text-ink-500 text-xs font-medium uppercase tracking-wider">
        {label}
      </div>
      <div
        className={clsx(
          'mt-1 text-xl font-bold sm:text-2xl',
          colorClasses[color]
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-ink-400 mt-0.5 text-xs">{sublabel}</div>
      )}
    </div>
  )
}

function PurchaseForm(props: {
  selectedCharityId: string
  setSelectedCharityId: (id: string) => void
  previewCharityId: string
  hoveredCharityId: string | null
  manaAmount: number
  setManaAmount: (amount: number) => void
  numTickets: number
  currentPrice: number
  totalTickets: number
  currentCharityTickets: number
  isSubmitting: boolean
  handleBuyTickets: () => void
}) {
  const {
    selectedCharityId,
    setSelectedCharityId,
    previewCharityId,
    hoveredCharityId,
    manaAmount,
    setManaAmount,
    numTickets,
    currentPrice,
    totalTickets,
    currentCharityTickets,
    isSubmitting,
    handleBuyTickets,
  } = props

  const previewCharity = previewCharityId
    ? charities.find((c) => c.id === previewCharityId)
    : null
  const isHovering = hoveredCharityId === previewCharityId && !selectedCharityId

  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 bg-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Buy Tickets</h3>
        <p className="text-ink-500 mt-0.5 text-sm">
          Support a charity and enter the drawing
        </p>
      </div>

      <Col className="gap-5 p-5">
        {/* Charity Selection */}
        <Col className="gap-2">
          <label className="text-ink-700 text-sm font-medium">
            Choose a charity
          </label>
          <Select
            value={selectedCharityId}
            onChange={(e) => setSelectedCharityId(e.target.value)}
            className="w-full rounded-lg"
          >
            <option value="">Select charity...</option>
            {sortBy(
              charities.filter((c) => !EXCLUDED_CHARITY_IDS.includes(c.id)),
              'name'
            ).map((charity) => (
              <option key={charity.id} value={charity.id}>
                {charity.name}
              </option>
            ))}
          </Select>
        </Col>

        {/* Charity Preview */}
        {previewCharity && (
          <div
            className={clsx(
              'overflow-hidden rounded-lg border transition-all',
              isHovering
                ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30'
                : 'border-canvas-100 bg-canvas-50'
            )}
          >
            <Row className="gap-3 p-3">
              {previewCharity.photo && (
                <img
                  src={previewCharity.photo}
                  alt={previewCharity.name}
                  className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                />
              )}
              <Col className="min-w-0 flex-1 gap-0.5">
                <div className="text-ink-900 text-sm font-medium">
                  {previewCharity.name}
                </div>
                <div className="text-ink-500 line-clamp-2 text-xs leading-relaxed">
                  {previewCharity.preview}
                </div>
              </Col>
            </Row>
          </div>
        )}

        {/* Amount Input */}
        {selectedCharityId && (
          <>
            <Col className="gap-2">
              <label className="text-ink-700 text-sm font-medium">
                Amount to spend
              </label>
              <Row className="items-center gap-2">
                <Row className="bg-canvas-50 border-canvas-100 flex-1 items-center gap-1.5 rounded-lg border px-3 py-2">
                  <ManaCoin />
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={manaAmount || ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setManaAmount(0)
                      } else {
                        setManaAmount(Math.floor(parseInt(val) || 0))
                      }
                    }}
                    className="!border-0 !bg-transparent !p-0 !ring-0"
                  />
                </Row>
              </Row>
              <Row className="flex-wrap gap-1.5">
                {[100, 1000, 10000, 100000].map((n) => (
                  <button
                    key={n}
                    onClick={() => setManaAmount(n)}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      manaAmount === n
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                        : 'text-ink-600 hover:bg-canvas-100'
                    )}
                  >
                    {formatMoney(n)}
                  </button>
                ))}
              </Row>
            </Col>

            {/* Summary */}
            <div className="bg-canvas-50 rounded-lg p-4">
              <Row className="text-ink-600 items-center justify-between text-sm">
                <Row className="items-center gap-1">
                  <span>Price per ticket</span>
                  <InfoTooltip
                    text="Tickets are priced on a bonding curve, making it cheaper to buy earlier."
                    size="sm"
                  />
                </Row>
                <span className="font-medium">
                  {formatMoneyWithDecimals(currentPrice)}
                </span>
              </Row>
              <Row className="text-ink-600 mt-2 items-center justify-between text-sm">
                <span>Total sold</span>
                <span>{formatTickets(totalTickets)} tickets</span>
              </Row>
              {currentCharityTickets > 0 && (
                <Row className="text-ink-600 mt-2 items-center justify-between text-sm">
                  <span>
                    {charities.find((c) => c.id === selectedCharityId)?.name}'s
                    tickets
                  </span>
                  <span>{formatTickets(currentCharityTickets)}</span>
                </Row>
              )}
              <div className="border-canvas-200 mt-3 border-t pt-3">
                <Row className="items-center justify-between">
                  <span className="text-ink-900 font-medium">You'll get</span>
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {formatTickets(numTickets)} tickets
                  </span>
                </Row>
              </div>
            </div>

            {/* Buy Button */}
            <Button
              color="indigo"
              size="lg"
              onClick={handleBuyTickets}
              loading={isSubmitting}
              disabled={!selectedCharityId || numTickets <= 0 || isSubmitting}
              className="w-full justify-center rounded-lg py-3 font-semibold"
            >
              Buy {formatTickets(numTickets)} tickets for{' '}
              {formatMoney(manaAmount)}
            </Button>
          </>
        )}
      </Col>
    </div>
  )
}

function SignInPrompt(props: { previewCharityId: string }) {
  const { previewCharityId } = props
  const previewCharity = previewCharityId
    ? charities.find((c) => c.id === previewCharityId)
    : null

  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 bg-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Buy Tickets</h3>
        <p className="text-ink-500 mt-0.5 text-sm">
          Support a charity and enter the drawing
        </p>
      </div>

      <Col className="items-center gap-4 p-6">
        {previewCharity ? (
          <Row className="w-full gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-700 dark:bg-indigo-950/30">
            {previewCharity.photo && (
              <img
                src={previewCharity.photo}
                alt={previewCharity.name}
                className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
              />
            )}
            <Col className="min-w-0 flex-1 gap-0.5">
              <div className="text-ink-900 text-sm font-medium">
                {previewCharity.name}
              </div>
              <div className="text-ink-500 line-clamp-2 text-xs">
                {previewCharity.preview}
              </div>
            </Col>
          </Row>
        ) : (
          <div className="text-ink-300 text-4xl">🎟️</div>
        )}
        <p className="text-ink-600 text-center text-sm">
          Sign in to buy tickets and support your favorite charity
        </p>
        <Button color="indigo" className="w-full justify-center">
          Sign in to participate
        </Button>
      </Col>
    </div>
  )
}

function GiveawayPieChart(props: {
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
      <div className="bg-canvas-0 border-canvas-50 flex flex-col items-center justify-center rounded-xl border p-12 shadow-sm">
        <div className="text-ink-200 mb-3 text-5xl">📊</div>
        <p className="text-ink-900 font-medium">No tickets yet</p>
        <p className="text-ink-500 mt-1 text-sm">
          Be the first to participate!
        </p>
      </div>
    )
  }

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

  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2

    const distance = Math.sqrt(x * x + y * y)
    const maxRadius = rect.width / 2
    const innerRadius = maxRadius * 0.5
    const outerRadius = maxRadius * 0.95

    if (distance < innerRadius || distance > outerRadius) {
      return
    }

    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90
    if (angle < 0) angle += 360

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
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Ticket Distribution</h3>
        <p className="text-ink-500 mt-0.5 text-sm">Breakdown by charity</p>
      </div>

      <div className="p-5">
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
              {/* Background circle */}
              <circle
                cx="20"
                cy="20"
                r={radius}
                fill="transparent"
                className="stroke-canvas-100"
                strokeWidth="5"
              />
              {/* Segments */}
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
                      className="cursor-pointer transition-all duration-200"
                      style={{
                        opacity: hoveredCharityId && !isHovered ? 0.3 : 1,
                        filter: isHovered
                          ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))'
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
              <div className="text-ink-400 text-xs font-medium uppercase tracking-wide">
                tickets
              </div>
            </div>
          </div>

          {/* Legend */}
          <Col className="gap-1">
            {segments.slice(0, 8).map((segment, index) => {
              const percentage = ((segment.value / totalTickets) * 100).toFixed(
                1
              )
              const isHovered = hoveredCharityId === segment.charityId
              return (
                <Row
                  key={index}
                  className={clsx(
                    'cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-150',
                    isHovered ? 'bg-canvas-100 shadow-sm' : 'hover:bg-canvas-50'
                  )}
                  onMouseEnter={() => onHoverCharity(segment.charityId)}
                  onMouseLeave={() => onHoverCharity(null)}
                  onClick={() => onSelectCharity(segment.charityId)}
                >
                  <span
                    className={clsx(
                      'flex-shrink-0 rounded-full transition-all duration-150',
                      isHovered ? 'h-3 w-3' : 'h-2.5 w-2.5'
                    )}
                    style={{ backgroundColor: segment.color }}
                  />
                  <span
                    className={clsx(
                      'max-w-[160px] truncate text-sm transition-all duration-150',
                      isHovered ? 'text-ink-900 font-medium' : 'text-ink-700'
                    )}
                  >
                    {segment.label}
                  </span>
                  <span
                    className={clsx(
                      'ml-auto whitespace-nowrap text-sm tabular-nums transition-all duration-150',
                      isHovered ? 'text-ink-700' : 'text-ink-400'
                    )}
                  >
                    {percentage}%
                  </span>
                </Row>
              )
            })}
            {segments.length > 8 && (
              <div className="text-ink-400 px-3 py-1 text-xs">
                +{segments.length - 8} more
              </div>
            )}
          </Col>
        </Row>
      </div>
    </div>
  )
}

function SalesHistory(props: { giveawayNum: number; refreshKey: number }) {
  const { giveawayNum, refreshKey } = props
  const { data, refresh } = useAPIGetter('get-charity-giveaway-sales', {
    giveawayNum,
    limit: 50,
  })

  // Refresh sales when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      refresh()
    }
  }, [refreshKey])

  const sales = data?.sales ?? []

  if (sales.length === 0) {
    return null
  }

  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Recent Activity</h3>
        <p className="text-ink-500 mt-0.5 text-sm">Latest ticket purchases</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-canvas-50 bg-canvas-50 border-b">
              <th className="text-ink-500 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">
                User
              </th>
              <th className="text-ink-500 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Charity
              </th>
              <th className="text-ink-500 px-5 py-3 text-right text-xs font-medium uppercase tracking-wider">
                Tickets
              </th>
              <th className="text-ink-500 px-5 py-3 text-right text-xs font-medium uppercase tracking-wider">
                Cost
              </th>
              <th className="text-ink-500 px-5 py-3 text-right text-xs font-medium uppercase tracking-wider">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-canvas-50 divide-y">
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
    </div>
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
    <tr className="hover:bg-canvas-50 transition-colors">
      <td className="px-5 py-4">
        {userData ? (
          <Row className="items-center gap-2.5">
            <Avatar
              username={userData.username}
              avatarUrl={userData.avatarUrl}
              size="xs"
            />
            <UserLink user={userData} className="text-sm font-medium" />
          </Row>
        ) : (
          <div className="bg-canvas-100 h-4 w-24 animate-pulse rounded" />
        )}
      </td>
      <td className="text-ink-600 max-w-[180px] truncate px-5 py-4 text-sm">
        {charityName}
      </td>
      <td className="text-ink-900 px-5 py-4 text-right text-sm font-medium tabular-nums">
        {formatTickets(sale.numTickets)}
      </td>
      <td className="text-ink-600 px-5 py-4 text-right text-sm tabular-nums">
        {formatMoney(sale.manaSpent)}
      </td>
      <td className="text-ink-400 px-5 py-4 text-right text-sm">
        <RelativeTimestamp time={sale.createdTime} />
      </td>
    </tr>
  )
}
