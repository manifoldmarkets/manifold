import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { FaStar } from 'react-icons/fa'
import { formatMoney } from 'common/util/format'
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

export default function SupporterPage() {
  const user = useUser()
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [purchasedTier, setPurchasedTier] = useState<SupporterTier | null>(null)
  const [confirmingPurchase, setConfirmingPurchase] =
    useState<SupporterTier | null>(null)
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

  const effectiveBalance = user?.balance ?? 0

  // Active tier for highlighting (hovered or selected)
  const activeTier = hoveredTier ?? selectedTier

  return (
    <Page trackPageView="supporter page" className="p-3">
      <SEO
        title="Become a Supporter"
        description="Support Manifold and unlock premium benefits"
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
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-6 dark:from-amber-950/40 dark:via-yellow-950/40 dark:to-orange-950/40">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-200/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-orange-200/30 blur-3xl" />

          <div className="relative">
            <Row className="items-center justify-between gap-4">
              {/* Left: Avatar + Name + Badge (changes on hover/select) */}
              <Row className="items-center gap-3">
                <Avatar
                  username={user?.username}
                  avatarUrl={user?.avatarUrl}
                  size="lg"
                  noLink
                  entitlements={user?.entitlements}
                />
                <Col className="gap-0.5">
                  <Row className="items-center gap-2">
                    <span className="text-lg font-bold">{user?.name ?? 'You'}</span>
                    {/* Show hovered tier star, or current tier star */}
                    <span className="relative inline-flex">
                      <FaStar className={clsx(
                        'h-4 w-4 transition-colors duration-150',
                        (hoveredTier ?? currentTier ?? activeTier) === 'basic' && 'text-gray-400',
                        (hoveredTier ?? currentTier ?? activeTier) === 'plus' && 'text-indigo-500',
                        (hoveredTier ?? currentTier ?? activeTier) === 'premium' && 'text-amber-500'
                      )} />
                      {(hoveredTier ?? currentTier ?? activeTier) === 'premium' && (
                        <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-[1px]" />
                      )}
                    </span>
                  </Row>
                  {/* Show hovered tier text, or current tier text */}
                  <span className={clsx('text-sm font-medium transition-colors duration-150', SUPPORTER_TIERS[hoveredTier ?? currentTier ?? activeTier].textColor)}>
                    {SUPPORTER_TIERS[hoveredTier ?? currentTier ?? activeTier].name} Supporter
                  </span>
                </Col>
              </Row>

              {/* Right: Time remaining (for supporters) or tagline (for non-supporters) */}
              {isSupporter ? (
                <Col className="items-end gap-0.5">
                  <div className="text-ink-500 text-xs">Time remaining</div>
                  <Row className="items-center gap-1.5">
                    <span className="text-lg font-bold text-amber-600">{daysRemaining}d</span>
                    {/* Show +30d when hovering/selecting same tier (renewal) */}
                    {activeTier === currentTier && (
                      <>
                        <span className="text-ink-400 text-sm">→</span>
                        <span className="text-lg font-bold text-green-600">{daysRemaining + 30}d</span>
                      </>
                    )}
                  </Row>
                </Col>
              ) : (
                <Col className="hidden items-end gap-0.5 sm:flex">
                  <span className="text-ink-600 text-sm font-medium">Support Manifold</span>
                  <span className="text-ink-500 text-xs">Unlock premium benefits</span>
                </Col>
              )}
            </Row>
          </div>
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
            loading={purchasing === TIER_ITEMS[activeTier].id}
            disabled={!user || !!purchasing}
            onClick={() => setConfirmingPurchase(activeTier)}
            entitlements={user?.entitlements}
          />
        )}

        {/* Benefits Comparison Table with Column Highlight */}
        <BenefitsTable currentTier={currentTier} activeTier={activeTier} />

        {/* Balance display */}
        {user && (
          <div className="text-ink-500 text-center text-sm">
            Your balance:{' '}
            <span className="font-semibold text-violet-600">
              {formatMoney(effectiveBalance)}
            </span>
          </div>
        )}

        {/* Back to shop link */}
        <div className="text-center">
          <Link
            href="/shop"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Back to Shop
          </Link>
        </div>
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
          <h2 className="mb-2 text-2xl font-bold">Welcome to the Family!</h2>
          <p className="text-ink-600 mb-6">
            You're now a{' '}
            {purchasedTier && (
              <>
                <TierBadge tier={purchasedTier} animate={purchasedTier === 'premium'} />{' '}
                {SUPPORTER_TIERS[purchasedTier].name}
              </>
            )}{' '}
            Supporter!
          </p>

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
                    label={`${Math.round(SUPPORTER_BENEFITS[purchasedTier].shopDiscount * 100)}% shop discount`}
                  />
                )}
                {SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes > 1 && (
                  <BenefitRow
                    icon="❄️"
                    label={`${SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes} max streak freezes`}
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
