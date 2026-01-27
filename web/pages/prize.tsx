import { formatMoney, formatMoneyWithDecimals } from 'common/util/format'
import { sortBy } from 'lodash'
import { GetServerSideProps } from 'next'
import { useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { useAdmin } from 'web/hooks/use-admin'
import { api, APIError } from 'web/lib/api/api'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'

import {
  calculateSweepstakesTicketsFromMana,
  getCurrentSweepstakesTicketPrice,
  getTotalPrizePool,
  SweepstakesPrize,
} from 'common/sweepstakes'
import {
  checkSweepstakesGeofence,
  GeoLocationResult,
} from 'common/sweepstakes-geofencing'
import { canReceiveBonuses } from 'common/user'
import { VerificationRequiredModal } from 'web/components/modals/verification-required-modal'

interface SweepstakesPageProps {
  isLocationRestricted: boolean
}

export const getServerSideProps: GetServerSideProps<
  SweepstakesPageProps
> = async (context) => {
  // Extract IP from request headers
  const forwarded = context.req.headers['x-forwarded-for']
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(',')[0]?.trim() ?? context.req.socket.remoteAddress ?? ''

  const apiKey = process.env.IP_API_PRO_KEY
  if (!apiKey) {
    // Allow access if API key not configured (backend will validate on purchase)
    return {
      props: {
        isLocationRestricted: false,
      },
    }
  }

  try {
    const fields = 'status,message,countryCode,region'
    const response = await fetch(
      `https://pro.ip-api.com/json/${ip}?key=${apiKey}&fields=${fields}`
    )
    const geo: GeoLocationResult = await response.json()
    const { allowed } = checkSweepstakesGeofence(geo)

    return {
      props: {
        isLocationRestricted: !allowed,
      },
    }
  } catch (error) {
    // On error, allow access (backend will validate on purchase)
    return {
      props: {
        isLocationRestricted: false,
      },
    }
  }
}

// Format entries with appropriate precision
function formatEntries(entries: number): string {
  if (entries >= 1000) {
    return entries.toLocaleString(undefined, { maximumFractionDigits: 1 })
  } else if (entries >= 1) {
    return entries.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } else {
    return entries.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
}

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

export default function SweepstakesPage({
  isLocationRestricted,
}: SweepstakesPageProps) {
  const user = useUser()
  const isAdmin = useAdmin()
  const { data, refresh } = useAPIGetter('get-sweepstakes', {})

  const [manaAmount, setManaAmount] = useState<number>(100)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isClaimingFree, setIsClaimingFree] = useState(false)
  const [salesRefreshKey, setSalesRefreshKey] = useState(0)
  const [isSelectingWinners, setIsSelectingWinners] = useState(false)
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null)
  const [showVerificationModal, setShowVerificationModal] = useState(false)

  // Check if user needs to verify before participating
  const needsVerification = user && !canReceiveBonuses(user)

  const sweepstakes = data ? data.sweepstakes : undefined
  const userStats = data ? data.userStats : []
  const totalTickets = data ? data.totalTickets : 0
  const winners = data ? data.winners : undefined
  const nonceHash = data ? data.nonceHash : undefined
  const nonce = data ? data.nonce : undefined
  const hasClaimedFreeTicket = data ? data.hasClaimedFreeTicket : false
  const meetsInvestmentRequirement = data?.meetsInvestmentRequirement ?? true
  const userTotalManaInvested = data?.userTotalManaInvested ?? 0
  const minManaInvested = data?.minManaInvested ?? 1000
  const totalManaSpent = userStats.reduce((sum, s) => sum + s.totalManaSpent, 0)

  // Calculate time remaining
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [timeRemainingDetailed, setTimeRemainingDetailed] = useState<string>('')
  useEffect(() => {
    if (!sweepstakes) return
    const updateTime = () => {
      const now = Date.now()
      const diff = sweepstakes.closeTime - now
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
  }, [sweepstakes?.closeTime])

  const numTickets = useMemo(() => {
    if (manaAmount <= 0) return 0
    return calculateSweepstakesTicketsFromMana(totalTickets, manaAmount)
  }, [totalTickets, manaAmount])

  const currentPrice = getCurrentSweepstakesTicketPrice(totalTickets)
  const isClosed = sweepstakes && sweepstakes.closeTime <= Date.now()
  const hasWinners = !!(winners && winners.length > 0)
  const totalPrizePool = sweepstakes ? getTotalPrizePool(sweepstakes.prizes) : 0

  const handleSelectWinners = async () => {
    if (!sweepstakes || isSelectingWinners) return
    setIsSelectingWinners(true)
    try {
      const result = await api('select-sweepstakes-winners', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
      })
      toast.success(`${result.winners.length} winners selected!`)
      track('sweepstakes winners selected', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
        numWinners: result.winners.length,
      })
      refresh()
    } catch (e) {
      const msg = e instanceof APIError ? e.message : 'Failed to select winners'
      toast.error(msg)
    } finally {
      setIsSelectingWinners(false)
    }
  }

  const handleBuyTickets = async () => {
    if (!sweepstakes || numTickets <= 0) return
    setIsSubmitting(true)
    try {
      const result = await api('buy-sweepstakes-tickets', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
        numTickets,
      })
      toast.success(
        `Gained ${formatEntries(
          result.numTickets
        )} entries for ${formatMoney(result.manaSpent)}!`
      )
      track('sweepstakes purchase', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
        numTickets: result.numTickets,
        manaSpent: result.manaSpent,
        ticketId: result.ticketId,
      })
      refresh()
      setSalesRefreshKey((k) => k + 1)
    } catch (e) {
      const msg =
        e instanceof APIError ? e.message : 'Failed to gain entries'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClaimFreeTicket = async () => {
    if (!sweepstakes || isClaimingFree || hasClaimedFreeTicket) return
    setIsClaimingFree(true)
    try {
      const result = await api('claim-free-sweepstakes-ticket', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
      })
      toast.success(`Claimed ${result.numTickets} free entry!`)
      track('sweepstakes free ticket claimed', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
        ticketId: result.ticketId,
      })
      refresh()
      setSalesRefreshKey((k) => k + 1)
    } catch (e) {
      const msg =
        e instanceof APIError ? e.message : 'Failed to claim free entry'
      toast.error(msg)
    } finally {
      setIsClaimingFree(false)
    }
  }

  if (data === undefined) {
    return (
      <Page trackPageView={'prize-drawing'}>
        <Col className="items-center justify-center py-20">
          <LoadingIndicator />
        </Col>
      </Page>
    )
  }

  if (!sweepstakes) {
    return (
      <Page trackPageView={'prize-drawing'}>
        <SEO
          title="Manifold Prize Drawing"
          description="Enter for a chance to win USDC prizes!"
          url="/prize"
        />
        <Col className="mx-auto w-full max-w-3xl items-center justify-center gap-6 px-4 py-20">
          <h1 className="text-ink-900 text-2xl font-semibold">
            No Active Prize Drawing
          </h1>
          <p className="text-ink-500 text-center">
            There's no prize drawing running at the moment.
            <br />
            Check back soon for the next one!
          </p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView={'prize-drawing'}>
      <SEO
        title="Manifold Prize Drawing"
        description={`Enter for a chance to win $${totalPrizePool.toLocaleString()} in USDC prizes!`}
        url="/prize"
      />

      <Col className="mx-auto w-full max-w-3xl gap-8 px-4 py-8 sm:px-6">
        {/* Header */}
        <Col className="gap-4">
          <Row className="items-center gap-3">
            <h1 className="text-ink-900 text-3xl font-bold tracking-tight">
              Manifold Prize Drawing
            </h1>
          </Row>
          <p className="text-ink-600 text-lg leading-relaxed">
            Enter the drawing for a chance to win USDC prizes! Winners receive real crypto payouts. No purchase necessary.
          </p>
        </Col>

        {/* Location Restriction Banner */}
        {isLocationRestricted && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-300">
              This prize drawing is not available in your region.
            </p>
          </div>
        )}

        {/* Verification Required Banner */}
        {!isLocationRestricted && needsVerification && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
            <Row className="items-center justify-between gap-4">
              <p className="text-indigo-800 dark:text-indigo-300">
                You must verify your identity to participate in the prize
                drawing.
              </p>
              <Button
                color="indigo"
                size="sm"
                onClick={() => setShowVerificationModal(true)}
              >
                Verify Now
              </Button>
            </Row>
          </div>
        )}

        {/* Investment Requirement Banner */}
        {!isLocationRestricted &&
          !needsVerification &&
          user &&
          !meetsInvestmentRequirement && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/30">
              <p className="text-violet-800 dark:text-violet-300">
                You must have at least{' '}
                <span className="font-semibold">
                  {formatMoney(minManaInvested)}
                </span>{' '}
                invested to participate in the prize drawing. You currently
                have{' '}
                <span className="font-semibold">
                  {formatMoney(userTotalManaInvested)}
                </span>{' '}
                invested.
              </p>
            </div>
          )}

        {/* Prize Structure */}
        <PrizeStructure prizes={sweepstakes.prizes} />

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total prizes"
            value={`$${totalPrizePool.toLocaleString()}`}
            sublabel="USDC"
            color="teal"
          />
          <StatCard
            label="Time Left"
            value={timeRemaining}
            sublabel={timeRemainingDetailed}
            color={isClosed ? 'red' : 'amber'}
          />
          <StatCard
            label="Total Entries"
            value={Math.round(totalTickets).toLocaleString()}
            color="indigo"
          />
          <StatCard
            label="Mana Spent"
            value={formatMoney(totalManaSpent)}
            color="violet"
          />
        </div>

        {/* Pie Chart - hide when winners are displayed */}
        {!hasWinners && (
          <UserDistributionChart
            userStats={userStats}
            totalTickets={totalTickets}
            hoveredUserId={hoveredUserId}
            onHoverUser={setHoveredUserId}
          />
        )}

        {/* Purchase Form */}
        {!isClosed && user && (
          <PurchaseForm
            manaAmount={manaAmount}
            setManaAmount={setManaAmount}
            numTickets={numTickets}
            currentPrice={currentPrice}
            totalTickets={totalTickets}
            isSubmitting={isSubmitting}
            handleBuyTickets={handleBuyTickets}
            hasClaimedFreeTicket={hasClaimedFreeTicket ?? false}
            isClaimingFree={isClaimingFree}
            handleClaimFreeTicket={handleClaimFreeTicket}
            disabled={
              isLocationRestricted ||
              !!needsVerification ||
              !meetsInvestmentRequirement
            }
          />
        )}

        {/* Verification Modal */}
        {user && (
          <VerificationRequiredModal
            open={showVerificationModal}
            setOpen={setShowVerificationModal}
            user={user}
            action="receive bonuses"
          />
        )}

        {!isClosed && !user && <SignInPrompt />}

        {/* Disclaimer */}
        {!isClosed && (
          <p className="text-ink-500 text-center text-sm">
            Read our{' '}
            <a
              href="https://docs.manifold.markets/sweepstakes"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Sweepstakes FAQ
            </a>
            . By participating, you agree to Manifold's{' '}
            <a
              href="https://docs.manifold.markets/sweepstakes-rules"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Sweepstakes Rules
            </a>
            .
          </p>
        )}

        {/* Winners Display */}
        {isClosed && hasWinners && winners && (
          <WinnersDisplay winners={winners} />
        )}

        {/* Admin Select Winners Button */}
        {isClosed && !hasWinners && isAdmin && (
          <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border p-6 shadow-sm">
            <Col className="items-center gap-4">
              <h3 className="text-ink-900 text-lg font-semibold">
                Ready to Draw Winners
              </h3>
              <p className="text-ink-600 text-center text-sm">
                The drawing has closed. Click below to randomly select the
                winners.
              </p>
              <Button
                color="indigo"
                size="lg"
                onClick={handleSelectWinners}
                loading={isSelectingWinners}
                disabled={isSelectingWinners}
              >
                🎟️ Draw Winners
              </Button>
            </Col>
          </div>
        )}

        {/* Waiting for winners (non-admin view) */}
        {isClosed && !hasWinners && !isAdmin && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
            <div className="mb-2 text-2xl">⏳</div>
            <h3 className="text-ink-900 font-semibold">Drawing Closed</h3>
            <p className="text-ink-600 mt-1 text-sm">
              The winners will be drawn soon. Check back!
            </p>
          </div>
        )}

        {/* Sales History */}
        <SalesHistory
          sweepstakesNum={sweepstakes.sweepstakesNum}
          refreshKey={salesRefreshKey}
        />

        {/* Provably Fair Banner */}
        {nonceHash && (
          <ProvablyFairBanner
            nonceHash={nonceHash}
            nonce={nonce}
            hasWinners={hasWinners}
          />
        )}
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

function PrizeStructure(props: { prizes: SweepstakesPrize[] }) {
  const { prizes } = props

  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 bg-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Prize Structure</h3>
        <p className="text-ink-500 mt-0.5 text-sm">USDC prizes for winners</p>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {prizes.map((prize, index) => (
            <div
              key={index}
              className="bg-canvas-50 rounded-lg p-3 text-center"
            >
              <div className="text-ink-500 text-sm font-medium">
                {prize.label}
              </div>
              <div className="text-ink-900 mt-1 text-lg font-bold">
                ${prize.amountUsdc.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PurchaseForm(props: {
  manaAmount: number
  setManaAmount: (amount: number) => void
  numTickets: number
  currentPrice: number
  totalTickets: number
  isSubmitting: boolean
  handleBuyTickets: () => void
  hasClaimedFreeTicket: boolean
  isClaimingFree: boolean
  handleClaimFreeTicket: () => void
  disabled?: boolean
}) {
  const {
    manaAmount,
    setManaAmount,
    numTickets,
    currentPrice,
    totalTickets,
    isSubmitting,
    handleBuyTickets,
    hasClaimedFreeTicket,
    isClaimingFree,
    handleClaimFreeTicket,
    disabled,
  } = props

  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 bg-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Enter Drawing</h3>
        <p className="text-ink-500 mt-0.5 text-sm">
          Get entries for a chance to win
        </p>
      </div>

      <Col className="gap-5 p-5">
        {/* Free Entry Button */}
        {!hasClaimedFreeTicket && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <Row className="items-center justify-between gap-4">
              <Col className="gap-1">
                <span className="text-ink-900 font-medium">
                  🎁 Free Entry Available!
                </span>
                <span className="text-ink-600 text-sm">
                  Claim your free entry to join the drawing
                </span>
              </Col>
              <Button
                color="green"
                onClick={handleClaimFreeTicket}
                loading={isClaimingFree}
                disabled={isClaimingFree || disabled}
              >
                Claim Free Entry
              </Button>
            </Row>
          </div>
        )}

        {hasClaimedFreeTicket && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
            <span className="text-sm text-green-700 dark:text-green-300">
              ✓ You've claimed your free entry!
            </span>
          </div>
        )}

        {/* Amount Input */}
        <Col className="gap-2">
          <label className="text-ink-700 text-sm font-medium">
            Gain additional entries
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
              <span>Mana per entry</span>
              <InfoTooltip
                text="Entry rates follow a bonding curve—earlier entries require less mana."
                size="sm"
              />
            </Row>
            <span className="font-medium">
              {formatMoneyWithDecimals(currentPrice)}
            </span>
          </Row>
          <Row className="text-ink-600 mt-2 items-center justify-between text-sm">
            <span>Total entries</span>
            <span>{formatEntries(totalTickets)} entries</span>
          </Row>
          <div className="border-canvas-200 mt-3 border-t pt-3">
            <Row className="items-center justify-between">
              <span className="text-ink-900 font-medium">You'll get</span>
              <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                {formatEntries(numTickets)} entries
              </span>
            </Row>
          </div>
        </div>

        {/* Enter Button */}
        <Button
          color="indigo"
          size="lg"
          onClick={handleBuyTickets}
          loading={isSubmitting}
          disabled={numTickets <= 0 || isSubmitting || disabled}
          className="w-full justify-center rounded-lg py-3 font-semibold"
        >
          Get {formatEntries(numTickets)} entries for {formatMoney(manaAmount)}
        </Button>
      </Col>
    </div>
  )
}

function SignInPrompt() {
  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 bg-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Enter Drawing</h3>
        <p className="text-ink-500 mt-0.5 text-sm">
          Get entries for a chance to win
        </p>
      </div>

      <Col className="items-center gap-4 p-6">
        <p className="text-ink-600 text-center text-sm">
          Sign in to enter the prize drawing
        </p>
        <Button color="indigo" className="w-full justify-center">
          Sign in to participate
        </Button>
      </Col>
    </div>
  )
}

function UserDistributionChart(props: {
  userStats: {
    userId: string
    totalTickets: number
    totalManaSpent: number
  }[]
  totalTickets: number
  hoveredUserId: string | null
  onHoverUser: (userId: string | null) => void
}) {
  const { userStats, totalTickets, hoveredUserId, onHoverUser } = props

  if (userStats.length === 0) {
    return (
      <div className="bg-canvas-0 border-canvas-50 flex flex-col items-center justify-center rounded-xl border p-12 shadow-sm">
        <div className="text-ink-200 mb-3 text-5xl">📊</div>
        <p className="text-ink-900 font-medium">No entries yet</p>
        <p className="text-ink-500 mt-1 text-sm">
          Be the first to participate!
        </p>
      </div>
    )
  }

  const sortedStats = sortBy(userStats, (s) => -s.totalTickets)
  const segments = sortedStats.slice(0, 12).map((stat, i) => ({
    userId: stat.userId,
    value: stat.totalTickets,
    color: COLORS[i % COLORS.length],
  }))

  const radius = 15
  const circumference = 2 * Math.PI * radius

  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 border-b px-5 py-4">
        <h3 className="text-ink-900 font-semibold">Entry Distribution</h3>
        <p className="text-ink-500 mt-0.5 text-sm">Top participants</p>
      </div>

      <div className="p-5">
        <Row className="flex-wrap items-center justify-center gap-8">
          {/* Chart */}
          <div className="relative" onMouseLeave={() => onHoverUser(null)}>
            <svg
              width="200"
              height="200"
              viewBox="0 0 40 40"
              className="-rotate-90 transform"
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
                  const isHovered = hoveredUserId === segment.userId
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
                        opacity: hoveredUserId && !isHovered ? 0.3 : 1,
                        filter: isHovered
                          ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))'
                          : 'none',
                      }}
                      onMouseEnter={() => onHoverUser(segment.userId)}
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
                entries
              </div>
            </div>
          </div>

          {/* Legend */}
          <Col className="gap-1">
            {segments.slice(0, 8).map((segment, index) => {
              const percentage = ((segment.value / totalTickets) * 100).toFixed(
                1
              )
              const isHovered = hoveredUserId === segment.userId
              return (
                <UserLegendItem
                  key={index}
                  userId={segment.userId}
                  color={segment.color}
                  percentage={percentage}
                  isHovered={isHovered}
                  onHover={() => onHoverUser(segment.userId)}
                  onLeave={() => onHoverUser(null)}
                />
              )
            })}
            {segments.length > 8 && (
              <div className="text-ink-400 px-3 py-1 text-xs">
                +{userStats.length - 8} more
              </div>
            )}
          </Col>
        </Row>
      </div>
    </div>
  )
}

function UserLegendItem(props: {
  userId: string
  color: string
  percentage: string
  isHovered: boolean
  onHover: () => void
  onLeave: () => void
}) {
  const { userId, color, percentage, isHovered, onHover, onLeave } = props
  const { data: userData } = useAPIGetter('user/by-id/:id', { id: userId })

  return (
    <Row
      className={clsx(
        'cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-150',
        isHovered ? 'bg-canvas-100 shadow-sm' : 'hover:bg-canvas-50'
      )}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <span
        className={clsx(
          'flex-shrink-0 rounded-full transition-all duration-150',
          isHovered ? 'h-3 w-3' : 'h-2.5 w-2.5'
        )}
        style={{ backgroundColor: color }}
      />
      {userData ? (
        <Row className="items-center gap-1.5">
          <Avatar
            username={userData.username}
            avatarUrl={userData.avatarUrl}
            size="2xs"
          />
          <span
            className={clsx(
              'max-w-[120px] truncate text-sm transition-all duration-150',
              isHovered ? 'text-ink-900 font-medium' : 'text-ink-700'
            )}
          >
            {userData.username}
          </span>
        </Row>
      ) : (
        <div className="bg-canvas-100 h-4 w-20 animate-pulse rounded" />
      )}
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
}

function WinnersDisplay(props: {
  winners: {
    rank: number
    label: string
    prizeUsdc: number
    ticketId: string
    user: {
      id: string
      username: string
      name: string
      avatarUrl: string
    }
  }[]
}) {
  const { winners } = props

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-6 shadow-lg dark:border-amber-800 dark:from-amber-950/30 dark:via-yellow-950/30 dark:to-orange-950/30">
      <Col className="items-center gap-6">
        <div className="text-5xl">🏆</div>
        <h2 className="text-ink-900 text-2xl font-bold">Winners!</h2>

        <Col className="w-full max-w-lg gap-3">
          {winners.map((winner) => (
            <Row
              key={winner.ticketId}
              className="items-center gap-4 rounded-xl border border-amber-200 bg-white/80 p-4 dark:border-amber-700 dark:bg-gray-900/50"
            >
              <div className="text-ink-900 w-16 text-center text-lg font-bold">
                {winner.label}
              </div>
              <Avatar
                username={winner.user.username}
                avatarUrl={winner.user.avatarUrl}
                size="md"
              />
              <Col className="min-w-0 flex-1">
                <UserLink
                  user={winner.user}
                  className="text-ink-900 font-semibold"
                />
                <span className="text-ink-500 text-sm">
                  @{winner.user.username}
                </span>
              </Col>
              <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                ${winner.prizeUsdc.toLocaleString()}
              </div>
            </Row>
          ))}
        </Col>
      </Col>
    </div>
  )
}

function SalesHistory(props: { sweepstakesNum: number; refreshKey: number }) {
  const { sweepstakesNum, refreshKey } = props
  const { data, refresh } = useAPIGetter('get-sweepstakes-sales', {
    sweepstakesNum,
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
        <p className="text-ink-500 mt-0.5 text-sm">Latest entries</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-canvas-50 bg-canvas-50 border-b">
              <th className="text-ink-500 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider">
                User
              </th>
              <th className="text-ink-500 px-5 py-3 text-right text-xs font-medium uppercase tracking-wider">
                Entries
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
            {sales.map((sale) => (
              <SaleRow key={sale.id} sale={sale} />
            ))}
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
    numTickets: number
    manaSpent: number
    isFree: boolean
    createdTime: number
  }
}) {
  const { sale } = props
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
      <td className="text-ink-900 px-5 py-4 text-right text-sm font-medium tabular-nums">
        {formatEntries(sale.numTickets)}
        {sale.isFree && (
          <span className="ml-1 text-xs text-green-600 dark:text-green-400">
            (free)
          </span>
        )}
      </td>
      <td className="text-ink-600 px-5 py-4 text-right text-sm tabular-nums">
        {sale.isFree ? 'Free' : formatMoney(sale.manaSpent)}
      </td>
      <td className="text-ink-400 px-5 py-4 text-right text-sm">
        <RelativeTimestamp time={sale.createdTime} />
      </td>
    </tr>
  )
}

function ProvablyFairBanner(props: {
  nonceHash: string
  nonce?: string
  hasWinners: boolean
}) {
  const { nonceHash, nonce, hasWinners } = props
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Row className="items-center justify-center">
        <button
          onClick={() => setIsModalOpen(true)}
          className="dark:from-indigo-400/15 dark:via-purple-400/15 dark:to-pink-400/15 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 px-4 py-2 ring-1 ring-indigo-500/20 transition-all hover:ring-indigo-500/40 dark:ring-indigo-400/25 dark:hover:ring-indigo-400/40"
        >
          <span className="text-base">⚖️</span>
          <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-sm font-semibold text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
            Provably fair
          </span>
        </button>
      </Row>

      <Modal open={isModalOpen} setOpen={setIsModalOpen} size="md">
        <Col className={clsx(MODAL_CLASS, 'gap-4')}>
          <Row className="items-center gap-3">
            <span className="text-2xl">⚖️</span>
            <h2 className="text-ink-900 text-xl font-bold">Provably Fair</h2>
          </Row>

          <p className="text-ink-700 text-sm leading-relaxed">
            Before the drawing, we publish a hash of a secret nonce. When it's
            time to pick winners, we combine the nonce with the timestamps of
            the last 10 entries to generate random numbers that determine the
            winning entries. After the drawing, we reveal the nonce so you can
            verify the results weren't manipulated.
          </p>

          <Col className="bg-canvas-50 gap-3 rounded-lg p-4">
            <Col className="gap-1">
              <span className="text-ink-600 text-sm font-medium">
                Nonce Hash (MD5)
              </span>
              <code className="bg-canvas-100 text-ink-900 break-all rounded px-2 py-1 font-mono text-xs">
                {nonceHash}
              </code>
            </Col>

            {hasWinners && nonce && (
              <Col className="gap-1">
                <span className="text-ink-600 text-sm font-medium">
                  Revealed Nonce
                </span>
                <code className="bg-canvas-100 text-ink-900 break-all rounded px-2 py-1 font-mono text-xs">
                  {nonce}
                </code>
              </Col>
            )}
          </Col>

          {hasWinners && nonce ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
              <p className="text-sm text-green-800 dark:text-green-300">
                ✓ Winners have been selected. You can verify by computing{' '}
                <code className="rounded bg-green-100 px-1 dark:bg-green-900/50">
                  MD5(nonce)
                </code>{' '}
                and confirming it matches the hash above.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                ⏳ Record the hash above. After the drawing, the full nonce will
                be revealed so you can verify the results.
              </p>
            </div>
          )}
        </Col>
      </Modal>
    </>
  )
}
