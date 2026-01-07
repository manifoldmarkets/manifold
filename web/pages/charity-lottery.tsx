import { charities, Charity } from 'common/charity'
import { formatMoney } from 'common/util/format'
import { sortBy, sum } from 'lodash'
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

// Bonding curve constants (must match backend)
const BASE_PRICE = 0.1
const SCALE_FACTOR = 500000

function calculateTicketCost(currentTickets: number, numTickets: number): number {
  const n1 = currentTickets
  const n2 = currentTickets + numTickets
  return BASE_PRICE * (n2 - n1 + (n2 * n2 - n1 * n1) / (2 * SCALE_FACTOR))
}

function getCurrentTicketPrice(currentTickets: number): number {
  return BASE_PRICE * (1 + currentTickets / SCALE_FACTOR)
}

// Color palette for the pie chart
const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e',
]

export default function CharityLotteryPage() {
  const user = useUser()
  const { data, refresh } = useAPIGetter('get-charity-lottery', {})

  const [selectedCharityId, setSelectedCharityId] = useState<string>('')
  const [numTickets, setNumTickets] = useState<number>(10)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const lottery = data ? data.lottery : undefined
  const charityStats = data ? data.charityStats : []
  const totalTickets = data ? data.totalTickets : 0

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
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h remaining`)
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m remaining`)
      } else {
        setTimeRemaining(`${minutes}m remaining`)
      }
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [lottery?.closeTime])

  // Get current tickets for selected charity
  const selectedCharityStats = charityStats.find(
    (s) => s.charityId === selectedCharityId
  )
  const currentCharityTickets = selectedCharityStats?.totalTickets ?? 0

  // Calculate cost
  const estimatedCost = useMemo(() => {
    if (numTickets <= 0) return 0
    return calculateTicketCost(currentCharityTickets, numTickets)
  }, [currentCharityTickets, numTickets])

  const currentPrice = getCurrentTicketPrice(currentCharityTickets)

  const isClosed = lottery && lottery.closeTime <= Date.now()

  const handleBuyTickets = async () => {
    if (!lottery || !selectedCharityId || numTickets <= 0) return
    setIsSubmitting(true)
    try {
      await api('buy-charity-lottery-tickets', {
        lotteryNum: lottery.lotteryNum,
        charityId: selectedCharityId,
        numTickets,
      })
      toast.success(`Purchased ${numTickets} tickets!`)
      refresh()
    } catch (e) {
      const msg = e instanceof APIError ? e.message : 'Failed to purchase tickets'
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
          title="Charity Lottery"
          description="Buy tickets for your favorite charity to win $1,000!"
          url="/charity-lottery"
        />
        <Col className="mx-auto w-full max-w-4xl items-center justify-center gap-4 px-4 py-20">
          <Title>Charity Lottery</Title>
          <p className="text-ink-500">No active lottery at the moment. Check back soon!</p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView={'charity lottery'}>
      <SEO
        title="Charity Lottery"
        description="Buy tickets for your favorite charity to win $1,000!"
        url="/charity-lottery"
      />
      <Col className="mx-auto w-full max-w-4xl gap-6 px-4 py-6">
        <Col className="gap-2">
          <Title>{lottery.name}</Title>
          <Row className="text-ink-600 flex-wrap gap-x-6 gap-y-2 text-lg">
            <span className="font-semibold text-green-600">
              ${lottery.prizeAmountUsd.toLocaleString()} Prize
            </span>
            <span className={clsx(isClosed ? 'text-red-500' : 'text-amber-600')}>
              {timeRemaining}
            </span>
            <span>{totalTickets.toLocaleString()} total tickets</span>
          </Row>
          <p className="text-ink-500 mt-2">
            Buy lottery tickets for your favorite charity. When the lottery closes,
            one ticket will be randomly selected and its charity wins the prize!
          </p>
        </Col>

        {/* Pie Chart */}
        <LotteryPieChart charityStats={charityStats} totalTickets={totalTickets} />

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

              {selectedCharityId && (
                <>
                  <Col className="gap-2">
                    <label className="text-ink-600 text-sm font-medium">
                      Number of tickets
                    </label>
                    <Row className="items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={numTickets}
                        onChange={(e) =>
                          setNumTickets(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-32"
                      />
                      <Row className="gap-1">
                        {[10, 100, 1000].map((n) => (
                          <Button
                            key={n}
                            size="xs"
                            color="gray-outline"
                            onClick={() => setNumTickets(n)}
                          >
                            {n}
                          </Button>
                        ))}
                      </Row>
                    </Row>
                  </Col>

                  <Col className="bg-canvas-0 text-ink-700 rounded-md p-4 text-sm">
                    <Row className="justify-between">
                      <span>Current ticket price:</span>
                      <span>{formatMoney(currentPrice)}</span>
                    </Row>
                    <Row className="justify-between">
                      <span>Tickets for {charities.find(c => c.id === selectedCharityId)?.name}:</span>
                      <span>{currentCharityTickets.toLocaleString()}</span>
                    </Row>
                    <Row className="border-ink-200 mt-2 justify-between border-t pt-2 font-semibold">
                      <span>Total cost:</span>
                      <Row className="items-center gap-1">
                        <ManaCoin />
                        {formatMoney(estimatedCost)}
                      </Row>
                    </Row>
                  </Col>

                  <Button
                    color="indigo"
                    onClick={handleBuyTickets}
                    loading={isSubmitting}
                    disabled={!selectedCharityId || numTickets <= 0 || isSubmitting}
                  >
                    Buy {numTickets} ticket{numTickets !== 1 ? 's' : ''} for{' '}
                    {formatMoney(estimatedCost)}
                  </Button>
                </>
              )}
            </Col>
          </Col>
        )}

        {isClosed && (
          <div className="bg-amber-50 text-amber-800 rounded-lg p-4 text-center">
            This lottery has closed. {lottery.winningTicketId ? 'A winner has been selected!' : 'Winner will be announced soon.'}
          </div>
        )}

        {!user && !isClosed && (
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
  charityStats: { charityId: string; totalTickets: number; totalManaSpent: number }[]
  totalTickets: number
}) {
  const { charityStats, totalTickets } = props

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
      label: charity?.name ?? stat.charityId,
      value: stat.totalTickets,
      color: COLORS[i % COLORS.length],
    }
  })

  const radius = 15
  const circumference = 2 * Math.PI * radius
  let accumulatedOffset = 0

  return (
    <Col className="bg-canvas-50 rounded-lg p-6">
      <h3 className="text-ink-900 mb-4 text-lg font-semibold">Ticket Distribution</h3>
      <Row className="flex-wrap items-center justify-center gap-8">
        {/* Chart */}
        <div className="relative">
          <svg
            width="200"
            height="200"
            viewBox="0 0 40 40"
            className="-rotate-90 transform"
          >
            {segments.map((segment, index) => {
              const strokeDasharray = `${
                (segment.value / totalTickets) * circumference
              } ${circumference}`
              const strokeDashoffset = -accumulatedOffset
              accumulatedOffset += (segment.value / totalTickets) * circumference

              return (
                <circle
                  key={index}
                  cx="20"
                  cy="20"
                  r={radius}
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth="5"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-300 ease-out"
                />
              )
            })}
          </svg>
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center">
            <div className="text-ink-900 text-xl font-bold">
              {totalTickets.toLocaleString()}
            </div>
            <div className="text-ink-500 text-sm">tickets</div>
          </div>
        </div>

        {/* Legend */}
        <Col className="gap-2">
          {segments.slice(0, 10).map((segment, index) => {
            const percentage = ((segment.value / totalTickets) * 100).toFixed(1)
            return (
              <Row key={index} className="items-center gap-2 text-sm">
                <span
                  className="h-3 w-3 flex-shrink-0 rounded"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-ink-700 truncate" style={{ maxWidth: 200 }}>
                  {segment.label}
                </span>
                <span className="text-ink-500 ml-auto">
                  {segment.value.toLocaleString()} ({percentage}%)
                </span>
              </Row>
            )
          })}
          {segments.length > 10 && (
            <span className="text-ink-500 text-sm">
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
                <SaleRow key={sale.id} sale={sale} charityName={charity?.name ?? sale.charityId} />
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
        {sale.numTickets.toLocaleString()}
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
