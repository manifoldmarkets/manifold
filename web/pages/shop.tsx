import { DAY_MS } from 'common/util/time'
import {
  SHOP_ITEMS,
  ShopItem,
  getEntitlementId,
  EXCLUSIVE_CATEGORIES,
  getEntitlementIdsForCategory,
} from 'common/shop/items'
import { UserEntitlement } from 'common/shop/types'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import {
  getUserSupporterTier,
  getSupporterEntitlement as getSupporterEnt,
  SUPPORTER_TIERS,
  SUPPORTER_ENTITLEMENT_IDS,
  SUPPORTER_BENEFITS,
  SupporterTier,
  canUpgradeTo,
  TIER_ORDER,
  BENEFIT_DEFINITIONS,
} from 'common/supporter-config'
import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { FaStar } from 'react-icons/fa'
import { FaGem } from 'react-icons/fa6'
import { LuCrown, LuGraduationCap } from 'react-icons/lu'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SPEND_MANA_ENABLED } from 'web/components/nav/sidebar'
import { SEO } from 'web/components/SEO'
import { Avatar } from 'web/components/widgets/avatar'
import { Card } from 'web/components/widgets/card'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useUser } from 'web/hooks/use-user'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useOptimisticEntitlements } from 'web/hooks/use-optimistic-entitlements'
import { api } from 'web/lib/api/api'
import Custom404 from './404'

// Check if user owns the item (not expired), regardless of enabled status
const isEntitlementOwned = (e: UserEntitlement) => {
  if (!e.expiresTime) return true
  return e.expiresTime > Date.now()
}

export default function ShopPage() {
  const user = useUser()
  const isAdminOrMod = useAdminOrMod()
  const optimisticContext = useOptimisticEntitlements()

  // Local state for optimistic updates
  const [localEntitlements, setLocalEntitlements] = useState<UserEntitlement[]>(
    []
  )
  const [justPurchased, setJustPurchased] = useState<string | null>(null)
  const [localStreakBonus, setLocalStreakBonus] = useState(0) // Track streak purchases

  // Track toggle version to ignore stale server responses during rapid toggling
  const toggleVersionRef = useRef(0)

  // Merge local state with server state for immediate UI updates
  const effectiveEntitlements = useMemo(() => {
    const serverEntitlements = user?.entitlements ?? []
    const merged = [...serverEntitlements]
    for (const local of localEntitlements) {
      const idx = merged.findIndex(
        (e) => e.entitlementId === local.entitlementId
      )
      if (idx >= 0) merged[idx] = local
      else merged.push(local)
    }
    return merged
  }, [user?.entitlements, localEntitlements])

  // Clear local state when server catches up
  useEffect(() => {
    if (user?.entitlements && localEntitlements.length > 0) {
      // Check if server has caught up (has same entitlements with matching enabled state)
      const serverHasCaughtUp = localEntitlements.every((local) =>
        user.entitlements?.some(
          (server) =>
            server.entitlementId === local.entitlementId &&
            server.enabled === local.enabled
        )
      )
      if (serverHasCaughtUp) {
        setLocalEntitlements([])
        setLocalStreakBonus(0)
        // Also clear global optimistic context
        optimisticContext?.clearOptimisticEntitlements()
      }
    }
  }, [user?.entitlements, localEntitlements, optimisticContext])

  // Allow admins to access shop for testing even when feature flag is off
  if (!SPEND_MANA_ENABLED && !isAdminOrMod) {
    return <Custom404 />
  }

  // Get user's owned entitlements (not expired, regardless of enabled status)
  const ownedItemIds = new Set(
    effectiveEntitlements
      .filter((e) => isEntitlementOwned(e))
      .map((e) => e.entitlementId)
  )

  // Callback for purchase completion - receives all updated entitlements
  const handlePurchaseComplete = (
    itemId: string,
    entitlements?: UserEntitlement[]
  ) => {
    if (entitlements) {
      // Replace all local entitlements with the server's updated state
      setLocalEntitlements(entitlements)
    }
    if (itemId === 'streak-forgiveness') {
      setLocalStreakBonus((prev) => prev + 1)
    }
    setJustPurchased(itemId)
    setTimeout(() => setJustPurchased(null), 2500)
  }

  // Callback for toggle completion (itemId is the shop item id, not entitlement id)
  // Can receive full entitlements array from server or just do optimistic update
  const handleToggleComplete = (
    itemId: string,
    enabled: boolean,
    options?: {
      revert?: boolean
      entitlements?: UserEntitlement[]
      version?: number
    }
  ) => {
    const { revert, entitlements: serverEntitlements, version } = options ?? {}

    // If we got server entitlements back, only apply if version matches (no newer toggles)
    if (serverEntitlements) {
      // Ignore stale responses if user has toggled again since this request started
      if (version !== undefined && version !== toggleVersionRef.current) {
        return // Stale response, ignore it
      }
      setLocalEntitlements(serverEntitlements)
      // Update global context with the toggled item
      const item = SHOP_ITEMS.find((i) => i.id === itemId)
      if (item) {
        const entitlementId = getEntitlementId(item)
        const updated = serverEntitlements.find(
          (e) => e.entitlementId === entitlementId
        )
        if (updated) {
          optimisticContext?.setOptimisticEntitlement(updated)
        }
      }
      return
    }

    // Otherwise do optimistic update - increment version to track this change
    toggleVersionRef.current += 1

    const item = SHOP_ITEMS.find((i) => i.id === itemId)
    if (!item) return
    const entitlementId = getEntitlementId(item)

    const existing = effectiveEntitlements.find(
      (e) => e.entitlementId === entitlementId
    )
    if (!existing) return

    const actualEnabled = revert ? !enabled : enabled
    const updated = { ...existing, enabled: actualEnabled }

    // Build optimistic state - update the toggled item AND disable others in same category
    setLocalEntitlements((prev) => {
      // Start with a copy of all effective entitlements to get full picture
      let newState = [...effectiveEntitlements]

      // If enabling an item in an exclusive category, disable others first
      if (actualEnabled && EXCLUSIVE_CATEGORIES.includes(item.category)) {
        const categoryEntitlementIds = getEntitlementIdsForCategory(item.category)
        newState = newState.map((e) => {
          if (
            categoryEntitlementIds.includes(e.entitlementId) &&
            e.entitlementId !== entitlementId
          ) {
            return { ...e, enabled: false }
          }
          return e
        })
      }

      // Update the toggled item
      const idx = newState.findIndex((e) => e.entitlementId === entitlementId)
      if (idx >= 0) {
        newState[idx] = updated
      }

      return newState
    })

    // Update global context so sidebar avatar updates immediately
    optimisticContext?.setOptimisticEntitlement(updated)

    // Also update global context for any items we disabled
    if (actualEnabled && EXCLUSIVE_CATEGORIES.includes(item.category)) {
      const categoryEntitlementIds = getEntitlementIdsForCategory(item.category)
      for (const ent of effectiveEntitlements) {
        if (
          categoryEntitlementIds.includes(ent.entitlementId) &&
          ent.entitlementId !== entitlementId &&
          ent.enabled
        ) {
          optimisticContext?.setOptimisticEntitlement({ ...ent, enabled: false })
        }
      }
    }
  }

  // Get current toggle version for passing to API calls
  const getToggleVersion = () => toggleVersionRef.current

  // Get current supporter entitlement for duration display
  const getSupporterEntitlement = () => {
    return getSupporterEnt(effectiveEntitlements)
  }

  return (
    <Page trackPageView="shop page" className="p-3">
      <SEO
        title="Shop"
        description="Spend your mana on digital goods"
        url="/shop"
      />
      {/* Confetti on purchase */}
      {justPurchased && (
        <FullscreenConfetti
          numberOfPieces={300}
          colors={['#6366f1', '#8b5cf6', '#a855f7', '#f59e0b']}
        />
      )}

      <Col className="mx-auto max-w-xl">
        <Row className="mb-2 items-center gap-2 text-2xl font-semibold">
          <FaGem className="h-6 w-6 text-violet-500" />
          Mana Shop
        </Row>
        {user && (
          <Row className="text-ink-700 mb-4 items-center gap-4 text-sm">
            <span>
              Your balance:{' '}
              <span className="font-semibold text-teal-600">
                {formatMoney(user.balance)}
              </span>
            </span>
            <Link
              href="/checkout"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Buy mana →
            </Link>
          </Row>
        )}

        {/* Supporter Card - links to /supporter page */}
        <SupporterCard
          entitlements={effectiveEntitlements}
          onPurchaseComplete={handlePurchaseComplete}
        />

        {/* Shop items grid - exclude supporter tiers (handled on /supporter page) */}
        <div className="grid grid-cols-2 gap-4">
          {SHOP_ITEMS.filter(
            (item) =>
              !SUPPORTER_ENTITLEMENT_IDS.includes(
                item.id as (typeof SUPPORTER_ENTITLEMENT_IDS)[number]
              )
          ).map((item) => {
            const entitlementId = getEntitlementId(item)
            const entitlement = effectiveEntitlements.find(
              (e) => e.entitlementId === entitlementId && isEntitlementOwned(e)
            )
            return (
              <ShopItemCard
                key={item.id}
                item={item}
                user={user}
                owned={ownedItemIds.has(entitlementId)}
                entitlement={entitlement}
                justPurchased={justPurchased === item.id}
                onPurchaseComplete={handlePurchaseComplete}
                onToggleComplete={handleToggleComplete}
                getToggleVersion={getToggleVersion}
                localStreakBonus={localStreakBonus}
                supporterEntitlement={getSupporterEntitlement() ?? undefined}
              />
            )
          })}
        </div>

        {/* Admin testing tools */}
        {isAdminOrMod && (
          <AdminTestingTools user={user} />
        )}
      </Col>
    </Page>
  )
}

function AdminTestingTools(props: { user: User | null | undefined }) {
  const { user } = props
  const [resetting, setResetting] = useState(false)

  const handleResetCosmetics = async () => {
    if (!user) return
    if (!confirm('This will delete all your cosmetics and refund the mana. Continue?')) return

    setResetting(true)
    try {
      await api('shop-reset-all', {})
      toast.success('All cosmetics returned and mana refunded!')
      // Force page reload to refresh user data
      window.location.reload()
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset cosmetics')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="border-ink-300 mt-8 border-t pt-4">
      <div className="text-ink-500 mb-2 text-xs font-semibold uppercase">
        Admin Testing Tools
      </div>
      <Button
        color="red-outline"
        size="sm"
        loading={resetting}
        onClick={handleResetCosmetics}
      >
        Return All Cosmetics (Refund Mana)
      </Button>
    </div>
  )
}

// Simplified Supporter card that opens a modal
function SupporterCard(props: {
  entitlements?: UserEntitlement[]
  onPurchaseComplete?: (itemId: string, entitlements?: UserEntitlement[]) => void
}) {
  const { entitlements, onPurchaseComplete } = props
  const user = useUser()
  const [showModal, setShowModal] = useState(false)

  const currentTier = getUserSupporterTier(entitlements)
  const supporterEntitlement = getSupporterEnt(entitlements)
  const isSupporter = currentTier !== null

  const daysRemaining = supporterEntitlement?.expiresTime
    ? Math.max(0, Math.ceil((supporterEntitlement.expiresTime - Date.now()) / DAY_MS))
    : 0

  // Display tier for badge (current tier or default to plus for preview)
  const displayTier = currentTier ?? 'plus'

  const tierPrices = {
    basic: 500,
    plus: 2500,
    premium: 10000,
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="group relative mb-4 w-full overflow-hidden rounded-xl bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-1 text-left transition-all duration-200 hover:shadow-xl hover:shadow-amber-200/50 dark:from-amber-950/30 dark:via-yellow-950/30 dark:to-orange-950/30 dark:hover:shadow-amber-900/30"
      >
        {/* Animated gradient border */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 opacity-50 transition-opacity duration-200 group-hover:opacity-75" />

        <div className="bg-canvas-0 relative rounded-lg p-5">
          {/* Header */}
          <Row className="items-start justify-between">
            <Col className="gap-1">
              <Row className="items-center gap-2">
                <FaStar
                  className="h-6 w-6 text-amber-500"
                  style={{ filter: 'drop-shadow(0 0 3px rgba(245, 158, 11, 0.5))' }}
                />
                <span className="text-xl font-bold">Manifold Supporter</span>
              </Row>
              <p className="text-ink-600 text-sm">
                Support Manifold, unlock exclusive benefits
              </p>
            </Col>
            {isSupporter && (
              <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {SUPPORTER_TIERS[currentTier].name.toUpperCase()}
              </div>
            )}
          </Row>

          {/* Live Badge Preview - shows user's actual entitlements */}
          <div className="my-4 flex items-center justify-center rounded-lg bg-gradient-to-r from-amber-50/50 to-orange-50/50 py-4 dark:from-amber-950/20 dark:to-orange-950/20">
            <Row className="items-center gap-3">
              <Avatar
                username={user?.username}
                avatarUrl={user?.avatarUrl}
                size="md"
                noLink
                entitlements={entitlements}
              />
              <span className="font-semibold">{user?.name ?? 'YourName'}</span>
              <div className="relative">
                <FaStar
                  className={clsx(
                    'h-5 w-5',
                    displayTier === 'basic' && 'text-gray-400',
                    displayTier === 'plus' && 'text-indigo-500',
                    displayTier === 'premium' && 'text-amber-500'
                  )}
                  style={displayTier === 'premium' ? { filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))' } : undefined}
                />
                {displayTier === 'premium' && (
                  <FaStar
                    className="absolute inset-0 h-5 w-5 animate-pulse text-amber-500 opacity-50 blur-sm"
                  />
                )}
              </div>
            </Row>
          </div>

          {/* Mini Tier Selector (shows current tier) */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(['basic', 'plus', 'premium'] as const).map((tier) => {
              const isCurrentUserTier = currentTier === tier
              return (
                <div
                  key={tier}
                  className={clsx(
                    'relative flex flex-col items-center rounded-lg border-2 px-2 py-2 transition-all duration-150',
                    isCurrentUserTier && tier === 'basic' && 'border-gray-400 bg-gray-50 dark:bg-gray-900/30',
                    isCurrentUserTier && tier === 'plus' && 'border-indigo-400 bg-indigo-50 shadow-md shadow-indigo-200/50 dark:bg-indigo-950/30',
                    isCurrentUserTier && tier === 'premium' && 'border-amber-400 bg-amber-50 shadow-lg shadow-amber-200/50 dark:bg-amber-950/30',
                    !isCurrentUserTier && 'border-ink-200 bg-canvas-0'
                  )}
                >
                  {isCurrentUserTier && (
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded bg-green-500 px-1 text-[8px] font-bold text-white">
                      OWNED
                    </div>
                  )}
                  <div className="relative">
                    <FaStar className={clsx(
                      'h-4 w-4',
                      tier === 'basic' && 'text-gray-400',
                      tier === 'plus' && 'text-indigo-500',
                      tier === 'premium' && 'text-amber-500'
                    )}
                    style={tier === 'premium' ? { filter: 'drop-shadow(0 0 3px rgba(245, 158, 11, 0.5))' } : undefined}
                    />
                    {tier === 'premium' && (
                      <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-40 blur-[2px]" />
                    )}
                  </div>
                  <div className={clsx('text-xs font-semibold', SUPPORTER_TIERS[tier].textColor)}>
                    {SUPPORTER_TIERS[tier].name}
                  </div>
                  <div className="text-ink-500 text-[10px]">
                    {formatMoney(tierPrices[tier])}
                  </div>
                </div>
              )
            })}
          </div>

          {/* CTA */}
          <div className="text-primary-600 text-center text-sm font-medium group-hover:underline">
            {isSupporter
              ? daysRemaining > 0
                ? `Manage Subscription (${daysRemaining}d left) →`
                : 'Renew Subscription →'
              : 'See details & subscribe →'}
          </div>
        </div>
      </button>

      <SupporterModal
        open={showModal}
        setOpen={setShowModal}
        entitlements={entitlements}
        onPurchaseComplete={onPurchaseComplete}
      />
    </>
  )
}

// Get shop items for each tier
const tierItems = {
  basic: SHOP_ITEMS.find((i) => i.id === 'supporter-basic')!,
  plus: SHOP_ITEMS.find((i) => i.id === 'supporter-plus')!,
  premium: SHOP_ITEMS.find((i) => i.id === 'supporter-premium')!,
}

// Modal containing the supporter page content
function SupporterModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  entitlements?: UserEntitlement[]
  onPurchaseComplete?: (itemId: string, entitlements?: UserEntitlement[]) => void
}) {
  const { open, setOpen, entitlements, onPurchaseComplete } = props
  const user = useUser()
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [purchasedTier, setPurchasedTier] = useState<SupporterTier | null>(null)
  const [confirmingPurchase, setConfirmingPurchase] = useState<SupporterTier | null>(null)
  const [hoveredTier, setHoveredTier] = useState<SupporterTier | null>(null)
  const [selectedTier, setSelectedTier] = useState<SupporterTier>('plus')

  // Reset celebration state when modal opens
  useEffect(() => {
    if (open) {
      setShowCelebration(false)
      setPurchasedTier(null)
    }
  }, [open])

  const currentTier = getUserSupporterTier(entitlements)
  const currentEntitlement = getSupporterEnt(entitlements)
  const isSupporter = currentTier !== null

  const daysRemaining = currentEntitlement?.expiresTime
    ? Math.max(0, Math.ceil((currentEntitlement.expiresTime - Date.now()) / DAY_MS))
    : 0

  const handlePurchase = async (tier: SupporterTier) => {
    if (!user) return
    const item = tierItems[tier]
    setPurchasing(item.id)
    try {
      const result = await api('shop-purchase', { itemId: item.id })
      // Update parent state with new entitlements for immediate UI update
      if (onPurchaseComplete) {
        onPurchaseComplete(item.id, result.entitlements)
      }
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
  const activeTier = hoveredTier ?? selectedTier

  if (showCelebration) {
    return (
      <Modal open={open} setOpen={setOpen} size="md">
        <FullscreenConfetti
          numberOfPieces={500}
          colors={['#f59e0b', '#fbbf24', '#fcd34d', '#6366f1', '#8b5cf6']}
        />
        <Col className="bg-canvas-0 max-w-md rounded-xl p-8 text-center">
          <div className="mb-4 text-5xl">🎉</div>
          <h2 className="mb-2 text-2xl font-bold">Welcome to the Family!</h2>
          <p className="text-ink-600 mb-6">
            You're now a{' '}
            {purchasedTier && (
              <>
                <span className="relative inline-flex">
                  <FaStar className={clsx(
                    'inline h-4 w-4',
                    purchasedTier === 'basic' && 'text-gray-400',
                    purchasedTier === 'plus' && 'text-indigo-500',
                    purchasedTier === 'premium' && 'text-amber-500'
                  )} />
                  {purchasedTier === 'premium' && (
                    <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-[1px]" />
                  )}
                </span>{' '}
                {SUPPORTER_TIERS[purchasedTier].name}
              </>
            )}{' '}
            Supporter!
          </p>

          <Col className="mb-6 gap-2 text-left">
            {purchasedTier && (
              <>
                <Row className="items-center gap-2">
                  <span>🎯</span>
                  <span>{SUPPORTER_BENEFITS[purchasedTier].questMultiplier}x quest rewards</span>
                </Row>
                {SUPPORTER_BENEFITS[purchasedTier].shopDiscount > 0 && (
                  <Row className="items-center gap-2">
                    <span>🛍️</span>
                    <span>{Math.round(SUPPORTER_BENEFITS[purchasedTier].shopDiscount * 100)}% shop discount</span>
                  </Row>
                )}
                {SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes > 1 && (
                  <Row className="items-center gap-2">
                    <span>❄️</span>
                    <span>{SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes} max streak freezes</span>
                  </Row>
                )}
              </>
            )}
          </Col>

          <Button color="amber" onClick={() => setOpen(false)}>
            Continue Shopping
          </Button>
        </Col>
      </Modal>
    )
  }

  return (
    <>
      <Modal open={open} setOpen={setOpen} size="lg">
        <Col className="bg-canvas-0 max-w-3xl gap-6 rounded-xl p-6">
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
                      entitlements={entitlements}
                    />
                    <Col>
                      <Row className="items-center gap-2">
                        <span className="text-xl font-bold">{user?.name}</span>
                        <span className="relative inline-flex">
                          <FaStar className={clsx(
                            'h-5 w-5',
                            currentTier === 'basic' && 'text-gray-400',
                            currentTier === 'plus' && 'text-indigo-500',
                            currentTier === 'premium' && 'text-amber-500'
                          )} />
                          {currentTier === 'premium' && (
                            <FaStar className="absolute inset-0 h-5 w-5 animate-pulse text-amber-500 opacity-50 blur-[1px]" />
                          )}
                        </span>
                      </Row>
                      <span className="text-ink-600 text-sm">@{user?.username}</span>
                    </Col>
                  </Row>

                  <div className={clsx(
                    'rounded-full px-4 py-2 text-center',
                    SUPPORTER_TIERS[currentTier].bgColor
                  )}>
                    <span className={clsx('font-bold', SUPPORTER_TIERS[currentTier].textColor)}>
                      {SUPPORTER_TIERS[currentTier].name} Supporter
                    </span>
                  </div>

                  <div className="text-center">
                    <div className="text-ink-600 text-sm">Time remaining</div>
                    <div className="text-2xl font-bold text-amber-600">{daysRemaining} days</div>
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
              const canUpgradeToTier = canUpgradeTo(currentTier, tier)
              const isLowerTier = !!currentTier && !canUpgradeToTier && !isCurrentTier
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
                    // Default state
                    !isActive && 'border-ink-200 bg-canvas-0 hover:border-ink-300'
                  )}
                >
                  {isCurrentTier && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      OWNED
                    </div>
                  )}

                  <div className="relative">
                    <FaStar className={clsx(
                      'h-6 w-6',
                      tier === 'basic' && 'text-gray-400',
                      tier === 'plus' && 'text-indigo-500',
                      tier === 'premium' && 'text-amber-500'
                    )} />
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
            <ModalSubscribeButton
              tier={activeTier}
              currentTier={currentTier}
              effectiveBalance={effectiveBalance}
              loading={purchasing === tierItems[activeTier].id}
              disabled={!user || !!purchasing}
              onClick={() => setConfirmingPurchase(activeTier)}
            />
          )}

          {/* Benefits Comparison Table */}
          <ModalBenefitsTable currentTier={currentTier} activeTier={activeTier} />

          {/* Balance display */}
          {user && (
            <div className="text-ink-500 text-center text-sm">
              Your balance:{' '}
              <span className="font-semibold text-violet-600">
                {formatMoney(effectiveBalance)}
              </span>
            </div>
          )}

          {/* Link to full page */}
          <div className="text-center">
            <Link
              href="/supporter"
              onClick={() => setOpen(false)}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              View full supporter page →
            </Link>
          </div>
        </Col>
      </Modal>

      {/* Purchase Confirmation Modal */}
      <Modal
        open={!!confirmingPurchase}
        setOpen={(open) => !open && setConfirmingPurchase(null)}
      >
        {confirmingPurchase && (
          <ModalPurchaseConfirmation
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
    </>
  )
}

function ModalSubscribeButton(props: {
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
  const canUpgradeToTier = canUpgradeTo(currentTier, tier)
  const isLowerTier = !!currentTier && !canUpgradeToTier && !isCurrentTier

  const buttonText = isCurrentTier
    ? `Renew ${tierConfig.name}`
    : canUpgradeToTier && !isCurrentTier
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

function ModalBenefitsTable(props: {
  currentTier: SupporterTier | null
  activeTier: SupporterTier | null
}) {
  const { currentTier, activeTier } = props

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
                      <FaStar className={clsx(
                        'h-4 w-4',
                        tier === 'basic' && 'text-gray-400',
                        tier === 'plus' && 'text-indigo-500',
                        tier === 'premium' && 'text-amber-500'
                      )} />
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
                  <td className={clsx(
                    'py-2 pl-2 pr-1 sm:p-3',
                    !isLastRow && 'border-ink-200 border-b'
                  )}>
                    <Row className="items-center gap-1 sm:gap-2">
                      <span className="text-base sm:text-lg">{benefit.icon}</span>
                      <span className="text-xs sm:text-sm font-medium">{benefit.title}</span>
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
                          'p-2 sm:p-3 text-center text-sm transition-all duration-200',
                          isActiveTier && tier === 'basic' && 'bg-gray-100 dark:bg-gray-800/50',
                          isActiveTier && tier === 'plus' && 'bg-indigo-100 dark:bg-indigo-900/30',
                          isActiveTier && tier === 'premium' && 'bg-amber-100 dark:bg-amber-900/30',
                          isCurrentTier && `border-l border-r sm:border-l-2 sm:border-r-2 ${SUPPORTER_TIERS[tier].borderColor}`,
                          isCurrentTier && isLastRow && `border-b sm:border-b-2 rounded-b-lg`,
                          !isCurrentTier && !isLastRow && 'border-ink-200 border-b'
                        )}
                      >
                        <span className={clsx(
                          value !== '-' && 'font-semibold',
                          value !== '-' && tier === 'basic' && 'text-gray-600 dark:text-gray-300',
                          value !== '-' && tier === 'plus' && 'text-indigo-600 dark:text-indigo-400',
                          value !== '-' && tier === 'premium' && 'text-amber-600 dark:text-amber-400',
                          value === '-' && 'text-ink-400'
                        )}>
                          {value}
                        </span>
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

function ModalPurchaseConfirmation(props: {
  tier: SupporterTier
  currentTier: SupporterTier | null
  daysRemaining: number
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { tier, currentTier, daysRemaining, loading, onConfirm, onCancel } = props
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

// Preview components for each shop item type

function SupporterBadgePreview(props: {
  user: User | null | undefined
  itemId: string
  currentEntitlement?: UserEntitlement
}) {
  const { user, itemId, currentEntitlement } = props
  const displayName = user?.name ?? 'YourName'

  // Calculate current active time remaining
  const currentDaysRemaining = currentEntitlement?.expiresTime
    ? Math.max(
        0,
        Math.ceil((currentEntitlement.expiresTime - Date.now()) / DAY_MS)
      )
    : 0

  // Duration this item adds
  const durationDays = itemId === 'supporter-badge-1y' ? 365 : 30

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-3 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-950/20">
      <Row className="items-center gap-2">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="sm"
          noLink
        />
        <span className="font-medium">{displayName}</span>
        <Tooltip text="Manifold Supporter" placement="right">
          <FaStar className="h-4 w-4 text-amber-500" />
        </Tooltip>
      </Row>

      {/* Active duration indicator */}
      <div className="text-ink-600 text-sm">
        Active for:{' '}
        <span className="text-ink-500">{currentDaysRemaining}d</span>
        <span className="text-ink-400 mx-1">→</span>
        <span className="font-semibold text-amber-600">
          {currentDaysRemaining + durationDays}d
        </span>
      </div>
    </div>
  )
}

function GoldenBorderPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-950/20">
      <div className="relative">
        <div className="absolute -inset-1 animate-pulse rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 opacity-75 blur-sm" />
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative ring-2 ring-amber-400"
        />
      </div>
    </div>
  )
}

function CrownPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-950/20">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        <div className="absolute -right-2 -top-[0.41rem] rotate-45">
          <LuCrown className="h-5 w-5 text-amber-500" />
        </div>
      </div>
    </div>
  )
}

function GraduationCapPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-950/20">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        <div className="absolute -right-2 -top-[0.41rem] rotate-45">
          <LuGraduationCap className="h-5 w-5 text-indigo-500" />
        </div>
      </div>
    </div>
  )
}

function StreakFreezePreview(props: {
  user: User | null | undefined
  localBonus?: number
}) {
  const { user, localBonus = 0 } = props
  // Include local bonus for optimistic display
  const currentFreezes = (user?.streakForgiveness ?? 0) + localBonus

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-950/20">
      <Row className="items-center gap-2">
        <span className="text-ink-600 text-sm">Your freezes:</span>
        <span className="text-lg">❄️</span>
        <span className="font-bold text-blue-500">{currentFreezes}</span>
        <span className="text-ink-500">→</span>
        <span className="font-bold text-blue-500">{currentFreezes + 1}</span>
      </Row>
    </div>
  )
}

function PampuSkinPreview() {
  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-950/20">
      <Col className="items-center gap-2">
        <span className="text-ink-500 text-xs">Your YES button becomes:</span>
        <Row className="items-center gap-2">
          <Button color="green-outline" size="sm">
            PAMPU
          </Button>
          <Button color="red-outline" size="sm" disabled>
            No
          </Button>
        </Row>
      </Col>
    </div>
  )
}

function HovercardGlowPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const displayName = user?.name ?? 'YourName'
  const username = user?.username ?? 'username'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-2 transition-colors duration-200 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-950/20">
      <div className="bg-canvas-0 divide-ink-300 w-44 origin-center scale-[0.85] divide-y rounded-md shadow-[0_0_15px_rgba(167,139,250,0.5)] ring-2 ring-violet-400">
        <div className="px-3 py-2">
          <Row className="items-start justify-between">
            <Avatar
              username={user?.username}
              avatarUrl={user?.avatarUrl}
              size="md"
              noLink
            />
            <div className="bg-primary-500 rounded px-2 py-0.5 text-[10px] text-white">
              Follow
            </div>
          </Row>
          <div className="mt-1 truncate text-sm font-bold">{displayName}</div>
          <div className="text-ink-500 text-xs">@{username}</div>
          <Row className="mt-1 gap-3 text-[10px]">
            <span>
              <b>0</b> Following
            </span>
            <span>
              <b>0</b> Followers
            </span>
          </Row>
        </div>
        <div className="text-ink-600 px-3 py-1.5 text-[10px]">
          <b>Last active:</b> today
        </div>
      </div>
    </div>
  )
}

function ItemPreview(props: {
  itemId: string
  user: User | null | undefined
  localStreakBonus?: number
  supporterEntitlement?: UserEntitlement
}) {
  const { itemId, user, localStreakBonus, supporterEntitlement } = props

  switch (itemId) {
    case 'supporter-badge-30d':
    case 'supporter-badge-1y':
      return (
        <SupporterBadgePreview
          user={user}
          itemId={itemId}
          currentEntitlement={supporterEntitlement}
        />
      )
    case 'avatar-golden-border':
      return <GoldenBorderPreview user={user} />
    case 'avatar-crown':
      return <CrownPreview user={user} />
    case 'avatar-graduation-cap':
      return <GraduationCapPreview user={user} />
    case 'streak-forgiveness':
      return <StreakFreezePreview user={user} localBonus={localStreakBonus} />
    case 'pampu-skin':
      return <PampuSkinPreview />
    case 'hovercard-glow':
      return <HovercardGlowPreview user={user} />
    default:
      return null
  }
}

function ShopItemCard(props: {
  item: ShopItem
  user: User | null | undefined
  owned: boolean
  entitlement?: UserEntitlement
  justPurchased?: boolean
  onPurchaseComplete: (itemId: string, entitlements?: UserEntitlement[]) => void
  onToggleComplete: (
    itemId: string,
    enabled: boolean,
    options?: {
      revert?: boolean
      entitlements?: UserEntitlement[]
      version?: number
    }
  ) => void
  getToggleVersion: () => number
  localStreakBonus: number
  supporterEntitlement?: UserEntitlement
}) {
  const {
    item,
    user,
    owned,
    entitlement,
    justPurchased,
    onPurchaseComplete,
    onToggleComplete,
    getToggleVersion,
    localStreakBonus,
    supporterEntitlement,
  } = props
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [purchasing, setPurchasing] = useState(false)

  const canPurchase = user && user.balance >= item.price
  // Items are toggleable unless they're always enabled (like supporter badges)
  const isToggleable =
    (item.type === 'permanent-toggleable' || item.type === 'time-limited') &&
    !item.alwaysEnabled

  // Use entitlement state directly - optimistic updates handled by parent
  const isEnabled = entitlement?.enabled ?? false

  const isSupporterBadge =
    item.id === 'supporter-badge-30d' || item.id === 'supporter-badge-1y'

  const handlePurchase = async () => {
    if (!user) return

    setPurchasing(true)
    try {
      const result = await api('shop-purchase', { itemId: item.id })
      toast.success(`Purchased ${item.name}!`)
      setShowConfirmModal(false)
      onPurchaseComplete(item.id, result.entitlements)
    } catch (e: any) {
      toast.error(e.message || 'Failed to purchase item')
    } finally {
      setPurchasing(false)
    }
  }

  const handleToggle = async () => {
    const newEnabled = !isEnabled
    // Optimistic update via parent state (this increments the version)
    onToggleComplete(item.id, newEnabled)
    // Capture version AFTER optimistic update so we can check if it's still current
    const versionAtRequest = getToggleVersion()

    try {
      const result = await api('shop-toggle', {
        itemId: item.id,
        enabled: newEnabled,
      })
      // Update with server state, passing version to ignore if stale
      onToggleComplete(item.id, newEnabled, {
        entitlements: result.entitlements,
        version: versionAtRequest,
      })
      toast.success(newEnabled ? 'Item enabled' : 'Item disabled')
    } catch (e: any) {
      // Revert on error (only if version still matches)
      if (getToggleVersion() === versionAtRequest) {
        onToggleComplete(item.id, newEnabled, { revert: true })
        toast.error(e.message || 'Failed to toggle item')
      }
    }
  }

  const cardRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <Card
        ref={cardRef}
        className={`group relative flex cursor-default flex-col gap-3 p-4 transition-all duration-200 ${
          justPurchased
            ? 'ring-2 ring-indigo-500 ring-offset-2'
            : 'hover:ring-2 hover:ring-indigo-500 hover:shadow-xl hover:shadow-indigo-200/50 hover:-translate-y-1 dark:hover:shadow-indigo-900/30'
        }`}
      >
        {/* OWNED badge */}
        {owned && (
          <div className="absolute right-2 top-2 rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            OWNED
          </div>
        )}

        {/* Card header - special formatting for supporter badges */}
        {isSupporterBadge ? (
          <div className="pr-16">
            <div className="text-lg font-semibold">Manifold Supporter</div>
            <div className="text-ink-500 text-sm">
              {item.id === 'supporter-badge-1y' ? '1 year' : '1 month'}
            </div>
          </div>
        ) : (
          <div className="text-lg font-semibold">{item.name}</div>
        )}

        <p className="text-ink-600 text-sm">{item.description}</p>

        {/* Live Preview with actual user data */}
        <ItemPreview
          itemId={item.id}
          user={user}
          localStreakBonus={localStreakBonus}
          supporterEntitlement={supporterEntitlement}
        />

        {/* Footer: different layouts for owned vs non-owned */}
        {owned ? (
          // Owned item layout
          <Col className="mt-auto gap-2 pt-2">
            {isToggleable ? (
              // Toggle switch for toggleable items
              <Row className="items-center justify-center">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={handleToggle}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-indigo-600 peer-checked:after:translate-x-full dark:bg-gray-600" />
                  <span className="text-ink-700 ml-2 text-sm">
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </Row>
            ) : item.alwaysEnabled ? (
              // Always-enabled items (like supporter badges) - show "Active"
              <div className="text-center text-sm font-medium text-green-600">
                Active
              </div>
            ) : (
              // Non-toggleable owned items (instant like streak freeze)
              <div className="text-ink-500 text-center text-sm">
                Already applied
              </div>
            )}
            {/* Expiration date for time-limited items */}
            {entitlement?.expiresTime && (
              <div className="text-ink-500 text-center text-xs">
                Expires{' '}
                {new Date(entitlement.expiresTime).toLocaleDateString()}
              </div>
            )}
            {/* Buy more button for unlimited items (like supporter badges that stack) */}
            {item.limit === 'unlimited' && (
              <Row className="items-center justify-between border-t border-ink-200 pt-2 mt-1">
                <div className="font-semibold text-teal-600">
                  {formatMoney(item.price)}
                </div>
                {!canPurchase && user ? (
                  <Link href="/checkout">
                    <Button size="xs" color="gradient-pink">
                      Buy mana
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="xs"
                    color="indigo-outline"
                    disabled={!user}
                    onClick={() => setShowConfirmModal(true)}
                  >
                    Add more time
                  </Button>
                )}
              </Row>
            )}
          </Col>
        ) : (
          // Non-owned item layout
          <>
            <Row className="mt-auto items-center justify-between pt-2">
              <div className="font-semibold text-teal-600">
                {formatMoney(item.price)}
              </div>

              {!canPurchase && user ? (
                <Link href="/checkout">
                  <Button size="sm" color="gradient-pink">
                    Buy mana
                  </Button>
                </Link>
              ) : (
                <Button
                  size="sm"
                  color="indigo"
                  disabled={!user}
                  onClick={() => setShowConfirmModal(true)}
                >
                  Buy
                </Button>
              )}
            </Row>

            {item.duration && (
              <div className="text-ink-500 text-xs">
                Duration: {Math.round(item.duration / (24 * 60 * 60 * 1000))}{' '}
                days
              </div>
            )}
          </>
        )}
      </Card>

      <Modal open={showConfirmModal} setOpen={setShowConfirmModal}>
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <div className="text-lg font-semibold">Confirm Purchase</div>
          <p className="text-ink-600">
            Are you sure you want to purchase <strong>{item.name}</strong> for{' '}
            <span className="font-semibold text-teal-600">
              {formatMoney(item.price)}
            </span>
            ?
          </p>

          {/* Preview in modal too with actual user data */}
          <ItemPreview
            itemId={item.id}
            user={user}
            localStreakBonus={localStreakBonus}
            supporterEntitlement={supporterEntitlement}
          />

          {item.duration && (
            <p className="text-ink-500 text-sm">
              This item will expire after{' '}
              {Math.round(item.duration / (24 * 60 * 60 * 1000))} days.
            </p>
          )}
          <Row className="justify-end gap-2">
            <Button color="gray" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              color="indigo"
              loading={purchasing}
              onClick={handlePurchase}
            >
              Purchase
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
