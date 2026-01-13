import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { FaStar } from 'react-icons/fa'
import { formatMoney } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import { SHOP_ITEMS } from 'common/shop/items'
import {
  SUPPORTER_TIERS,
  SUPPORTER_BENEFITS,
  TIER_ORDER,
  SupporterTier,
  getUserSupporterTier,
  getSupporterEntitlement,
  canUpgradeTo,
  BENEFIT_DEFINITIONS,
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

// Get shop items for each tier
const tierItems = {
  basic: SHOP_ITEMS.find((i) => i.id === 'supporter-basic')!,
  plus: SHOP_ITEMS.find((i) => i.id === 'supporter-plus')!,
  premium: SHOP_ITEMS.find((i) => i.id === 'supporter-premium')!,
}

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
    const item = tierItems[tier]
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
            {isSupporter ? (
              <Col className="items-center gap-3">
                <Row className="items-center gap-3">
                  <Avatar
                    username={user?.username}
                    avatarUrl={user?.avatarUrl}
                    size="lg"
                    noLink
                    entitlements={user?.entitlements}
                  />
                  <Col>
                    <Row className="items-center gap-2">
                      <span className="text-xl font-bold">{user?.name}</span>
                      <TierBadge tier={currentTier} animate />
                    </Row>
                    <span className="text-ink-600 text-sm">
                      @{user?.username}
                    </span>
                  </Col>
                </Row>

                <div
                  className={clsx(
                    'rounded-full px-4 py-2 text-center',
                    SUPPORTER_TIERS[currentTier].bgColor
                  )}
                >
                  <span
                    className={clsx(
                      'font-bold',
                      SUPPORTER_TIERS[currentTier].textColor
                    )}
                  >
                    {SUPPORTER_TIERS[currentTier].name} Supporter
                  </span>
                </div>

                <div className="text-center">
                  <div className="text-ink-600 text-sm">Time remaining</div>
                  <div className="text-2xl font-bold text-amber-600">
                    {daysRemaining} days
                  </div>
                </div>
              </Col>
            ) : (
              <Col className="items-center gap-3 text-center">
                <FaStar className="h-12 w-12 text-amber-500" />
                <h1 className="text-2xl font-bold">Become a Supporter</h1>
                <p className="text-ink-600 max-w-md text-sm">
                  Support Manifold's development and unlock premium benefits
                </p>
              </Col>
            )}
          </div>
        </div>

        {/* Horizontal Tier Selector */}
        <div className="grid grid-cols-3 gap-3">
          {TIER_ORDER.map((tier) => {
            const tierConfig = SUPPORTER_TIERS[tier]
            const item = tierItems[tier]
            const canAfford = effectiveBalance >= item.price
            const isCurrentTier = currentTier === tier
            const canUpgrade = canUpgradeTo(currentTier, tier)
            const isLowerTier = !!currentTier && !canUpgrade && !isCurrentTier
            const isActive = activeTier === tier
            const isSelected = selectedTier === tier
            const isHoveredOnly = hoveredTier === tier && !isSelected

            return (
              <button
                key={tier}
                onClick={() => !isLowerTier && setSelectedTier(tier)}
                onMouseEnter={() => setHoveredTier(tier)}
                onMouseLeave={() => setHoveredTier(null)}
                style={{ outline: 'none' }}
                className={clsx(
                  'relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200',
                  'outline-none focus:outline-none focus-visible:outline-none',
                  isLowerTier && 'opacity-60',
                  // Selected state - stronger glow
                  isSelected && tier === 'basic' && 'border-gray-500 bg-gray-100 shadow-[0_0_0_4px_rgba(107,114,128,0.4),0_4px_12px_rgba(107,114,128,0.25)] dark:bg-gray-900/50',
                  isSelected && tier === 'plus' && 'border-indigo-500 bg-indigo-100 shadow-[0_0_0_4px_rgba(99,102,241,0.5),0_4px_20px_rgba(99,102,241,0.35)] dark:bg-indigo-950/50',
                  isSelected && tier === 'premium' && 'border-amber-500 bg-amber-100 shadow-[0_0_0_4px_rgba(245,158,11,0.5),0_4px_24px_rgba(245,158,11,0.4)] dark:bg-amber-950/50',
                  // Hover only state - lighter glow
                  isHoveredOnly && tier === 'basic' && 'border-gray-400 bg-gray-50 shadow-[0_0_0_2px_rgba(156,163,175,0.25)] dark:bg-gray-900/30',
                  isHoveredOnly && tier === 'plus' && 'border-indigo-400 bg-indigo-50 shadow-[0_0_0_2px_rgba(129,140,248,0.3),0_2px_8px_rgba(99,102,241,0.15)] dark:bg-indigo-950/30',
                  isHoveredOnly && tier === 'premium' && 'border-amber-400 bg-amber-50 shadow-[0_0_0_2px_rgba(251,191,36,0.3),0_2px_12px_rgba(245,158,11,0.2)] dark:bg-amber-950/30',
                  // Default state (neither selected nor hovered)
                  !isActive && 'border-ink-200 bg-canvas-0 hover:border-ink-300'
                )}
              >
                {/* Badges */}
                {isCurrentTier && (
                  <div
                    className={clsx(
                      'absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white',
                      tier === 'basic' && 'bg-gray-500',
                      tier === 'plus' && 'bg-indigo-500',
                      tier === 'premium' && 'bg-amber-500'
                    )}
                  >
                    CURRENT
                  </div>
                )}
                {tier === 'plus' && !isCurrentTier && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    POPULAR
                  </div>
                )}

                {/* Star with glow effect for premium when active */}
                <div className="relative">
                  <TierBadge tier={tier} size="lg" />
                  {tier === 'premium' && isActive && (
                    <div className="absolute inset-0 animate-pulse">
                      <FaStar className="h-6 w-6 text-amber-500 opacity-50 blur-sm" />
                    </div>
                  )}
                </div>

                <span className={clsx('font-bold', tierConfig.textColor)}>
                  {tierConfig.name}
                </span>
                <span className="text-ink-600 text-sm font-medium">
                  {formatMoney(item.price)}/mo
                </span>
              </button>
            )
          })}
        </div>

        {/* Subscribe/Upgrade Button */}
        {activeTier && (
          <SubscribeButton
            tier={activeTier}
            currentTier={currentTier}
            effectiveBalance={effectiveBalance}
            loading={purchasing === tierItems[activeTier].id}
            disabled={!user || !!purchasing}
            onClick={() => setConfirmingPurchase(activeTier)}
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
          <PurchaseConfirmationModal
            tier={confirmingPurchase}
            currentTier={currentTier}
            daysRemaining={daysRemaining}
            loading={purchasing === tierItems[confirmingPurchase].id}
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
                <TierBadge tier={purchasedTier} />{' '}
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

function SubscribeButton(props: {
  tier: SupporterTier
  currentTier: SupporterTier | null
  effectiveBalance: number
  loading: boolean
  disabled: boolean
  onClick: () => void
}) {
  const { tier, currentTier, effectiveBalance, loading, disabled, onClick } = props
  const tierConfig = SUPPORTER_TIERS[tier]
  const item = tierItems[tier]
  const canAfford = effectiveBalance >= item.price
  const isCurrentTier = currentTier === tier
  const canUpgrade = canUpgradeTo(currentTier, tier)
  const isLowerTier = !!currentTier && !canUpgrade && !isCurrentTier

  const buttonText = isCurrentTier
    ? `Renew ${tierConfig.name}`
    : canUpgrade && !isCurrentTier
      ? `Upgrade to ${tierConfig.name}`
      : `Subscribe to ${tierConfig.name}`

  return (
    <Button
      color={tier === 'premium' ? 'amber' : tier === 'plus' ? 'indigo' : 'gray'}
      size="xl"
      className={clsx(
        'w-full transition-all duration-200',
        tier === 'premium' && 'shadow-lg shadow-amber-500/25',
        tier === 'plus' && 'shadow-lg shadow-indigo-500/25'
      )}
      onClick={onClick}
      disabled={disabled || !canAfford || isLowerTier}
      loading={loading}
    >
      {isLowerTier
        ? 'Already have higher tier'
        : !canAfford
          ? 'Insufficient balance'
          : `${buttonText} - ${formatMoney(item.price)}/mo`}
    </Button>
  )
}

function TierBadge({
  tier,
  size = 'md',
  animate = false,
}: {
  tier: SupporterTier
  size?: 'md' | 'lg'
  animate?: boolean
}) {
  const sizeClass = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  const showAnimation = animate && tier === 'premium'

  return (
    <span className="relative inline-flex">
      <FaStar
        className={clsx(
          sizeClass,
          tier === 'basic' && 'text-gray-400',
          tier === 'plus' && 'text-indigo-500',
          tier === 'premium' && 'text-amber-500'
        )}
      />
      {showAnimation && (
        <FaStar
          className={clsx(
            'absolute inset-0 animate-pulse opacity-50 blur-[1px]',
            sizeClass,
            'text-amber-500'
          )}
        />
      )}
    </span>
  )
}

function BenefitRow({ icon, label }: { icon: string; label: string }) {
  return (
    <Row className="items-center gap-2">
      <span>{icon}</span>
      <span>{label}</span>
    </Row>
  )
}

function PurchaseConfirmationModal(props: {
  tier: SupporterTier
  currentTier: SupporterTier | null
  daysRemaining: number
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { tier, currentTier, daysRemaining, loading, onConfirm, onCancel } =
    props
  const tierConfig = SUPPORTER_TIERS[tier]
  const item = tierItems[tier]
  const isUpgrade = currentTier && canUpgradeTo(currentTier, tier)
  const isSameTierRenewal = currentTier === tier

  // Calculate upgrade credit (matches backend logic)
  const upgradeCredit =
    isUpgrade && daysRemaining > 0
      ? Math.floor(daysRemaining * (tierItems[currentTier!].price / 30))
      : 0
  const finalPrice = Math.max(0, item.price - upgradeCredit)

  return (
    <Col className="bg-canvas-0 max-w-md rounded-xl p-6">
      <h2 className="mb-2 text-xl font-bold">Confirm Purchase</h2>

      {/* Same-tier renewal - show time stacking info */}
      {isSameTierRenewal && daysRemaining > 0 ? (
        <>
          <p className="text-ink-600 mb-4">
            You're about to renew{' '}
            <strong>{tierConfig.name} Supporter</strong> for{' '}
            <span className="font-semibold text-amber-600">
              {formatMoney(item.price)}
            </span>
          </p>
          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <div className="font-medium">Time will be added to your subscription:</div>
            <div className="mt-1">
              {daysRemaining} days remaining + 30 days ={' '}
              <span className="font-bold">{daysRemaining + 30} days total</span>
            </div>
          </div>
        </>
      ) : isUpgrade && upgradeCredit > 0 ? (
        /* Upgrade with credit */
        <>
          <p className="text-ink-600 mb-2">
            You're about to upgrade to{' '}
            <strong>{tierConfig.name} Supporter</strong>
          </p>
          <div className="mb-4 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
            <div className="space-y-1 text-sm">
              <Row className="justify-between text-green-800 dark:text-green-200">
                <span>{tierConfig.name} price:</span>
                <span className="text-ink-500 line-through">
                  {formatMoney(item.price)}
                </span>
              </Row>
              <Row className="justify-between text-green-800 dark:text-green-200">
                <span>
                  Credit ({daysRemaining}d of {SUPPORTER_TIERS[currentTier!].name}):
                </span>
                <span className="text-green-600 dark:text-green-400">
                  -{formatMoney(upgradeCredit)}
                </span>
              </Row>
              <Row className="justify-between border-t border-green-200 pt-1 font-bold text-green-800 dark:border-green-700 dark:text-green-200">
                <span>Final price:</span>
                <span className="text-amber-600">{formatMoney(finalPrice)}</span>
              </Row>
            </div>
          </div>
        </>
      ) : (
        /* Normal purchase */
        <p className="text-ink-600 mb-4">
          You're about to {isUpgrade ? 'upgrade to' : 'purchase'}{' '}
          <strong>{tierConfig.name} Supporter</strong> for{' '}
          <span className="font-semibold text-amber-600">
            {formatMoney(item.price)}
          </span>
        </p>
      )}

      <Row className="justify-end gap-2">
        <Button color="gray-outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          color={tier === 'premium' ? 'amber' : tier === 'plus' ? 'indigo' : 'gray'}
          loading={loading}
          onClick={onConfirm}
        >
          {isSameTierRenewal ? 'Renew' : isUpgrade ? 'Upgrade' : 'Purchase'}
        </Button>
      </Row>
    </Col>
  )
}

function BenefitsTable({
  currentTier,
  activeTier,
}: {
  currentTier: SupporterTier | null
  activeTier: SupporterTier | null
}) {
  return (
    <div className="bg-canvas-0 rounded-xl border border-ink-200">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            {/* Header row with title and OWNED badge */}
            <tr>
              <th className="p-4 text-left">
                <h2 className="text-lg font-semibold">Benefits Comparison</h2>
              </th>
              {TIER_ORDER.map((tier) => {
                const isCurrentTier = currentTier === tier
                return (
                  <th key={tier} className="px-2 sm:px-4 pt-2 pb-0 align-bottom">
                    {isCurrentTier && (
                      <div className={clsx(
                        'mx-auto w-fit rounded-t-md px-1.5 py-0.5 text-[8px] font-bold',
                        'sm:px-2 sm:text-[10px]',
                        // Border width: 1px mobile, 2px desktop
                        'border-l border-r border-t',
                        'sm:border-l-2 sm:border-r-2 sm:border-t-2',
                        tier === 'basic' && 'border-gray-400 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
                        tier === 'plus' && 'border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200',
                        tier === 'premium' && 'border-amber-400 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                      )}>
                        OWNED
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
            {/* Column headers row */}
            <tr>
              <th className="text-ink-600 border-ink-200 border-b p-2 sm:p-3 text-left text-sm font-medium">
                Benefit
              </th>
              {TIER_ORDER.map((tier) => {
                const isCurrentTier = currentTier === tier
                const isActiveTier = activeTier === tier
                return (
                  <th
                    key={tier}
                    className={clsx(
                      'p-2 sm:p-3 text-center text-sm font-medium transition-all duration-200',
                      isActiveTier && tier === 'basic' && 'bg-gray-100 dark:bg-gray-800/50',
                      isActiveTier && tier === 'plus' && 'bg-indigo-100 dark:bg-indigo-900/30',
                      isActiveTier && tier === 'premium' && 'bg-amber-100 dark:bg-amber-900/30',
                      isCurrentTier && `border-l border-r border-t sm:border-l-2 sm:border-r-2 sm:border-t-2 ${SUPPORTER_TIERS[tier].borderColor} rounded-t-lg`,
                      !isCurrentTier && 'border-ink-200 border-b'
                    )}
                  >
                    <Row className="items-center justify-center gap-1">
                      <TierBadge tier={tier} />
                      <span className={clsx('hidden sm:inline', SUPPORTER_TIERS[tier].textColor)}>
                        {SUPPORTER_TIERS[tier].name}
                      </span>
                    </Row>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {BENEFIT_DEFINITIONS.map((benefit, idx) => {
              const isLastRow = idx === BENEFIT_DEFINITIONS.length - 1
              return (
                <tr key={benefit.id}>
                  <td
                    className={clsx(
                      'border-ink-200 py-2 pl-2 pr-1 sm:p-3',
                      !isLastRow && 'border-b',
                      idx % 2 === 0 ? 'bg-canvas-50' : ''
                    )}
                  >
                    <Row className="items-center gap-1 sm:gap-2">
                      <span className="text-base sm:text-lg">{benefit.icon}</span>
                      <Col>
                        <span className="text-xs sm:text-sm font-medium">{benefit.title}</span>
                        <span className="text-ink-500 hidden text-xs sm:block">
                          {benefit.description}
                        </span>
                      </Col>
                    </Row>
                  </td>
                  {TIER_ORDER.map((tier) => {
                    const isCurrentTier = currentTier === tier
                    const isActiveTier = activeTier === tier
                    const value = benefit.getValueForTier(tier)
                    return (
                      <td
                        key={tier}
                        className={clsx(
                          'p-2 sm:p-3 text-center text-sm font-semibold transition-all duration-200',
                          // Active tier highlight
                          isActiveTier && tier === 'basic' && 'bg-gray-100 dark:bg-gray-800/50',
                          isActiveTier && tier === 'plus' && 'bg-indigo-100 dark:bg-indigo-900/30',
                          isActiveTier && tier === 'premium' && 'bg-amber-100 dark:bg-amber-900/30',
                          // Current tier border
                          isCurrentTier && `border-l border-r sm:border-l-2 sm:border-r-2 ${SUPPORTER_TIERS[tier].borderColor}`,
                          isCurrentTier && isLastRow && 'border-b sm:border-b-2 rounded-b-lg',
                          // Text colors
                          benefit.isUniform
                            ? 'text-green-600'
                            : isActiveTier
                              ? 'text-ink-900 dark:text-ink-100'
                              : SUPPORTER_TIERS[tier].textColor
                        )}
                      >
                        {benefit.id === 'badge' ? (
                          <Row className="justify-center">
                            <TierBadge tier={tier} />
                          </Row>
                        ) : (
                          value
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
