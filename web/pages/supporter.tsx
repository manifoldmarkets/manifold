import { useState } from 'react'
import clsx from 'clsx'
import { FaStar } from 'react-icons/fa'
import { DAY_MS } from 'common/util/time'
import { ENV_CONFIG } from 'common/envs/constants'
import { REFERRAL_AMOUNT } from 'common/economy'
import { shortFormatNumber } from 'common/util/format'
import {
  SUPPORTER_TIERS,
  SUPPORTER_BENEFITS,
  SupporterTier,
  getUserSupporterTier,
  getSupporterEntitlement,
} from 'common/supporter-config'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { Avatar } from 'web/components/widgets/avatar'
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
import { SPEND_MANA_ENABLED } from 'web/components/nav/sidebar'
import Custom404 from 'web/pages/404'

export default function SupporterPage() {
  const user = useUser()
  const isAdminOrMod = useAdminOrMod()

  // Allow admins to access supporter page for testing even when feature flag is off
  if (!SPEND_MANA_ENABLED && !isAdminOrMod) {
    return <Custom404 />
  }
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [purchasedTier, setPurchasedTier] = useState<SupporterTier | null>(null)
  const [confirmingPurchase, setConfirmingPurchase] =
    useState<SupporterTier | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [hoveredTier, setHoveredTier] = useState<SupporterTier | null>(null)
  const [selectedTier, setSelectedTier] = useState<SupporterTier>('plus')

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

  return (
    <Page trackPageView="supporter page" className="p-3">
      <SEO
        title="Manifold Membership"
        description="Unlock premium benefits with Manifold Plus, Pro, or Premium"
        url="/supporter"
      />

      {showCelebration && (
        <FullscreenConfetti
          numberOfPieces={500}
          colors={['#f59e0b', '#fbbf24', '#fcd34d', '#6366f1', '#8b5cf6']}
        />
      )}

      <Col className="mx-auto max-w-3xl gap-6">
        {/* Hero Section */}
        <div className="border-ink-200 bg-canvas-0 rounded-xl border p-4">
          <Row className="items-center justify-between gap-4">
            {/* Left: Avatar + Name + Badge (changes on hover/select) */}
            <Row className="items-center gap-3">
              <Avatar
                username={user?.username}
                avatarUrl={user?.avatarUrl}
                size="lg"
                noLink
                entitlements={user?.entitlements}
                displayContext="shop"
              />
              <Col className="gap-0.5">
                <Row className="items-center gap-2">
                  <span className="text-lg font-bold">
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

        {/* Benefits Comparison Table with Column Highlight */}
        <BenefitsTable currentTier={currentTier} activeTier={activeTier} />

        {/* Monthly Value Breakdown */}
        <MonthlyValueBreakdown
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
          userNetWorth={userNetWorth}
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
                    )}% shop discount`}
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

// Monthly value breakdown showing cost vs benefit for each tier
function MonthlyValueBreakdown({
  selectedTier,
  onSelectTier,
  userNetWorth,
}: {
  selectedTier: SupporterTier
  onSelectTier: (tier: SupporterTier) => void
  userNetWorth?: number
}) {
  const [referralsPerMonth, setReferralsPerMonth] = useState(0)

  const tierConfig = SUPPORTER_TIERS[selectedTier]
  const benefits = SUPPORTER_BENEFITS[selectedTier]
  const mult = benefits.questMultiplier
  const cost = tierConfig.price

  // Base monthly rewards: streak 750 + sharing 150 + markets 400 = 1300
  const streakWithMult = Math.round(750 * mult)
  const sharesWithMult = Math.round(150 * mult)
  const marketsWithMult = Math.round(400 * mult)
  const bonusMana = streakWithMult + sharesWithMult + marketsWithMult - 1300

  // Referral bonus (extra from multiplier only)
  const refMult = benefits.referralMultiplier
  const referralWithMult = Math.round(REFERRAL_AMOUNT * referralsPerMonth * refMult)
  const referralBonus = Math.round(REFERRAL_AMOUNT * referralsPerMonth * (refMult - 1))

  const netFromQuests = bonusMana + referralBonus - cost

  // Leverage
  const extraLeverageMultiple = benefits.maxLoanNetWorthPercent
  const hasLeverage = benefits.marginLoanAccess
  const netWorth = userNetWorth && userNetWorth > 0 ? userNetWorth : 10000
  const extraCapital = Math.round(netWorth * extraLeverageMultiple)
  const breakEvenPercent = extraCapital > 0 ? (Math.max(0, -netFromQuests) / extraCapital) * 100 : 0

  return (
    <div className="bg-canvas-0 border-ink-200 rounded-xl border px-3 py-3 sm:p-4">
      <Row className="mb-2 flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold sm:text-base">Monthly Value</h3>
        <Row className="bg-ink-100 gap-0.5 rounded-full p-0.5">
          {(['basic', 'plus', 'premium'] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => onSelectTier(tier)}
              className={clsx(
                'rounded-full px-2.5 py-1 text-xs font-semibold transition-all sm:px-3 sm:text-sm',
                selectedTier === tier
                  ? `${SUPPORTER_TIERS[tier].bgColor} ${SUPPORTER_TIERS[tier].textColor} shadow-sm`
                  : 'text-ink-500 hover:text-ink-700'
              )}
            >
              {SUPPORTER_TIERS[tier].name}
            </button>
          ))}
        </Row>
      </Row>
      <p className="text-ink-500 mb-2 text-xs">
        {mult}x rewards if you predict daily, share, create questions
      </p>

      <Col className="gap-1 text-xs sm:text-sm">
        <Row className="justify-between">
          <span className="text-ink-600">🔥 Streak</span>
          <span className="tabular-nums font-medium">{streakWithMult}</span>
        </Row>
        <Row className="justify-between">
          <span className="text-ink-600">📤 Sharing</span>
          <span className="tabular-nums font-medium">{sharesWithMult}</span>
        </Row>
        <Row className="justify-between">
          <span className="text-ink-600">📝 Markets</span>
          <span className="tabular-nums font-medium">{marketsWithMult}</span>
        </Row>
        <Row className="items-center justify-between">
          <Row className="items-center gap-1">
            <span className="text-ink-600">🤝 Referrals</span>
            <Row className="items-center gap-0.5">
              <button
                onClick={() => setReferralsPerMonth(Math.max(0, referralsPerMonth - 1))}
                className="bg-ink-100 hover:bg-ink-200 h-4 w-4 rounded text-xs font-bold sm:h-5 sm:w-5"
              >
                −
              </button>
              <span className="w-3 text-center text-xs font-medium sm:w-4">{referralsPerMonth}</span>
              <button
                onClick={() => setReferralsPerMonth(referralsPerMonth + 1)}
                className="bg-ink-100 hover:bg-ink-200 h-4 w-4 rounded text-xs font-bold sm:h-5 sm:w-5"
              >
                +
              </button>
            </Row>
          </Row>
          <span className="tabular-nums font-medium">
            {referralsPerMonth > 0 ? referralWithMult.toLocaleString() : '—'}
          </span>
        </Row>

        <div className="border-ink-200 my-1.5 border-t" />

        <Row className="justify-between">
          <span className="text-ink-600">Extra from {mult}x</span>
          <span className="font-medium text-teal-600">+{(bonusMana + referralBonus).toLocaleString()}</span>
        </Row>
        <Row className="justify-between">
          <span className="text-ink-600">Cost</span>
          <span className="font-medium text-scarlet-500">−{cost.toLocaleString()}</span>
        </Row>
        <Row className="justify-between font-semibold">
          <span>Net</span>
          <span className={netFromQuests >= 0 ? 'text-teal-600' : 'text-ink-600'}>
            {netFromQuests >= 0 ? '+' : ''}{netFromQuests.toLocaleString()}/mo
          </span>
        </Row>

        {hasLeverage && (
          <>
            <div className="border-ink-200 my-1.5 border-t" />
            <Row className="justify-between text-xs">
              <span className="text-ink-500 font-medium uppercase">Leverage</span>
              <span className="text-ink-500">
                {ENV_CONFIG.moneyMoniker}{shortFormatNumber(netWorth)} × {extraLeverageMultiple}x
              </span>
            </Row>
            {netFromQuests < 0 && (
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

      {netFromQuests >= 0 ? (
        <div className="mt-2 rounded bg-teal-100 px-2 py-1 text-center text-xs font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 sm:text-sm">
          ✓ Pays for itself{hasLeverage && ' — leverage is profit!'}
        </div>
      ) : hasLeverage ? (
        <div className="mt-2 rounded bg-amber-100 px-2 py-1 text-center text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 sm:text-sm">
          📈 {breakEvenPercent.toFixed(1)}%/mo return to break even
        </div>
      ) : null}

      <p className="text-ink-400 mt-2 text-xs">
        + free loans, {benefits.shopDiscount > 0 ? `${Math.round(benefits.shopDiscount * 100)}% shop discount, ` : ''}badge
      </p>
    </div>
  )
}
