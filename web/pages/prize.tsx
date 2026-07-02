import {
  formatMoney,
  formatMoneyAuto,
  formatMoneyWithDecimals,
} from 'common/util/format'
import { sortBy } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { useAdmin } from 'web/hooks/use-admin'
import { api, APIError } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { SelectDropdown } from 'web/components/widgets/select-dropdown'
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
import { FaClock, FaCircleExclamation, FaGift } from 'react-icons/fa6'
import { useAccount, useConnect, useConnectors, useDisconnect } from 'wagmi'
import { isAddress } from 'viem'
import {
  CryptoProviders,
  useCryptoReady,
} from 'web/components/crypto/crypto-providers'

import {
  calculateSweepstakesTicketsFromMana,
  getCurrentSweepstakesTicketPrice,
  getRankLabel,
  getTotalPrizePool,
  getTotalWinnerCount,
  SweepstakesPrize,
} from 'common/sweepstakes'
import { canEnterPrizeDrawings } from 'common/user'
import { DisplayUser } from 'common/api/user-types'
import { VerificationRequiredModal } from 'web/components/modals/verification-required-modal'

// /prize used to run `getServerSideProps` that called pro.ip-api.com to gate
// a banner for restricted regions. That blocked every Link-driven nav until
// the external API returned — which could hang for 10+s when ip-api was
// degraded. The page is now fully static-shell + client-side data fetching,
// and the geo check moved to a `/check-sweepstakes-geo` API call that runs
// after mount. Purchase paths still validate geo server-side.

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

export default function SweepstakesPage() {
  const user = useUser()
  const isAdmin = useAdmin()
  const router = useRouter()
  // sweepstakesNum used to come from getServerSideProps; now read directly
  // from the URL on the client so the page no longer needs SSR for params.
  const sweepstakesNumRaw = router.query.sweepstakesNum
  const sweepstakesNum =
    typeof sweepstakesNumRaw === 'string'
      ? Number(sweepstakesNumRaw)
      : undefined
  const validSweepstakesNum = Number.isFinite(sweepstakesNum)
    ? sweepstakesNum
    : undefined
  // Scope the cache per drawing — useAPIGetter keys React state by
  // `overrideKey ?? path`, not by props. Without this, switching from
  // /prize/1 to /prize/2 leaves #1's payload mounted (stats, winners,
  // purchase form) until #2 resolves, which is a real mis-purchase risk
  // when the user clicks Buy in that window.
  const sweepstakesCacheKey = `get-sweepstakes-${
    validSweepstakesNum ?? 'active'
  }`
  // Gate the fetch on router.isReady so a direct nav to /prize/N doesn't
  // first fire `get-sweepstakes` with `{}` (active drawing) and then again
  // with the real sweepstakesNum once query hydrates. `isReady` is true
  // on first render for paths without dynamic params (so /prize fires
  // immediately).
  const { data, refresh } = useAPIGetter(
    'get-sweepstakes',
    validSweepstakesNum ? { sweepstakesNum: validSweepstakesNum } : {},
    undefined,
    sweepstakesCacheKey,
    router.isReady
  )
  const { data: sweepstakesListData } = useAPIGetter('get-sweepstakes-list', {})
  // Client-side geo check (replaces the old SSR call to pro.ip-api.com that
  // could hang nav for 10+s). Defaults to "not restricted" until the check
  // completes, so the page loads instantly and the banner just appears late
  // for restricted users.
  const { data: geoData } = useAPIGetter('check-sweepstakes-geo', {})
  const isLocationRestricted = geoData ? !geoData.allowed : false

  const [manaAmount, setManaAmount] = useState<number>(100)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isClaimingFree, setIsClaimingFree] = useState(false)
  const [salesRefreshKey, setSalesRefreshKey] = useState(0)
  const [isSelectingWinners, setIsSelectingWinners] = useState(false)
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [showPrizeModal, setShowPrizeModal] = useState(false)

  // Check if user needs to verify before participating
  const needsVerification = user && !canEnterPrizeDrawings(user)
  const isAdminIneligible = !!user && isAdmin

  // Promote server-side 'pending' to 'action-needed' if the user can't
  // currently complete a payout (unverified). Then pick the worst across
  // all drawings for the trigger icon, and the list of action-needed
  // drawings for the page banner.
  const effectiveStatusByDrawing = (sweepstakesListData?.sweepstakes ?? []).map(
    (s) => {
      const raw = s.userStatus ?? null
      const bumped =
        raw === 'pending' && needsVerification
          ? ('action-needed' as const)
          : raw
      return { sweepstakesNum: s.sweepstakesNum, status: bumped }
    }
  )
  const triggerStatus = getWorstStatus(
    effectiveStatusByDrawing.map((e) => e.status)
  )
  const actionNeededDrawings = effectiveStatusByDrawing.filter(
    (e) => e.status === 'action-needed'
  )

  const sweepstakes = data ? data.sweepstakes : undefined
  const userStats = data ? data.userStats : []
  const totalTickets = data ? data.totalTickets : 0
  const winners = data ? data.winners : undefined
  const blockHash = data ? data.nonce : undefined // nonce now contains Bitcoin block hash
  const hasClaimedFreeTicket = data ? data.hasClaimedFreeTicket : false
  const meetsInvestmentRequirement = data?.meetsInvestmentRequirement ?? true
  const userTotalManaInvested = data?.userTotalManaInvested ?? 0
  const minManaInvested = data?.minManaInvested ?? 1000
  const totalManaSpent = data?.totalManaSpent ?? 0
  const participantCount = data?.participantCount ?? userStats.length
  const userVoidedEntries = data?.userVoidedEntries ?? 0
  const userVoidedManaRefunded = data?.userVoidedManaRefunded ?? 0

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

  const totalPrizePool = sweepstakes ? getTotalPrizePool(sweepstakes.prizes) : 0

  const numTickets = useMemo(() => {
    if (manaAmount <= 0) return 0
    return calculateSweepstakesTicketsFromMana(
      totalTickets,
      manaAmount,
      totalPrizePool
    )
  }, [totalTickets, manaAmount, totalPrizePool])

  const currentPrice = getCurrentSweepstakesTicketPrice(
    totalTickets,
    totalPrizePool
  )
  const isClosed = sweepstakes && sweepstakes.closeTime <= Date.now()
  const hasWinners = !!(winners && winners.length > 0)

  const sweepstakesList = sweepstakesListData?.sweepstakes ?? []
  const activeSweepstakes = sweepstakesList.find(
    (s) => s.closeTime > Date.now()
  )

  const [showCreateSweepstakesModal, setShowCreateSweepstakesModal] =
    useState(false)
  const [newCloseTime, setNewCloseTime] = useState('')
  const [prizeAmounts, setPrizeAmounts] = useState<Array<string>>(['1000'])
  const [isCreatingSweepstakes, setIsCreatingSweepstakes] = useState(false)

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

  const handleCreateSweepstakes = async () => {
    if (isCreatingSweepstakes) return
    const closeTimestamp = Date.parse(newCloseTime)
    if (!Number.isFinite(closeTimestamp)) {
      toast.error('Please enter a valid close date/time')
      return
    }
    const amounts = prizeAmounts
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0)
    if (amounts.length === 0) {
      toast.error('Please enter at least one prize amount')
      return
    }
    setIsCreatingSweepstakes(true)
    try {
      await api('admin-create-sweepstakes', {
        closeTime: closeTimestamp,
        prizes: amounts.map((amountUsdc, idx) => ({
          rank: idx + 1,
          amountUsdc,
          label: getOrdinal(idx + 1),
        })),
      })
      toast.success('New drawing created!')
      setShowCreateSweepstakesModal(false)
      setPrizeAmounts(['1000'])
      setNewCloseTime('')
      refresh()
    } catch (e) {
      const msg = e instanceof APIError ? e.message : 'Failed to create drawing'
      toast.error(msg)
    } finally {
      setIsCreatingSweepstakes(false)
    }
  }

  const handleBuyTickets = async () => {
    if (!sweepstakes || numTickets <= 0) return
    setIsSubmitting(true)
    try {
      const result = await api('buy-sweepstakes-tickets', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
        maxManaSpent: manaAmount,
      })
      toast.success(
        `Gained ${formatEntries(result.numTickets)} entries for ${formatMoney(
          result.manaSpent
        )}!`
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
      const msg = e instanceof APIError ? e.message : 'Failed to gain entries'
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
    // Render the page shell immediately — header, intro, and skeleton
    // placeholders for the heavier sections. This avoids a 20-second
    // blank-page feeling while the slower API calls (get-sweepstakes
    // SUM-on-user_contract_metrics, etc.) complete in the background.
    return (
      <Page trackPageView={'prize-drawing'}>
        <SEO
          title="Manifold Prize Drawing"
          description="Win real USDC in Manifold's prize drawing. No purchase necessary."
          url="/prize"
          image="/prize-drawing-og.png"
        />
        <Col className="mx-auto w-full max-w-3xl gap-8 px-4 py-8 sm:px-6">
          <Col className="gap-4">
            <Row className="items-center gap-3">
              <FaGift className="h-8 w-8 text-teal-500" />
              <h1 className="text-ink-900 text-3xl font-bold tracking-tight">
                Manifold Prize Drawing
              </h1>
            </Row>
            <p className="text-ink-600 text-lg leading-relaxed">
              Enter the drawing for a chance to win USDC prizes! Winners receive
              real crypto payouts. No purchase necessary.
            </p>
          </Col>
          <PrizePageSkeleton />
        </Col>
      </Page>
    )
  }

  if (!sweepstakes) {
    return (
      <Page trackPageView={'prize-drawing'}>
        <SEO
          title="Manifold Prize Drawing"
          description="Win real USDC in Manifold's prize drawing. No purchase necessary."
          url="/prize"
          image="/prize-drawing-og.png"
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
          {isAdmin && (
            <Button
              color="indigo"
              onClick={() => setShowCreateSweepstakesModal(true)}
            >
              Create New Drawing
            </Button>
          )}
        </Col>
        <CreateSweepstakesModal
          open={showCreateSweepstakesModal}
          setOpen={setShowCreateSweepstakesModal}
          newCloseTime={newCloseTime}
          setNewCloseTime={setNewCloseTime}
          prizeAmounts={prizeAmounts}
          setPrizeAmounts={setPrizeAmounts}
          isCreatingSweepstakes={isCreatingSweepstakes}
          onCreate={handleCreateSweepstakes}
        />
      </Page>
    )
  }

  return (
    <Page trackPageView={'prize-drawing'}>
      <SEO
        title={
          sweepstakes.sweepstakesNum
            ? `Manifold Prize Drawing #${sweepstakes.sweepstakesNum}`
            : 'Manifold Prize Drawing'
        }
        description={`Win $${totalPrizePool.toLocaleString()} in USDC in Manifold's prize drawing. No purchase necessary.`}
        url={sweepstakesNum ? `/prize/${sweepstakes.sweepstakesNum}` : '/prize'}
        image="/prize-drawing-og.png"
      />

      <Col className="mx-auto w-full max-w-3xl gap-8 px-4 py-8 sm:px-6">
        {/* Header */}
        <Col className="gap-4">
          {/* Mobile stacks the title above the controls; sm+ is one row. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Row className="items-center gap-3">
              <FaGift className="h-8 w-8 text-teal-500" />
              <h1 className="text-ink-900 text-3xl font-bold tracking-tight">
                Manifold Prize Drawing
              </h1>
            </Row>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {sweepstakesList.length > 1 && (
                <SelectDropdown
                  aria-label="Select prize drawing"
                  value={sweepstakes.sweepstakesNum}
                  renderButtonLabel={(opt) =>
                    opt ? `Drawing #${opt.value}` : 'Select drawing'
                  }
                  buttonPrefix={
                    triggerStatus ? (
                      <UserStatusIcon status={triggerStatus} large />
                    ) : undefined
                  }
                  options={sweepstakesList.map((s) => {
                    // The server returns 'pending' for "wallet submitted,
                    // payment in flight". If the user isn't verified, that's
                    // still blocking — bump it to action-needed.
                    const effectiveStatus: EffectiveUserStatus =
                      s.userStatus === 'pending' && needsVerification
                        ? 'action-needed'
                        : s.userStatus ?? null
                    return {
                      value: s.sweepstakesNum,
                      label: (
                        <PastDrawingLabel
                          sweepstakesNum={s.sweepstakesNum}
                          totalPrizeUsd={s.totalPrizeUsd}
                          userStatus={effectiveStatus}
                        />
                      ),
                      // Big-prize rows get a row-level gold tint so the bg
                      // fills the entire option width (the inner truncate
                      // span would otherwise clip a label-level background).
                      buttonClassName:
                        s.totalPrizeUsd && s.totalPrizeUsd >= 10000
                          ? 'bg-gradient-to-r from-amber-50 to-amber-100/40 dark:from-amber-950/40 dark:to-amber-900/20'
                          : undefined,
                    }
                  })}
                  onChange={(nextNum) => {
                    if (
                      activeSweepstakes &&
                      nextNum === activeSweepstakes.sweepstakesNum
                    ) {
                      router.push('/prize')
                    } else {
                      router.push(`/prize/${nextNum}`)
                    }
                  }}
                />
              )}
              {isAdmin &&
                isClosed &&
                (!activeSweepstakes ||
                  activeSweepstakes.sweepstakesNum ===
                    sweepstakes.sweepstakesNum) && (
                  <Button
                    color="indigo"
                    size="sm"
                    onClick={() => setShowCreateSweepstakesModal(true)}
                  >
                    Create New Drawing
                  </Button>
                )}
            </div>
          </div>
          <p className="text-ink-600 text-lg leading-relaxed">
            Enter the drawing for a chance to win USDC prizes! Winners receive
            real crypto payouts. No purchase necessary.
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

        {/* Unclaimed-prize banner. Surfaces drawings where the user won but
            hasn't completed the steps to receive their prize. */}
        {actionNeededDrawings.length > 0 && (
          <UnclaimedPrizesBanner
            drawings={actionNeededDrawings}
            currentSweepstakesNum={sweepstakes?.sweepstakesNum}
            needsVerification={!!needsVerification}
            onGoToDrawing={(num) => {
              if (
                activeSweepstakes &&
                num === activeSweepstakes.sweepstakesNum
              ) {
                router.push('/prize')
              } else {
                router.push(`/prize/${num}`)
              }
            }}
          />
        )}

        {/* KYC Required Banner. KYC is a regulatory requirement for prize
            drawings — a subscription does NOT unlock entry. */}
        {!isLocationRestricted && needsVerification && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
            <Row className="items-center justify-between gap-4">
              <Col className="gap-1">
                <p className="font-semibold text-indigo-900 dark:text-indigo-200">
                  KYC identity verification is required to participate in prize
                  drawings.
                </p>
                <p className="text-sm text-indigo-800 dark:text-indigo-300">
                  This is a regulatory requirement and applies even to active
                  subscribers. Verifying takes a few minutes.
                </p>
              </Col>
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

        {/* Admin voided this user's entries (and refunded their mana). Explain
            the dropped entry count rather than silently removing them. */}
        {userVoidedEntries > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {Math.round(userVoidedEntries).toLocaleString()} of your entries
              in this drawing were voided.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {userVoidedManaRefunded > 0 && (
                <>
                  {formatMoney(userVoidedManaRefunded)} was refunded to your
                  balance.{' '}
                </>
              )}
              These entries are null and void and can&apos;t win.
            </p>
          </div>
        )}

        {!isLocationRestricted && isAdminIneligible && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-300">
              Admin accounts cannot participate in the prize drawing.
            </p>
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
                invested to participate in the prize drawing. You currently have{' '}
                <span className="font-semibold">
                  {formatMoney(userTotalManaInvested)}
                </span>{' '}
                invested.
              </p>
            </div>
          )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TotalPrizesCard
            prizes={sweepstakes.prizes}
            totalPrizePool={totalPrizePool}
            onClick={() => setShowPrizeModal(true)}
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
            participantCount={participantCount}
            myEntries={
              user
                ? userStats.find((s) => s.userId === user.id)?.totalTickets
                : undefined
            }
          />
        )}

        {/* Purchase Form */}
        {!isClosed && user && (
          <PurchaseForm
            manaAmount={manaAmount}
            setManaAmount={setManaAmount}
            numTickets={numTickets}
            currentPrice={currentPrice}
            isSubmitting={isSubmitting}
            handleBuyTickets={handleBuyTickets}
            hasClaimedFreeTicket={hasClaimedFreeTicket ?? false}
            isClaimingFree={isClaimingFree}
            handleClaimFreeTicket={handleClaimFreeTicket}
            disabled={
              isLocationRestricted ||
              isAdminIneligible ||
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
            action="enter prize drawings"
          />
        )}

        {/* Prize Details Modal */}
        <PrizeDetailsModal
          open={showPrizeModal}
          setOpen={setShowPrizeModal}
          prizes={sweepstakes.prizes}
          totalPrizePool={totalPrizePool}
        />

        {!isClosed && !user && <SignInPrompt />}

        {/* Disclaimer */}
        {!isClosed && (
          <p className="text-ink-500 text-center text-sm">
            Read our{' '}
            <a
              href="https://docs.manifold.markets/prize-faq"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Prize Drawing FAQ
            </a>
            . By participating, you agree to Manifold's{' '}
            <a
              href="https://docs.manifold.markets/prize-rules"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Prize Drawing Rules
            </a>
            .
          </p>
        )}

        {/* Winners Display */}
        {isClosed && hasWinners && winners && (
          <WinnersDisplay winners={winners} />
        )}

        {/* Winner Claim Section - show if user is logged in and winners have been selected */}
        {isClosed && hasWinners && user && sweepstakes && (
          <WinnerClaimSection
            sweepstakesNum={sweepstakes.sweepstakesNum}
            userId={user.id}
          />
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
        {sweepstakes && (
          <ProvablyFairBanner
            closeTime={sweepstakes.closeTime}
            blockHash={blockHash}
            hasWinners={hasWinners}
          />
        )}

        {isAdmin && sweepstakes && (
          <AnnouncePrizeDrawingSection sweepstakes={sweepstakes} />
        )}

        <CreateSweepstakesModal
          open={showCreateSweepstakesModal}
          setOpen={setShowCreateSweepstakesModal}
          newCloseTime={newCloseTime}
          setNewCloseTime={setNewCloseTime}
          prizeAmounts={prizeAmounts}
          setPrizeAmounts={setPrizeAmounts}
          isCreatingSweepstakes={isCreatingSweepstakes}
          onCreate={handleCreateSweepstakes}
        />
      </Col>
    </Page>
  )
}

// Admin-only "announce drawing to subscribers" section. Shows a live preview
// of the notification, then a confirm-to-send button. Once-only enforcement
// is server-side (sweepstakes.announcement_sent flag); this UI just disables
// the button when announcementSent is already true.
function AnnouncePrizeDrawingSection(props: {
  sweepstakes: {
    sweepstakesNum: number
    prizes: SweepstakesPrize[]
    closeTime: number
    announcementSent: boolean
  }
}) {
  const { sweepstakes } = props
  const totalPrize = getTotalPrizePool(sweepstakes.prizes)
  const winnerCount = getTotalWinnerCount(sweepstakes.prizes)

  const title = 'New prize drawing is live'
  const audience =
    winnerCount === 1 ? 'to one winner' : `across ${winnerCount} winners`
  const body = `$${totalPrize.toLocaleString()} ${audience}.`

  const [sent, setSent] = useState(sweepstakes.announcementSent)
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const onSend = async () => {
    setSending(true)
    try {
      await api('admin-announce-prize-drawing', {
        sweepstakesNum: sweepstakes.sweepstakesNum,
      })
      setSent(true)
      setConfirming(false)
      toast.success('Announcement sent')
    } catch (err) {
      toast.error(
        err instanceof APIError ? err.message : 'Failed to send announcement'
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-ink-900 text-sm font-semibold uppercase tracking-wide">
          Admin · Announce to subscribers
        </h3>
        <span className="text-ink-500 text-xs">
          Only users opted in to <code>prize_drawings</code> notifications will
          receive this.
        </span>
      </div>

      {/* Notification preview — mimics how it'll render in users' inboxes */}
      <div className="bg-canvas-0 border-ink-200 mb-3 rounded-md border p-3 shadow-sm">
        <div className="text-ink-400 mb-1 text-xs">PREVIEW</div>
        <div className="flex gap-3">
          <div className="bg-primary-100 text-primary-700 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            M
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-ink-900 text-sm font-medium">{title}</div>
            <div className="text-ink-700 mt-0.5 text-sm">{body}</div>
            <div className="text-ink-400 mt-1 text-xs">
              from Manifold Markets
            </div>
          </div>
        </div>
      </div>

      {sent ? (
        <div className="text-ink-600 flex items-center gap-2 text-sm">
          <span className="text-green-600">✓</span>
          Announcement already sent for Drawing #{sweepstakes.sweepstakesNum}
        </div>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-700 text-sm">
            Send to all eligible users now?
          </span>
          <Button
            color="indigo"
            size="sm"
            loading={sending}
            disabled={sending}
            onClick={onSend}
          >
            Yes, send
          </Button>
          <Button
            color="gray-outline"
            size="sm"
            disabled={sending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button color="indigo" size="sm" onClick={() => setConfirming(true)}>
          Send announcement
        </Button>
      )}
    </div>
  )
}

// Placeholder shown while the heavy /prize data loads. Mimics the layout of
// the real page (totals card, stats row, chart, activity table) so the page
// doesn't jump around when data arrives. Animate-pulse gives the "loading"
// affordance without needing per-section spinners.
function PrizePageSkeleton() {
  return (
    <Col className="gap-6">
      {/* Total Prizes card */}
      <div className="bg-canvas-100 dark:bg-canvas-50 h-20 w-full animate-pulse rounded-lg" />
      {/* Time Left / Total Entries / Mana Spent stat row */}
      <Row className="gap-4">
        <div className="bg-canvas-100 dark:bg-canvas-50 h-24 flex-1 animate-pulse rounded-lg" />
        <div className="bg-canvas-100 dark:bg-canvas-50 h-24 flex-1 animate-pulse rounded-lg" />
        <div className="bg-canvas-100 dark:bg-canvas-50 h-24 flex-1 animate-pulse rounded-lg" />
      </Row>
      {/* Entry Distribution chart */}
      <div className="bg-canvas-100 dark:bg-canvas-50 h-56 w-full animate-pulse rounded-lg" />
      {/* Recent Activity */}
      <div className="bg-canvas-100 dark:bg-canvas-50 h-40 w-full animate-pulse rounded-lg" />
    </Col>
  )
}

// User-facing claim states. 'action-needed' covers both "haven't submitted
// wallet yet" and "haven't completed KYC", because both block the prize.
type EffectiveUserStatus = 'paid' | 'pending' | 'action-needed' | null

// Tiered styling for past-drawings dropdown options. Larger prizes pop
// visually so people scrolling history can spot the big ones at a glance.
// The aesthetic is restrained — most rows look default; the jackpot tier
// earns a subtle gold-tinted border + a sparkle, not a highlighter band.
function PastDrawingLabel(props: {
  sweepstakesNum: number
  totalPrizeUsd: number | undefined
  userStatus?: EffectiveUserStatus
}) {
  const { sweepstakesNum, userStatus } = props
  // Old API responses (pre-totalPrizeUsd) and the type-narrowing both need a
  // default so the dropdown never crashes if the field hasn't shipped yet.
  const totalPrizeUsd = props.totalPrizeUsd ?? 0
  const tier =
    totalPrizeUsd >= 10000
      ? 'jackpot'
      : totalPrizeUsd >= 1000
      ? 'major'
      : totalPrizeUsd >= 500
      ? 'minor'
      : 'standard'

  const priceClass = clsx(
    'shrink-0 tabular-nums',
    tier === 'jackpot' &&
      'text-sm font-semibold text-amber-700 dark:text-amber-300',
    tier === 'major' &&
      'text-sm font-semibold text-amber-700 dark:text-amber-300',
    tier === 'minor' &&
      'text-xs font-medium text-amber-700/80 dark:text-amber-400',
    tier === 'standard' && 'text-xs text-ink-400'
  )

  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span
        className={clsx(
          'flex items-center gap-1.5',
          tier === 'jackpot' && 'text-amber-900 dark:text-amber-100'
        )}
      >
        {userStatus && <UserStatusIcon status={userStatus} />}
        {tier === 'jackpot' && !userStatus && (
          <span aria-hidden className="text-amber-500 dark:text-amber-300">
            ✦
          </span>
        )}
        Drawing #{sweepstakesNum}
      </span>
      {totalPrizeUsd > 0 && (
        <span className={priceClass}>${totalPrizeUsd.toLocaleString()}</span>
      )}
    </span>
  )
}

// Small inline icon that signals per-drawing user state. Priority order
// when multiple drawings collide for the dropdown trigger is
// 'action-needed' > 'pending' > 'paid'.
function UserStatusIcon(props: {
  status: EffectiveUserStatus
  large?: boolean
}) {
  const { status, large } = props
  const size = large ? 'h-4 w-4' : 'h-3.5 w-3.5'
  if (status === 'action-needed') {
    return (
      <FaCircleExclamation
        aria-label="Action needed"
        className={clsx(size, 'text-scarlet-500 shrink-0')}
      />
    )
  }
  if (status === 'pending') {
    return (
      <FaClock
        aria-label="Payment pending"
        className={clsx(size, 'text-ink-400 shrink-0')}
      />
    )
  }
  if (status === 'paid') {
    return (
      <FaGift
        aria-label="Prize received"
        className={clsx(size, 'shrink-0 text-teal-500')}
      />
    )
  }
  return null
}

// Highest-priority status across all drawings — used by the trigger icon
// and the page banner.
function getWorstStatus(statuses: EffectiveUserStatus[]): EffectiveUserStatus {
  if (statuses.includes('action-needed')) return 'action-needed'
  if (statuses.includes('pending')) return 'pending'
  if (statuses.includes('paid')) return 'paid'
  return null
}

// Top-of-page nudge for users who have won drawings but still need to act
// (submit wallet, verify identity, etc.). Renders a single line when one
// drawing is unclaimed; a click-list when multiple.
function UnclaimedPrizesBanner(props: {
  drawings: { sweepstakesNum: number }[]
  currentSweepstakesNum: number | undefined
  needsVerification: boolean
  onGoToDrawing: (num: number) => void
}) {
  const { drawings, currentSweepstakesNum, needsVerification, onGoToDrawing } =
    props

  const verbB = needsVerification ? 'verify to claim' : 'claim'

  if (drawings.length === 1) {
    const d = drawings[0]
    const isCurrent = d.sweepstakesNum === currentSweepstakesNum
    return (
      <div className="border-scarlet-200 bg-scarlet-50 dark:border-scarlet-800 dark:bg-scarlet-950/30 flex items-center gap-3 rounded-lg border p-4">
        <FaCircleExclamation className="text-scarlet-500 h-5 w-5 shrink-0" />
        <div className="text-scarlet-800 dark:text-scarlet-200 flex-1 text-sm">
          You won Drawing #{d.sweepstakesNum} and still need to {verbB}.
        </div>
        {!isCurrent && (
          <button
            onClick={() => onGoToDrawing(d.sweepstakesNum)}
            className="text-scarlet-700 hover:text-scarlet-900 dark:text-scarlet-300 dark:hover:text-scarlet-100 shrink-0 text-sm font-medium underline"
          >
            Go to drawing →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="border-scarlet-200 bg-scarlet-50 dark:border-scarlet-800 dark:bg-scarlet-950/30 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <FaCircleExclamation className="text-scarlet-500 mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1">
          <div className="text-scarlet-800 dark:text-scarlet-200 text-sm font-medium">
            You have {drawings.length} unclaimed prizes
          </div>
          <div className="text-scarlet-700 dark:text-scarlet-300 mt-1 text-sm">
            {needsVerification
              ? 'Verify your identity to receive your USDC, then submit your wallet on each drawing.'
              : 'Submit your wallet address on each drawing to claim.'}
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {drawings.map((d) => (
              <li key={d.sweepstakesNum}>
                <button
                  onClick={() => onGoToDrawing(d.sweepstakesNum)}
                  className="text-scarlet-700 hover:text-scarlet-900 dark:text-scarlet-300 dark:hover:text-scarlet-100 border-scarlet-300 bg-canvas-0/50 dark:border-scarlet-700 dark:bg-canvas-0/10 rounded-md border px-2 py-0.5 text-xs font-medium"
                >
                  Drawing #{d.sweepstakesNum} →
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function CreateSweepstakesModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  newCloseTime: string
  setNewCloseTime: (value: string) => void
  prizeAmounts: string[]
  setPrizeAmounts: (amounts: string[]) => void
  isCreatingSweepstakes: boolean
  onCreate: () => void
}) {
  const {
    open,
    setOpen,
    newCloseTime,
    setNewCloseTime,
    prizeAmounts,
    setPrizeAmounts,
    isCreatingSweepstakes,
    onCreate,
  } = props

  return (
    <Modal open={open} setOpen={setOpen} size="md">
      <Col className={clsx(MODAL_CLASS, 'gap-5')}>
        <Col className="gap-1">
          <h3 className="text-ink-900 text-lg font-semibold">
            Create New Prize Drawing
          </h3>
          <p className="text-ink-500 text-sm">
            Set a close date/time and prize amounts.
          </p>
        </Col>

        <Col className="gap-2">
          <label className="text-ink-700 text-sm font-medium">Close time</label>
          <Input
            type="datetime-local"
            value={newCloseTime}
            onChange={(e) => setNewCloseTime(e.target.value)}
          />
        </Col>

        <Col className="gap-3">
          <label className="text-ink-700 text-sm font-medium">Prizes</label>
          <Col className="gap-2">
            {prizeAmounts.map((value, idx) => (
              <Row key={idx} className="items-center gap-2">
                <span className="text-ink-500 w-20 text-sm">
                  {getOrdinal(idx + 1)}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount in USDC"
                  value={value}
                  onChange={(e) => {
                    const next = [...prizeAmounts]
                    next[idx] = e.target.value
                    setPrizeAmounts(next)
                  }}
                />
              </Row>
            ))}
          </Col>
          <Button
            color="gray-outline"
            size="sm"
            onClick={() => setPrizeAmounts([...prizeAmounts, ''])}
          >
            + Add prize
          </Button>
        </Col>

        <Row className="justify-end gap-2">
          <Button color="gray-outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            color="indigo"
            loading={isCreatingSweepstakes}
            disabled={isCreatingSweepstakes}
            onClick={onCreate}
          >
            Create drawing
          </Button>
        </Row>
      </Col>
    </Modal>
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

function TotalPrizesCard(props: {
  prizes: SweepstakesPrize[]
  totalPrizePool: number
  onClick: () => void
}) {
  const { prizes, totalPrizePool, onClick } = props

  const firstPrize = prizes[0]

  return (
    <button
      onClick={onClick}
      className="bg-canvas-0 border-canvas-50 flex flex-col rounded-xl border p-4 text-left shadow-sm transition-all hover:shadow-md hover:ring-1 hover:ring-teal-500"
    >
      <div className="text-ink-500 text-xs font-medium uppercase tracking-wider">
        Total prizes
      </div>
      <div className="mt-1 text-xl font-bold text-teal-600 dark:text-teal-400 sm:text-2xl">
        ${totalPrizePool.toLocaleString()}
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs">
        {firstPrize && (
          <span className="text-ink-400">
            1st: ${firstPrize.amountUsdc.toLocaleString()}
          </span>
        )}
        <span className="text-primary-500">View all →</span>
      </div>
    </button>
  )
}

function PrizeDetailsModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  prizes: SweepstakesPrize[]
  totalPrizePool: number
}) {
  const { open, setOpen, prizes, totalPrizePool } = props

  // Medal/trophy styling for top 3 places
  const getPlaceStyle = (index: number) => {
    if (index === 0)
      return {
        icon: '🥇',
        bg: 'bg-gradient-to-br from-amber-100 to-yellow-200 dark:from-amber-900/40 dark:to-yellow-900/40',
        border: 'ring-2 ring-amber-400',
        text: 'text-amber-700 dark:text-amber-300',
      }
    if (index === 1)
      return {
        icon: '🥈',
        bg: 'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700/40 dark:to-slate-600/40',
        border: 'ring-2 ring-slate-400',
        text: 'text-slate-600 dark:text-slate-300',
      }
    if (index === 2)
      return {
        icon: '🥉',
        bg: 'bg-gradient-to-br from-orange-100 to-amber-200 dark:from-orange-900/40 dark:to-amber-900/40',
        border: 'ring-2 ring-orange-400',
        text: 'text-orange-700 dark:text-orange-300',
      }
    return {
      icon: '🎁',
      bg: 'bg-canvas-50',
      border: '',
      text: 'text-ink-600',
    }
  }

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS, 'gap-5')}>
        <Col className="items-center gap-1">
          <h2 className="text-ink-900 text-xl font-bold">Prize Structure</h2>
          <p className="text-ink-600 text-sm">
            Total prize pool:{' '}
            <span className="font-bold text-teal-600">
              ${totalPrizePool.toLocaleString()} USDC
            </span>
          </p>
        </Col>
        <div className="flex flex-wrap justify-center gap-4">
          {prizes.map((prize, index) => {
            const style = getPlaceStyle(index)
            return (
              <div
                key={index}
                className={clsx(
                  'min-w-[110px] rounded-xl px-5 py-4 text-center transition-transform hover:scale-105',
                  style.bg,
                  style.border
                )}
              >
                <div className="text-2xl">{style.icon}</div>
                <div className={clsx('mt-1 text-sm font-semibold', style.text)}>
                  {prize.label}
                </div>
                <div className="text-ink-900 mt-1 text-xl font-bold">
                  ${prize.amountUsdc.toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-ink-500 text-center text-xs">
          All prizes are paid in USDC. Winners will need a crypto wallet to
          receive their winnings. No purchase necessary.
        </p>
      </Col>
    </Modal>
  )
}

function PurchaseForm(props: {
  manaAmount: number
  setManaAmount: (amount: number) => void
  numTickets: number
  currentPrice: number
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
          <Row className="items-center gap-1">
            <label className="text-ink-700 text-sm font-medium">
              Gain additional entries
            </label>
            <InfoTooltip
              text={`Current rate: ${formatMoneyWithDecimals(
                currentPrice
              )} per entry. Rates follow a bonding curve—earlier entries require less mana.
              Your mana spend is fixed; the final entry count is calculated at purchase time.`}
              size="sm"
            />
          </Row>
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

        {/* Enter Button */}
        <Button
          color="indigo"
          size="lg"
          onClick={handleBuyTickets}
          loading={isSubmitting}
          disabled={numTickets <= 0 || isSubmitting || disabled}
          className="w-full justify-center rounded-lg py-3 font-semibold"
        >
          Get up to {formatEntries(numTickets)} entries for{' '}
          {formatMoney(manaAmount)}
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
        <Button
          color="indigo"
          className="w-full justify-center"
          onClick={firebaseLogin}
        >
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
  participantCount: number
  myEntries?: number
}) {
  const {
    userStats,
    totalTickets,
    hoveredUserId,
    onHoverUser,
    participantCount,
    myEntries,
  } = props

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

  // Batch-fetch the top-8 legend users in a single request instead of one
  // per row. Avoids the N+1 that previously made the chart take seconds to
  // populate on cold cache. We only fetch for the rows we actually render,
  // and skip the call entirely when there are no users (empty arrays 400
  // on the server because the query string can't be parsed).
  const legendUserIds = segments.slice(0, 8).map((s) => s.userId)
  const { data: legendUsersData } = useAPIGetter(
    'users/by-id',
    { ids: legendUserIds },
    undefined,
    undefined,
    legendUserIds.length > 0
  )
  const userById = useMemo(
    () => new Map((legendUsersData ?? []).map((u) => [u.id, u])),
    [legendUsersData]
  )

  const radius = 15
  const circumference = 2 * Math.PI * radius

  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 border-b px-5 py-4">
        <Row className="items-start justify-between">
          <div>
            <h3 className="text-ink-900 font-semibold">Entry Distribution</h3>
            <p className="text-ink-500 mt-0.5 text-sm">Top participants</p>
          </div>
          {myEntries != null && myEntries > 0 && (
            <div className="bg-primary-50 text-primary-700 rounded-full px-3 py-1 text-sm font-medium">
              You: {formatEntries(myEntries)}{' '}
              {myEntries === 1 ? 'entry' : 'entries'}
            </div>
          )}
        </Row>
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
                  user={userById.get(segment.userId)}
                  color={segment.color}
                  percentage={percentage}
                  isHovered={isHovered}
                  onHover={() => onHoverUser(segment.userId)}
                  onLeave={() => onHoverUser(null)}
                />
              )
            })}
            {participantCount > 8 && (
              <div className="text-ink-400 px-3 py-1 text-xs">
                +{participantCount - 8} more
              </div>
            )}
          </Col>
        </Row>
      </div>
    </div>
  )
}

function UserLegendItem(props: {
  user: DisplayUser | undefined
  color: string
  percentage: string
  isHovered: boolean
  onHover: () => void
  onLeave: () => void
}) {
  const {
    user: userData,
    color,
    percentage,
    isHovered,
    onHover,
    onLeave,
  } = props

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
              className="items-center gap-2 rounded-xl border border-amber-200 bg-white/80 p-3 dark:border-amber-700 dark:bg-gray-900/50 sm:gap-4 sm:p-4"
            >
              <div className="text-ink-900 w-10 shrink-0 text-center text-base font-bold sm:w-16 sm:text-lg">
                {getRankLabel(winner.rank)}
              </div>
              <Avatar
                username={winner.user.username}
                avatarUrl={winner.user.avatarUrl}
                size="md"
                className="shrink-0"
              />
              <Col className="min-w-0 flex-1">
                <UserLink
                  user={winner.user}
                  className="text-ink-900 truncate font-semibold"
                />
                <span className="text-ink-500 truncate text-sm">
                  @{winner.user.username}
                </span>
              </Col>
              <div className="shrink-0 text-base font-bold text-teal-600 dark:text-teal-400 sm:text-lg">
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

  // Batch-fetch the (deduplicated) sale user ids in one request rather than
  // one per row. With limit: 50 above, the previous N+1 fired up to 50
  // separate user/by-id calls per /prize load — the dominant N+1 on the
  // page in production. Skip when empty so we don't fire ?ids=[] (which
  // 400s on the server).
  const saleUserIds = useMemo(
    () => Array.from(new Set(sales.map((s) => s.userId))),
    [sales]
  )
  const { data: saleUsersData } = useAPIGetter(
    'users/by-id',
    { ids: saleUserIds },
    undefined,
    undefined,
    saleUserIds.length > 0
  )
  const saleUserById = useMemo(
    () => new Map((saleUsersData ?? []).map((u) => [u.id, u])),
    [saleUsersData]
  )

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
                Mana
              </th>
              <th className="text-ink-500 px-5 py-3 text-right text-xs font-medium uppercase tracking-wider">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-canvas-50 divide-y">
            {sales.map((sale) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                user={saleUserById.get(sale.userId)}
              />
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
  user: DisplayUser | undefined
}) {
  const { sale, user: userData } = props

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
        {sale.isFree ? 'Free' : formatMoneyAuto(sale.manaSpent)}
      </td>
      <td className="text-ink-400 px-5 py-4 text-right text-sm">
        <RelativeTimestamp time={sale.createdTime} />
      </td>
    </tr>
  )
}

function ProvablyFairBanner(props: {
  closeTime: number
  blockHash?: string
  hasWinners: boolean
}) {
  const { closeTime, blockHash, hasWinners } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCheckingBlock, setIsCheckingBlock] = useState(false)
  const [blockInfo, setBlockInfo] = useState<{
    height: number
    hash: string
  } | null>(null)

  const isClosed = closeTime <= Date.now()

  const handleCheckBlock = async () => {
    setIsCheckingBlock(true)
    try {
      const result = await api('check-bitcoin-block', { closeTime })
      if (result.available) {
        setBlockInfo({ height: result.blockHeight, hash: result.blockHash })
      } else {
        toast.error('Bitcoin block not yet mined. Please try again later.')
      }
    } catch (e) {
      toast.error('Failed to check Bitcoin block')
    } finally {
      setIsCheckingBlock(false)
    }
  }

  const displayHash = blockHash || blockInfo?.hash
  const displayHeight = blockInfo?.height

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

          <p className="text-ink-700 text-sm">
            Winners are determined by the first Bitcoin block mined after{' '}
            <span className="font-semibold">
              {new Date(closeTime).toLocaleString()}
            </span>
            . The block hash seeds a deterministic RNG. Verify on any block
            explorer.
          </p>

          {displayHash && (
            <Col className="bg-canvas-50 gap-2 rounded-lg p-3">
              <Row className="items-center justify-between">
                <span className="text-ink-600 text-sm font-medium">
                  Block{displayHeight ? ` #${displayHeight}` : ''}
                </span>
                <Row className="gap-2">
                  <a
                    href={`https://mempool.space/block/${displayHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 text-xs hover:underline"
                  >
                    mempool.space
                  </a>
                  <a
                    href={`https://blockstream.info/block/${displayHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 text-xs hover:underline"
                  >
                    blockstream
                  </a>
                </Row>
              </Row>
              <code className="bg-canvas-100 text-ink-900 break-all rounded px-2 py-1 font-mono text-xs">
                {displayHash}
              </code>
            </Col>
          )}

          {hasWinners && blockHash ? (
            <p className="text-sm text-green-700 dark:text-green-400">
              ✓ Winners selected using the block hash above.
            </p>
          ) : isClosed && !hasWinners ? (
            <Col className="gap-2">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                ⏳ Drawing closed. Awaiting winner selection.
              </p>
              {!displayHash && (
                <Button
                  color="indigo"
                  size="xs"
                  onClick={handleCheckBlock}
                  loading={isCheckingBlock}
                  disabled={isCheckingBlock}
                >
                  Check for Bitcoin Block
                </Button>
              )}
            </Col>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              ⏳ Awaiting close time to determine block.
            </p>
          )}
        </Col>
      </Modal>
    </>
  )
}

function WinnerClaimSection(props: { sweepstakesNum: number; userId: string }) {
  const { sweepstakesNum } = props
  const { data, refresh } = useAPIGetter('get-sweepstakes-prize-claim', {
    sweepstakesNum,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Still loading
  if (data === undefined) {
    return null
  }

  const claim = data?.claim
  const winnerInfo = data?.winnerInfo

  // Not a winner
  if (!winnerInfo) {
    return null
  }

  // Already claimed
  if (claim) {
    return (
      <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-canvas-50 border-b bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4 dark:from-teal-950/30 dark:to-cyan-950/30">
          <h3 className="text-ink-900 font-semibold">
            🎉 Congratulations! You won {getOrdinal(winnerInfo.rank)} place!
          </h3>
          <p className="text-ink-600 mt-0.5 text-sm">
            Prize: ${winnerInfo.prizeAmountUsdc} USDC
          </p>
        </div>
        <Col className="gap-4 p-5">
          {claim.walletAddress && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
              <Row className="items-center gap-2">
                <span className="text-lg">✓</span>
                <Col className="gap-1">
                  <span className="font-medium text-green-800 dark:text-green-300">
                    Claim Submitted
                  </span>
                  <span className="text-sm text-green-700 dark:text-green-400">
                    Wallet: {claim.walletAddress.slice(0, 6)}...
                    {claim.walletAddress.slice(-4)}
                  </span>
                </Col>
              </Row>
            </div>
          )}

          <Row className="items-center justify-between">
            <span className="text-ink-600 text-sm">Payment Status:</span>
            <span
              className={clsx(
                'rounded-full px-3 py-1 text-sm font-medium',
                claim.paymentStatus === 'awaiting' &&
                  'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
                claim.paymentStatus === 'sent' &&
                  'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
                claim.paymentStatus === 'rejected' &&
                  'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
                claim.paymentStatus === 'opted_out' &&
                  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
              )}
            >
              {claim.paymentStatus === 'awaiting' && '⏳ Awaiting Payment'}
              {claim.paymentStatus === 'sent' && '✓ Payment Sent'}
              {claim.paymentStatus === 'rejected' && '✗ Rejected'}
              {claim.paymentStatus === 'opted_out' && 'Opted out'}
            </span>
          </Row>

          {claim.paymentTxnHash && (
            <Row className="items-center justify-between">
              <span className="text-ink-600 text-sm">Transaction:</span>
              <a
                href={`https://etherscan.io/tx/${claim.paymentTxnHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 text-sm hover:underline"
              >
                View on Etherscan →
              </a>
            </Row>
          )}
        </Col>
      </div>
    )
  }

  // Show claim form with wallet connect
  return (
    <div className="bg-canvas-0 border-canvas-50 overflow-hidden rounded-xl border shadow-sm">
      <div className="border-canvas-50 border-b bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4 dark:from-teal-950/30 dark:to-cyan-950/30">
        <h3 className="text-ink-900 font-semibold">
          🎉 Congratulations! You won {getOrdinal(winnerInfo.rank)} place!
        </h3>
        <p className="text-ink-600 mt-0.5 text-sm">
          Prize: ${winnerInfo.prizeAmountUsdc} USDC
        </p>
      </div>
      <Col className="gap-4 p-5">
        <p className="text-ink-700 text-sm">
          Connect your Ethereum wallet to receive your prize. Make sure this is
          a wallet you control—we cannot recover funds sent to the wrong
          address.{' '}
          <span className="font-semibold">
            Your submission is final and cannot be changed. The wallet you
            choose applies only to this prize — you'll choose a wallet again for
            any future prize.
          </span>
        </p>

        <WalletClaimFormWrapper
          sweepstakesNum={sweepstakesNum}
          isSubmitting={isSubmitting}
          setIsSubmitting={setIsSubmitting}
          onSuccess={refresh}
        />

        <p className="text-ink-500 text-center text-xs">
          Prizes are paid in USDC on Ethereum mainnet. Payments are processed
          manually and may take a few days.
        </p>
      </Col>
    </div>
  )
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Wrapper component that provides the CryptoProviders context
function WalletClaimFormWrapper(props: {
  sweepstakesNum: number
  isSubmitting: boolean
  setIsSubmitting: (isSubmitting: boolean) => void
  onSuccess: () => void
}) {
  return (
    <CryptoProviders>
      <WalletClaimFormGate {...props} />
    </CryptoProviders>
  )
}

// Inner component that uses wagmi hooks (must be inside CryptoProviders)
function WalletClaimFormGate(props: {
  sweepstakesNum: number
  isSubmitting: boolean
  setIsSubmitting: (isSubmitting: boolean) => void
  onSuccess: () => void
}) {
  const cryptoReady = useCryptoReady()

  // Wait for crypto providers to be ready before rendering wagmi hooks
  if (!cryptoReady) {
    return (
      <Col className="items-center py-4">
        <LoadingIndicator />
      </Col>
    )
  }

  return <WalletClaimFormInner {...props} />
}

function WalletClaimFormInner(props: {
  sweepstakesNum: number
  isSubmitting: boolean
  setIsSubmitting: (isSubmitting: boolean) => void
  onSuccess: () => void
}) {
  const { sweepstakesNum, isSubmitting, setIsSubmitting, onSuccess } = props

  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const connectors = useConnectors()
  const hasBrowserWallet = useHasBrowserWallet(connectors)

  // Reset on auto-reconnect so the user doesn't land back on manual entry with empty state if they later disconnect.
  useEffect(() => {
    if (isConnected && showManualEntry) {
      setShowManualEntry(false)
    }
  }, [isConnected, showManualEntry])

  // Hide the generic fallback `injected` connector when no browser wallet is
  // actually present — clicking it produces a cryptic viem error. Keep any
  // EIP-6963-detected wallets (id !== 'injected') and WalletConnect.
  const availableConnectors = hasBrowserWallet
    ? connectors
    : connectors.filter((c) => c.id !== 'injected')

  const handleSubmitClaim = async () => {
    if (!address || isSubmitting) return

    setIsSubmitting(true)
    try {
      await api('claim-sweepstakes-prize', {
        sweepstakesNum,
        walletAddress: address,
      })
      toast.success('Prize claim submitted successfully!')
      onSuccess()
    } catch (e) {
      const msg = e instanceof APIError ? e.message : 'Failed to submit claim'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isConnected) {
    if (showManualEntry) {
      return (
        <ManualWalletEntry
          sweepstakesNum={sweepstakesNum}
          isSubmitting={isSubmitting}
          setIsSubmitting={setIsSubmitting}
          onSuccess={onSuccess}
          onCancel={() => setShowManualEntry(false)}
        />
      )
    }

    const friendlyConnectError = connectError
      ? getFriendlyConnectError(connectError, hasBrowserWallet)
      : null

    return (
      <>
        <Col className="gap-4">
          {!hasBrowserWallet && <NoWalletDetectedBanner />}

          <Col className="items-center gap-2">
            <Button
              color="gradient"
              size="xl"
              className="w-full"
              onClick={() => setShowWalletModal(true)}
            >
              🔗 Connect Wallet
            </Button>
            {friendlyConnectError && (
              <div className="border-scarlet-200 bg-scarlet-50 dark:border-scarlet-800 dark:bg-scarlet-950/30 w-full rounded-lg border p-3">
                <p className="text-scarlet-700 dark:text-scarlet-300 text-sm font-medium">
                  {friendlyConnectError.title}
                </p>
                {friendlyConnectError.description && (
                  <p className="text-scarlet-600 dark:text-scarlet-400 mt-1 text-sm">
                    {friendlyConnectError.description}
                  </p>
                )}
                {friendlyConnectError.showInstallLink && (
                  <a
                    href="https://metamask.io/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-scarlet-700 dark:text-scarlet-300 mt-2 inline-block text-sm font-semibold underline"
                  >
                    Install MetaMask →
                  </a>
                )}
              </div>
            )}
          </Col>

          <button
            type="button"
            onClick={() => setShowManualEntry(true)}
            className="text-scarlet-600 hover:text-scarlet-700 dark:text-scarlet-400 dark:hover:text-scarlet-300 self-center text-xs font-medium underline"
          >
            Not recommended: Add wallet address manually
          </button>
        </Col>

        {/* Wallet Selection Modal */}
        <Modal open={showWalletModal} setOpen={setShowWalletModal} size="sm">
          <Col className={clsx(MODAL_CLASS, 'gap-6')}>
            <Col className="items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500">
                <span className="text-2xl">🔗</span>
              </div>
              <h3 className="text-ink-900 text-xl font-semibold">
                Connect Wallet
              </h3>
              <p className="text-ink-500 text-center text-sm">
                Select a wallet to receive your USDC prize
              </p>
            </Col>

            {!hasBrowserWallet && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  No browser wallet detected
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  You need a wallet browser extension (like MetaMask) to receive
                  your prize. Desktop apps like OneKey won't work on their own —
                  install the browser extension too.
                </p>
                <a
                  href="https://metamask.io/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-amber-800 underline dark:text-amber-300"
                >
                  Install MetaMask →
                </a>
              </div>
            )}

            {availableConnectors.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {sortConnectors(availableConnectors).map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => {
                      connect({ connector })
                      setShowWalletModal(false)
                    }}
                    disabled={isConnecting}
                    className={clsx(
                      'bg-canvas-50 hover:bg-canvas-100 border-canvas-100 rounded-lg border px-3 py-2 text-center transition-all',
                      'hover:border-primary-300 hover:shadow-sm',
                      'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                  >
                    <span className="text-ink-900 text-sm font-medium">
                      {simplifyWalletName(connector.name)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-ink-500 text-center text-sm">
                Install a browser wallet extension to continue.
              </p>
            )}

            <p className="text-ink-400 text-center text-xs">
              By connecting, you agree to receive USDC on Ethereum mainnet
            </p>
          </Col>
        </Modal>
      </>
    )
  }

  return (
    <Col className="gap-4">
      <div className="bg-canvas-50 border-canvas-100 rounded-xl border p-4">
        <Row className="items-center justify-between">
          <Row className="items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-400 to-emerald-500">
              <span className="text-lg">✓</span>
            </div>
            <Col className="gap-0.5">
              <span className="text-ink-500 text-xs font-medium">
                Connected Wallet
              </span>
              <span className="text-ink-900 font-mono text-sm font-semibold">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </Col>
          </Row>
          <Button color="gray-outline" size="xs" onClick={() => disconnect()}>
            Change
          </Button>
        </Row>
      </div>

      <Button
        color="gradient"
        size="xl"
        className="w-full"
        onClick={handleSubmitClaim}
        loading={isSubmitting}
        disabled={isSubmitting}
      >
        🎁 Claim Prize
      </Button>
    </Col>
  )
}

type AddressValidation =
  | { kind: 'empty' }
  | { kind: 'valid'; message: string }
  | { kind: 'incomplete'; message: string }
  | { kind: 'invalid'; message: string }

function validateEthAddress(input: string): AddressValidation {
  if (input.length === 0) return { kind: 'empty' }
  if (!/^0x[a-fA-F0-9]*$/.test(input)) {
    return {
      kind: 'invalid',
      message: '❌ This is not an Ethereum wallet address',
    }
  }
  if (input.length < 42) {
    return {
      kind: 'incomplete',
      message: '⚠️ This wallet address is incomplete',
    }
  }
  if (input.length > 42) {
    return { kind: 'invalid', message: '❌ This wallet address is too long' }
  }
  // viem's default isAddress requires either all-lowercase, all-uppercase, or
  // a valid EIP-55 checksum — catches typos in mixed-case pastes.
  if (!isAddress(input)) {
    return {
      kind: 'invalid',
      message:
        '❌ This address has a checksum error — likely a typo. Double-check every character.',
    }
  }
  return {
    kind: 'valid',
    message: '✓ This is a valid Ethereum wallet address',
  }
}

function ManualWalletEntry(props: {
  sweepstakesNum: number
  isSubmitting: boolean
  setIsSubmitting: (isSubmitting: boolean) => void
  onSuccess: () => void
  onCancel: () => void
}) {
  const { sweepstakesNum, isSubmitting, setIsSubmitting, onSuccess, onCancel } =
    props

  const [address, setAddress] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const trimmed = address.trim()
  const validation = validateEthAddress(trimmed)
  const canSubmit = validation.kind === 'valid' && confirmed && !isSubmitting

  const normalize = (raw: string) => raw.trim().replace(/^0X/, '0x')

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setAddress(normalize(text))
    } catch {
      toast.error('Could not read clipboard. Please paste manually.')
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      await api('claim-sweepstakes-prize', {
        sweepstakesNum,
        walletAddress: trimmed,
      })
      toast.success('Prize claim submitted successfully!')
      onSuccess()
    } catch (e) {
      const msg = e instanceof APIError ? e.message : 'Failed to submit claim'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Col className="gap-4">
      <div className="border-scarlet-200 bg-scarlet-50 dark:border-scarlet-800 dark:bg-scarlet-950/30 rounded-lg border p-3">
        <p className="text-scarlet-700 dark:text-scarlet-300 text-sm font-semibold">
          ⚠️ Not recommended
        </p>
        <p className="text-scarlet-600 dark:text-scarlet-400 mt-1 text-xs">
          Manually entering a wallet address is risky. If the address is wrong
          or not a wallet you control, your prize will be lost forever and
          cannot be recovered. Connect a browser wallet whenever possible.
        </p>
        <p className="text-scarlet-700 dark:text-scarlet-300 mt-2 text-xs font-semibold">
          The address you submit is your first and final answer for this prize —
          it cannot be edited after you click Claim Prize. Double-check every
          character. (Future prizes are claimed separately.)
        </p>
      </div>

      <Col className="gap-1.5">
        <label
          htmlFor="manual-wallet-address"
          className="text-ink-700 text-sm font-medium"
        >
          Ethereum wallet address
        </label>
        <Row className="gap-2">
          <Input
            id="manual-wallet-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(normalize(e.target.value))}
            placeholder="0x..."
            className="flex-1 font-mono"
            autoComplete="off"
            spellCheck={false}
            error={validation.kind === 'invalid'}
          />
          <Button
            color="gray-outline"
            size="md"
            onClick={handlePaste}
            disabled={isSubmitting}
          >
            Paste
          </Button>
        </Row>
        {validation.kind !== 'empty' && (
          <p
            className={clsx(
              'text-xs',
              validation.kind === 'valid' &&
                'text-green-700 dark:text-green-400',
              validation.kind === 'incomplete' &&
                'text-amber-700 dark:text-amber-400',
              validation.kind === 'invalid' &&
                'text-scarlet-700 dark:text-scarlet-300'
            )}
          >
            {validation.message}
          </p>
        )}
      </Col>

      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1"
          disabled={isSubmitting}
        />
        <span className="text-ink-700 text-sm">
          I understand that if this is not my wallet, my prize will be lost and
          cannot be recovered.
        </span>
      </label>

      <Row className="gap-2">
        <Button
          color="gray-outline"
          size="lg"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          color="gradient"
          size="lg"
          className="flex-[2]"
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={!canSubmit}
        >
          🎁 Claim Prize
        </Button>
      </Row>
    </Col>
  )
}

// Detect whether any real browser-extension wallet is installed. Wagmi's
// generic `injected()` connector is always present, so we look for either an
// EIP-6963-detected connector (id !== 'injected') or `window.ethereum`.
function useHasBrowserWallet(connectors: readonly { id: string }[]): boolean {
  const [hasWindowEth, setHasWindowEth] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasWindowEth(!!(window as any).ethereum)
    }
  }, [])
  const hasDetectedWallet = connectors.some(
    (c) => c.id !== 'injected' && c.id !== 'walletConnect'
  )
  return hasDetectedWallet || hasWindowEth
}

// Shown above the Connect Wallet button when no browser-extension wallet is
// detected. Instructs users to install MetaMask.
function NoWalletDetectedBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <Col className="gap-2">
        <Row className="items-center gap-2">
          <span className="text-lg">🦊</span>
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            You'll need a crypto wallet to claim
          </span>
        </Row>
        <p className="text-sm text-amber-800 dark:text-amber-300">
          We didn't detect a wallet browser extension. Install MetaMask (or
          another Ethereum wallet extension) in your browser, then come back and
          click Connect Wallet.
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Note: desktop-only apps like OneKey's .exe don't work here unless you
          also install their browser extension.
        </p>
        <Row className="mt-1 flex-wrap gap-3">
          <a
            href="https://metamask.io/download"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Install MetaMask →
          </a>
          <a
            href="https://ethereum.org/en/wallets/find-wallet/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline dark:text-amber-300"
          >
            Browse other wallets
          </a>
        </Row>
      </Col>
    </div>
  )
}

// Translate cryptic viem/wagmi connection errors into friendly, actionable
// guidance for end users.
function getFriendlyConnectError(
  error: Error,
  hasBrowserWallet: boolean
): {
  title: string
  description?: string
  showInstallLink: boolean
} {
  const msg = error.message?.toLowerCase() ?? ''

  if (!hasBrowserWallet) {
    return {
      title: "We couldn't connect to a wallet",
      description:
        'No browser wallet extension was detected. Install MetaMask and refresh this page.',
      showInstallLink: true,
    }
  }

  if (msg.includes('user rejected') || msg.includes('user denied')) {
    return {
      title: 'Connection cancelled',
      description:
        'You declined the connection in your wallet. Click Connect Wallet and approve the request to continue.',
      showInstallLink: false,
    }
  }

  if (msg.includes('no provider') || msg.includes('not found')) {
    return {
      title: 'No wallet provider found',
      description:
        "Your browser doesn't have a wallet extension installed or enabled.",
      showInstallLink: true,
    }
  }

  return {
    title: 'Failed to connect',
    description: error.message,
    showInstallLink: false,
  }
}

// Helper to simplify wallet names
function simplifyWalletName(name: string): string {
  return name
    .replace(/\s*Wallet\s*/gi, '')
    .replace(/\s*Account\s*/gi, '')
    .trim()
}

// Sort connectors with MetaMask first
function sortConnectors<T extends { id: string; name: string }>(
  connectors: readonly T[]
): T[] {
  return [...connectors].sort((a, b) => {
    const aIsMetaMask =
      a.id === 'metaMask' || a.name.toLowerCase().includes('metamask')
    const bIsMetaMask =
      b.id === 'metaMask' || b.name.toLowerCase().includes('metamask')
    if (aIsMetaMask && !bIsMetaMask) return -1
    if (!aIsMetaMask && bIsMetaMask) return 1
    return 0
  })
}
