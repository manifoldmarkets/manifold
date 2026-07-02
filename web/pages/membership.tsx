import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { FaStar } from 'react-icons/fa'
import { DAY_MS } from 'common/util/time'
import { MAX_LOAN_NET_WORTH_PERCENT } from 'common/loans'
import { ENV_CONFIG } from 'common/envs/constants'
import {
  REFERRAL_AMOUNT,
  REFERRAL_BET_BONUS,
  REFERRAL_VERIFY_BONUS,
} from 'common/economy'
import { shortFormatNumber } from 'common/util/format'
import {
  SUPPORTER_TIERS,
  SUPPORTER_BENEFITS,
  SupporterTier,
  EffectiveTier,
  EFFECTIVE_TIER_LABELS,
  TIER_BENEFITS,
  getUserSupporterTier,
  getSupporterEntitlement,
} from 'common/supporter-config'
import { getEffectiveTier } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { Avatar } from 'web/components/widgets/avatar'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Modal } from 'web/components/layout/modal'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { useUser } from 'web/hooks/use-user'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { api } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import {
  TierBadge,
  BenefitsTable,
  TierSelector,
  SubscribeButton,
  PurchaseConfirmation,
  TIER_ITEMS,
} from 'web/components/shop/supporter'
import { VerifyPhoneNumberBanner } from 'web/components/user/verify-phone-number-banner'
import { SPEND_MANA_ENABLED } from 'web/components/nav/sidebar'
import Custom404 from 'web/pages/404'

export default function SupporterPage() {
  const user = useUser()
  const isAdminOrMod = useAdminOrMod()

  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [purchasedTier, setPurchasedTier] = useState<SupporterTier | null>(null)
  const [confirmingPurchase, setConfirmingPurchase] =
    useState<SupporterTier | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [hoveredTier, setHoveredTier] = useState<SupporterTier | null>(null)
  const [selectedTier, setSelectedTier] = useState<SupporterTier>('plus')

  // Honor ?tier= query param (e.g. when navigating from the shop card)
  const router = useRouter()
  useEffect(() => {
    const queryTier = router.query.tier
    if (
      typeof queryTier === 'string' &&
      (queryTier === 'basic' || queryTier === 'plus' || queryTier === 'premium')
    ) {
      setSelectedTier(queryTier)
    }
  }, [router.query.tier])

  // Get current supporter status and portfolio
  const portfolio = useCurrentPortfolio(user?.id)
  const userNetWorth = portfolio
    ? portfolio.balance + portfolio.investmentValue
    : user?.balance

  const currentTier = getUserSupporterTier(user?.entitlements)
  const currentEntitlement = getSupporterEntitlement(user?.entitlements)
  const isSupporter = currentTier !== null

  const daysRemaining = currentEntitlement?.expiresTime
    ? Math.max(
        0,
        Math.ceil((currentEntitlement.expiresTime - Date.now()) / DAY_MS)
      )
    : 0
  const renewalDate = currentEntitlement?.expiresTime
    ? new Date(currentEntitlement.expiresTime).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null

  const handlePurchase = async (tier: SupporterTier) => {
    if (!user) return
    const item = TIER_ITEMS[tier]
    setPurchasing(item.id)
    try {
      await api('shop-purchase', { itemId: item.id })
      setPurchasedTier(tier)
      setShowCelebration(true)
      toast.success('Thank you for your support!')
    } catch (e: any) {
      toast.error(e.message || 'Failed to purchase')
    } finally {
      setPurchasing(null)
    }
  }

  const handleCancelSubscription = async () => {
    setCancelling(true)
    try {
      await api('shop-cancel-subscription', {})
      toast.success(
        'Subscription cancelled. Your membership will remain active until the end of the current period.'
      )
      setConfirmingCancel(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to cancel subscription')
    } finally {
      setCancelling(false)
    }
  }

  const effectiveBalance = user?.balance ?? 0
  const isAutoRenewing = currentEntitlement?.autoRenew ?? false

  // Active tier for highlighting (hovered or selected)
  const activeTier = hoveredTier ?? selectedTier

  // Gate access after all hooks run (react-hooks/rules-of-hooks): hooks must be
  // called unconditionally on every render. Admins bypass the feature flag so
  // they can test the page while it's behind SPEND_MANA_ENABLED.
  if (!SPEND_MANA_ENABLED && !isAdminOrMod) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="supporter page" className="p-3">
      <SEO
        title="Manifold Membership"
        description="Unlock premium benefits with Manifold Plus, Pro, or Premium"
        url="/membership"
      />

      {showCelebration && (
        <FullscreenConfetti
          numberOfPieces={500}
          colors={['#f59e0b', '#fbbf24', '#fcd34d', '#6366f1', '#8b5cf6']}
        />
      )}

      {/* No overflow-x clipping here: it hard-cuts the tier cards' glow
          (a box-shadow) at the column edge. A box-shadow never adds to
          scrollable width, so letting it bleed can't cause a horizontal
          scrollbar. Wide *content* is guarded elsewhere — the hero truncates
          via min-w-0, BenefitsTable has its own overflow-x-auto — and min-w-0
          here keeps this Col from forcing the page wider. */}
      <Col className="mx-auto w-full min-w-0 max-w-3xl gap-6">
        {/* Hero Section */}
        <div className="border-ink-200 bg-canvas-0 min-w-0 rounded-xl border p-4">
          <Row className="min-w-0 items-center justify-between gap-4">
            {/* Left: Avatar + Name + Badge (changes on hover/select) */}
            <Row className="min-w-0 flex-1 items-center gap-3">
              <Avatar
                username={user?.username}
                avatarUrl={user?.avatarUrl}
                size="lg"
                noLink
                entitlements={user?.entitlements}
                displayContext="shop"
              />
              <Col className="min-w-0 flex-1 gap-0.5">
                <Row className="min-w-0 items-center gap-2">
                  <span className="truncate text-lg font-bold">
                    {user?.name ?? 'You'}
                  </span>
                  {/* Show hovered tier star, or current tier star */}
                  <span className="relative inline-flex">
                    <FaStar
                      className={clsx(
                        'h-4 w-4 transition-colors duration-150',
                        (hoveredTier ?? currentTier ?? activeTier) ===
                          'basic' && 'text-gray-400',
                        (hoveredTier ?? currentTier ?? activeTier) === 'plus' &&
                          'text-indigo-500',
                        (hoveredTier ?? currentTier ?? activeTier) ===
                          'premium' && 'text-amber-500'
                      )}
                    />
                    {(hoveredTier ?? currentTier ?? activeTier) ===
                      'premium' && (
                      <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-[1px]" />
                    )}
                  </span>
                </Row>
                {/* Show hovered tier text, or current tier text */}
                <span
                  className={clsx(
                    'text-sm font-medium transition-colors duration-150',
                    SUPPORTER_TIERS[hoveredTier ?? currentTier ?? activeTier]
                      .textColor
                  )}
                >
                  Manifold{' '}
                  {
                    SUPPORTER_TIERS[hoveredTier ?? currentTier ?? activeTier]
                      .name
                  }
                </span>
                {currentEntitlement?.grantedTime && (
                  <span className="text-ink-400 text-xs">
                    Member since{' '}
                    {new Date(
                      currentEntitlement.grantedTime
                    ).toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </Col>
            </Row>

            {/* Right: Renewal/expiry info (for supporters) or tagline (for non-supporters) */}
            {isSupporter && renewalDate ? (
              <Col className="items-end gap-0.5">
                <div className="text-ink-500 text-xs">
                  {isAutoRenewing ? 'Renews' : 'Expires'}
                </div>
                <span
                  className={clsx(
                    'text-lg font-bold',
                    isAutoRenewing ? 'text-amber-600' : 'text-ink-500'
                  )}
                >
                  {renewalDate}
                </span>
              </Col>
            ) : (
              <Col className="hidden items-end gap-0.5 sm:flex">
                <span className="text-ink-600 text-sm font-medium">
                  Support Manifold
                </span>
                <span className="text-ink-500 text-xs">
                  Unlock premium benefits
                </span>
              </Col>
            )}
          </Row>
        </div>

        {/* Horizontal Tier Selector */}
        <TierSelector
          currentTier={currentTier}
          selectedTier={selectedTier}
          hoveredTier={hoveredTier}
          onSelect={setSelectedTier}
          onHover={setHoveredTier}
          onHoverEnd={() => setHoveredTier(null)}
          effectiveBalance={effectiveBalance}
          variant="page"
        />

        {/* Subscribe/Upgrade Button */}
        {activeTier && (
          <SubscribeButton
            tier={activeTier}
            currentTier={currentTier}
            effectiveBalance={effectiveBalance}
            loading={purchasing === TIER_ITEMS[activeTier].id || cancelling}
            disabled={!user || !!purchasing || cancelling}
            onClick={() => setConfirmingPurchase(activeTier)}
            onCancelClick={() => setConfirmingCancel(true)}
            entitlements={user?.entitlements}
            currentExpiresTime={currentEntitlement?.expiresTime}
            isAutoRenewing={isAutoRenewing}
          />
        )}

        {/* Self-hides for verified/grandfathered/ineligible users.
            Non-dismissible + compact: positioned between subscribe button and
            benefits comparison so the verify path stays in view as a free
            alternative to the paid tiers above. */}
        {user && (
          <VerifyPhoneNumberBanner user={user} dismissible={false} compact />
        )}

        {/* Benefits Comparison Table with Column Highlight */}
        <BenefitsTable
          currentTier={currentTier}
          activeTier={activeTier}
          effectiveTier={
            user && !isSupporter
              ? user.bonusEligibility === 'verified' ||
                user.bonusEligibility === 'grandfathered'
                ? 'verified'
                : 'unverified'
              : undefined
          }
        />

        {/* Monthly Value Breakdown */}
        <MonthlyValueBreakdown
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
          userNetWorth={userNetWorth}
          userEffectiveTier={user ? getEffectiveTier(user) : undefined}
        />
      </Col>

      {/* Purchase Confirmation Modal */}
      <Modal
        open={!!confirmingPurchase}
        setOpen={(open) => !open && setConfirmingPurchase(null)}
      >
        {confirmingPurchase && (
          <PurchaseConfirmation
            tier={confirmingPurchase}
            currentTier={currentTier}
            daysRemaining={daysRemaining}
            currentExpiresTime={currentEntitlement?.expiresTime}
            loading={purchasing === TIER_ITEMS[confirmingPurchase].id}
            onConfirm={() => {
              handlePurchase(confirmingPurchase)
              setConfirmingPurchase(null)
            }}
            onCancel={() => setConfirmingPurchase(null)}
          />
        )}
      </Modal>

      {/* Celebration Modal */}
      <Modal open={showCelebration} setOpen={setShowCelebration}>
        <Col className="bg-canvas-0 max-w-md rounded-xl p-8 text-center">
          <div className="mb-4 text-5xl">🎉</div>
          <h2 className="mb-6 text-2xl font-bold">
            You're now a{' '}
            {purchasedTier && (
              <>
                <TierBadge
                  tier={purchasedTier}
                  animate={purchasedTier === 'premium'}
                />{' '}
                Manifold {SUPPORTER_TIERS[purchasedTier].name}
              </>
            )}{' '}
            member!
          </h2>

          <Col className="mb-6 gap-2 text-left">
            {purchasedTier && (
              <>
                <BenefitRow
                  icon="🎯"
                  label={`${SUPPORTER_BENEFITS[purchasedTier].questMultiplier}x quest rewards`}
                />
                {SUPPORTER_BENEFITS[purchasedTier].shopDiscount > 0 && (
                  <BenefitRow
                    icon="💎"
                    label={`${Math.round(
                      SUPPORTER_BENEFITS[purchasedTier].shopDiscount * 100
                    )}% off shop items`}
                  />
                )}
                {SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes > 1 && (
                  <BenefitRow
                    icon="❄️"
                    label={`${SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes} max streak freezes`}
                  />
                )}
                {SUPPORTER_BENEFITS[purchasedTier].freeLoanRate > 0.01 && (
                  <BenefitRow
                    icon="💰"
                    label={`${Math.round(
                      SUPPORTER_BENEFITS[purchasedTier].freeLoanRate * 100
                    )}% daily free loans`}
                  />
                )}
                {SUPPORTER_BENEFITS[purchasedTier].marginLoanAccess && (
                  <BenefitRow
                    icon="📈"
                    label={`${
                      SUPPORTER_BENEFITS[purchasedTier].maxLoanNetWorthPercent +
                      1
                    }x leverage boost`}
                  />
                )}
              </>
            )}
          </Col>

          <Button color="amber" onClick={() => setShowCelebration(false)}>
            Continue to Manifold
          </Button>
        </Col>
      </Modal>

      {/* Cancel Subscription Confirmation Modal */}
      <Modal open={confirmingCancel} setOpen={setConfirmingCancel}>
        <Col className="bg-canvas-0 max-w-md rounded-xl p-6">
          <h2 className="mb-2 text-xl font-bold">Cancel Subscription?</h2>
          <p className="text-ink-600 mb-4">
            Your membership will remain active until{' '}
            <span className="font-semibold">
              {currentEntitlement?.expiresTime
                ? new Date(currentEntitlement.expiresTime).toLocaleDateString()
                : 'the end of the current period'}
            </span>
            , but will not automatically renew.
          </p>
          <p className="text-ink-500 mb-6 text-sm">
            You can resubscribe at any time to continue enjoying your benefits.
          </p>
          <Row className="justify-end gap-3">
            <Button
              color="gray-outline"
              onClick={() => setConfirmingCancel(false)}
              disabled={cancelling}
            >
              Keep Subscription
            </Button>
            <Button
              color="red"
              onClick={handleCancelSubscription}
              loading={cancelling}
            >
              Cancel Subscription
            </Button>
          </Row>
        </Col>
      </Modal>
    </Page>
  )
}

// BenefitRow helper for celebration modal
function BenefitRow({ icon, label }: { icon: string; label: string }) {
  return (
    <Row className="items-center gap-2">
      <span>{icon}</span>
      <span>{label}</span>
    </Row>
  )
}

// Subscriber-tier shorthand used as default subscriber comparison target.
const SUBSCRIBER_TIERS = new Set<EffectiveTier>(['basic', 'plus', 'premium'])

// Baseline monthly mana a fully-engaged verified user earns from quests/streak.
// Used to derive deltas for unverified (negative) and subscriber tiers (positive).
const VERIFIED_BASELINE_STREAK = 750
const VERIFIED_BASELINE_SHARES = 150
const VERIFIED_BASELINE_MARKETS = 400
const VERIFIED_BASELINE_TOTAL =
  VERIFIED_BASELINE_STREAK +
  VERIFIED_BASELINE_SHARES +
  VERIFIED_BASELINE_MARKETS

// Monthly value breakdown: cost vs benefit per tier, including the unverified
// "opportunity cost" framing and the verified free-baseline framing.
function MonthlyValueBreakdown({
  selectedTier,
  onSelectTier,
  userNetWorth,
  userEffectiveTier,
}: {
  selectedTier: SupporterTier
  onSelectTier: (tier: SupporterTier) => void
  userNetWorth?: number
  userEffectiveTier?: EffectiveTier
}) {
  const [referralsPerMonth, setReferralsPerMonth] = useState(0)
  // Comparator tier defaults to the user's actual tier so the page opens to
  // "this is what you're getting today." Independent from the purchase
  // selector (which only deals with buyable subscriber tiers).
  const [comparatorTier, setComparatorTier] = useState<EffectiveTier>(
    userEffectiveTier ?? selectedTier
  )

  const isSubscriberTier = SUBSCRIBER_TIERS.has(comparatorTier)
  const multipliers = TIER_BENEFITS[comparatorTier]
  const mult = multipliers.questMultiplier
  const refMult = multipliers.referralMultiplier
  const cost = isSubscriberTier
    ? SUPPORTER_TIERS[comparatorTier as SupporterTier].price
    : 0

  // Per-category mana with this tier's multiplier applied.
  const streakWithMult = Math.round(VERIFIED_BASELINE_STREAK * mult)
  const sharesWithMult = Math.round(VERIFIED_BASELINE_SHARES * mult)
  const marketsWithMult = Math.round(VERIFIED_BASELINE_MARKETS * mult)
  const totalQuestMana = streakWithMult + sharesWithMult + marketsWithMult

  // Delta vs the verified baseline (1x). Negative for unverified, positive
  // for subscribers, zero for verified.
  const bonusMana = totalQuestMana - VERIFIED_BASELINE_TOTAL

  // Referral mana at this tier (0 for unverified — anti-farming).
  const referralAtTier = Math.round(
    REFERRAL_AMOUNT * referralsPerMonth * refMult
  )
  // The two-part split at this tier, for the referrals tooltip. Sums to the
  // per-referral payout, so it stays consistent with the row's total.
  const referralBetBonusAtTier = Math.round(REFERRAL_BET_BONUS * refMult)
  const referralVerifyBonusAtTier = Math.round(REFERRAL_VERIFY_BONUS * refMult)
  // Delta vs verified referral payout.
  const referralBonus = Math.round(
    REFERRAL_AMOUNT * referralsPerMonth * (refMult - 1)
  )

  const netVsVerified = bonusMana + referralBonus - cost

  // Leverage (subscriber tiers only — non-subs report SUPPORTER_BENEFITS defaults).
  const subBenefits = isSubscriberTier
    ? SUPPORTER_BENEFITS[comparatorTier as SupporterTier]
    : null
  const extraLeverageMultiple = subBenefits
    ? subBenefits.maxLoanNetWorthPercent - MAX_LOAN_NET_WORTH_PERCENT
    : 0
  const netWorth = userNetWorth && userNetWorth > 0 ? userNetWorth : 10000
  const extraCapital = Math.round(netWorth * extraLeverageMultiple)
  const breakEvenPercent =
    extraCapital > 0 ? (Math.max(0, -netVsVerified) / extraCapital) * 100 : 0

  // Clicking a subscriber tier in the comparator also syncs the purchase
  // selector above, so the BenefitsTable highlights match.
  const handleTierClick = (tier: EffectiveTier) => {
    setComparatorTier(tier)
    if (SUBSCRIBER_TIERS.has(tier)) onSelectTier(tier as SupporterTier)
  }

  const tierButtonClass = (tier: EffectiveTier) => {
    const isActive = comparatorTier === tier
    if (!isActive) return 'text-ink-600 hover:text-ink-900'
    if (SUBSCRIBER_TIERS.has(tier)) {
      const t = SUPPORTER_TIERS[tier as SupporterTier]
      return `${t.bgColor} ${t.textColor} shadow-sm`
    }
    if (tier === 'unverified')
      return 'bg-ink-200 text-ink-700 dark:bg-ink-400 dark:text-ink-1000 shadow-sm'
    return 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200 shadow-sm'
  }

  return (
    <div className="bg-canvas-0 border-ink-200 rounded-xl border px-3 py-3 sm:p-4">
      <Row className="mb-2 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold sm:text-base">Monthly Value</h3>
        {/* Two pill groups: free tiers + subscriber tiers. On mobile they
            stack vertically (unverified/verified on top, subscribers below).
            On desktop (sm+) they sit side-by-side as one row. */}
        <div className="flex flex-col items-end gap-1 sm:flex-row">
          <Row className="bg-ink-100 dark:bg-ink-200 gap-0.5 rounded-full p-0.5">
            {(['unverified', 'verified'] as EffectiveTier[]).map((tier) => (
              <button
                key={tier}
                onClick={() => handleTierClick(tier)}
                className={clsx(
                  'rounded-full px-2 py-1 text-[11px] font-semibold transition-all sm:px-2.5 sm:text-xs',
                  tierButtonClass(tier)
                )}
              >
                {EFFECTIVE_TIER_LABELS[tier]}
              </button>
            ))}
          </Row>
          <Row className="bg-ink-100 dark:bg-ink-200 gap-0.5 rounded-full p-0.5">
            {(['basic', 'plus', 'premium'] as EffectiveTier[]).map((tier) => (
              <button
                key={tier}
                onClick={() => handleTierClick(tier)}
                className={clsx(
                  'rounded-full px-2 py-1 text-[11px] font-semibold transition-all sm:px-2.5 sm:text-xs',
                  tierButtonClass(tier)
                )}
              >
                {EFFECTIVE_TIER_LABELS[tier]}
              </button>
            ))}
          </Row>
        </div>
      </Row>
      <p className="text-ink-500 mb-2 text-xs">
        {comparatorTier === 'unverified'
          ? `0.2x rewards — every bonus comes through reduced`
          : comparatorTier === 'verified'
          ? `1x rewards — full free-tier earnings`
          : `${mult}x rewards if you predict daily, share, create questions`}
      </p>

      <Col className="gap-1 text-xs sm:text-sm">
        <Row className="justify-between">
          <span className="text-ink-600">🔥 Streak</span>
          <span className="font-medium tabular-nums">{streakWithMult}</span>
        </Row>
        <Row className="justify-between">
          <span className="text-ink-600">📤 Sharing</span>
          <span className="font-medium tabular-nums">{sharesWithMult}</span>
        </Row>
        <Row className="justify-between">
          <span className="text-ink-600">📝 Markets</span>
          <span className="font-medium tabular-nums">{marketsWithMult}</span>
        </Row>
        <Row className="items-center justify-between">
          <Row className="items-center gap-1">
            <span className="text-ink-600">🤝 Referrals</span>
            <InfoTooltip
              size="sm"
              text={`Each referral pays out in two parts — ${
                ENV_CONFIG.moneyMoniker
              }${referralBetBonusAtTier.toLocaleString()} after their first trade and ${
                ENV_CONFIG.moneyMoniker
              }${referralVerifyBonusAtTier.toLocaleString()} when they verify their identity. The multiplier is set by your tier at each payout, not when they signed up.`}
            />
            <Row className="items-center gap-0.5">
              <button
                onClick={() =>
                  setReferralsPerMonth(Math.max(0, referralsPerMonth - 1))
                }
                className="bg-ink-100 hover:bg-ink-200 dark:bg-ink-700 dark:hover:bg-ink-600 h-4 w-4 rounded text-xs font-bold sm:h-5 sm:w-5"
              >
                −
              </button>
              <span className="w-3 text-center text-xs font-medium sm:w-4">
                {referralsPerMonth}
              </span>
              <button
                onClick={() => setReferralsPerMonth(referralsPerMonth + 1)}
                className="bg-ink-100 hover:bg-ink-200 dark:bg-ink-700 dark:hover:bg-ink-600 h-4 w-4 rounded text-xs font-bold sm:h-5 sm:w-5"
              >
                +
              </button>
            </Row>
          </Row>
          <span className="font-medium tabular-nums">
            {referralsPerMonth > 0 && refMult > 0
              ? referralAtTier.toLocaleString()
              : '—'}
          </span>
        </Row>

        <div className="border-ink-200 my-1.5 border-t" />

        {comparatorTier === 'verified' ? (
          // Verified: total earnings + free, no delta math
          <>
            <Row className="justify-between">
              <span className="text-ink-600">Total earned</span>
              <span className="font-medium tabular-nums">
                {(totalQuestMana + referralAtTier).toLocaleString()}
              </span>
            </Row>
            <Row className="justify-between font-semibold">
              <span>Cost</span>
              <span className="text-teal-600">Free</span>
            </Row>
          </>
        ) : comparatorTier === 'unverified' ? (
          // Unverified: opportunity cost vs verified baseline
          <>
            <Row className="justify-between">
              <span className="text-ink-600">Earning at 0.2x</span>
              <span className="font-medium tabular-nums">
                {(totalQuestMana + referralAtTier).toLocaleString()}
              </span>
            </Row>
            <Row className="justify-between font-semibold">
              <span>Missing vs verified</span>
              <span className="text-scarlet-500 tabular-nums">
                {Math.abs(bonusMana + referralBonus).toLocaleString()}/mo
              </span>
            </Row>
          </>
        ) : (
          // Subscriber tier: extra over verified, cost, net
          <>
            <Row className="justify-between">
              <span className="text-ink-600">Extra from {mult}x</span>
              <span className="font-medium text-teal-600">
                +{(bonusMana + referralBonus).toLocaleString()}
              </span>
            </Row>
            <Row className="justify-between">
              <span className="text-ink-600">Cost</span>
              <span className="text-scarlet-500 font-medium">
                −{cost.toLocaleString()}
              </span>
            </Row>
            <Row className="justify-between font-semibold">
              <span>Net</span>
              <span
                className={
                  netVsVerified >= 0 ? 'text-teal-600' : 'text-ink-600'
                }
              >
                {netVsVerified >= 0 ? '+' : ''}
                {netVsVerified.toLocaleString()}/mo
              </span>
            </Row>
          </>
        )}

        {extraLeverageMultiple > 0 && (
          <>
            <div className="border-ink-200 my-1.5 border-t" />
            <Row className="justify-between text-xs">
              <span className="text-ink-500 font-medium uppercase">
                Extra leverage
              </span>
              <span className="text-ink-500">
                {ENV_CONFIG.moneyMoniker}
                {shortFormatNumber(netWorth)} × {extraLeverageMultiple}x
              </span>
            </Row>
            {netVsVerified < 0 && (
              <Row className="justify-between text-xs">
                <span className="text-ink-600">Break-even</span>
                <span className="font-medium text-amber-600">
                  {breakEvenPercent.toFixed(2)}%/mo
                </span>
              </Row>
            )}
          </>
        )}
      </Col>

      {comparatorTier === 'unverified' ? (
        <div className="bg-primary-100 text-primary-700 dark:bg-primary-900/60 dark:text-primary-100 mt-2 rounded px-2 py-1 text-center text-xs font-medium sm:text-sm">
          Verify (free) or subscribe to unlock the full bonus pipeline
        </div>
      ) : comparatorTier === 'verified' ? (
        <div className="mt-2 rounded bg-teal-100 px-2 py-1 text-center text-xs font-medium text-teal-700 dark:bg-teal-900/60 dark:text-teal-100 sm:text-sm">
          ✓ Full free-tier earnings — Plus adds 50%, Pro doubles, Premium
          triples
        </div>
      ) : netVsVerified >= 0 ? (
        <div className="mt-2 rounded bg-teal-100 px-2 py-1 text-center text-xs font-medium text-teal-700 dark:bg-teal-900/60 dark:text-teal-100 sm:text-sm">
          ✓ Pays for itself
          {extraLeverageMultiple > 0 && ' — extra leverage is profit!'}
        </div>
      ) : extraLeverageMultiple > 0 ? (
        <div className="mt-2 rounded bg-amber-100 px-2 py-1 text-center text-xs font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-100 sm:text-sm">
          📈 {breakEvenPercent.toFixed(1)}%/mo return to break even
        </div>
      ) : null}

      {subBenefits && (
        <p className="text-ink-400 mt-2 text-xs">
          + free loans,{' '}
          {subBenefits.shopDiscount > 0
            ? `${Math.round(subBenefits.shopDiscount * 100)}% off shop items, `
            : ''}
          badge
        </p>
      )}
    </div>
  )
}
