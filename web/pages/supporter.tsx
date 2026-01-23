import { useState } from 'react'
import clsx from 'clsx'
import { FaStar } from 'react-icons/fa'
import { DAY_MS } from 'common/util/time'
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

  // Get current supporter status
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
                    icon="🛍️"
                    label={`${Math.round(
                      SUPPORTER_BENEFITS[purchasedTier].shopDiscount * 100
                    )}% cosmetics discount`}
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
