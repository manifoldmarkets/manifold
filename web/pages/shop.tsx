import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/solid'
import { DAY_MS } from 'common/util/time'
import {
  SHOP_ITEMS,
  ShopItem,
  getEntitlementId,
  getShopItem,
  EXCLUSIVE_CATEGORIES,
  getEntitlementIdsForCategory,
  isSeasonalItemAvailable,
  getSeasonalAvailabilityText,
  getEntitlementIdsForTeam,
  getOppositeTeam,
  YES_BUTTON_OPTIONS,
  NO_BUTTON_OPTIONS,
  YesButtonOption,
  NoButtonOption,
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
  getBenefit,
  getMaxStreakFreezes,
} from 'common/supporter-config'
import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { FaStar } from 'react-icons/fa'
import { FaGem } from 'react-icons/fa6'
import { LuCrown, LuGraduationCap } from 'react-icons/lu'
import { GiTopHat, GiDunceCap } from 'react-icons/gi'
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
import { useUser } from 'web/hooks/use-user'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useOptimisticEntitlements } from 'web/hooks/use-optimistic-entitlements'
import { api } from 'web/lib/api/api'
import Custom404 from './404'
import {
  BenefitsTable,
  TierSelector,
  SubscribeButton,
  PurchaseConfirmation,
  TIER_ITEMS,
} from 'web/components/shop/supporter'
import { CharityGiveawayCard } from 'web/components/shop/charity-giveaway-card'

// Check if user owns the item (not expired), regardless of enabled status
const isEntitlementOwned = (e: UserEntitlement) => {
  if (!e.expiresTime) return true
  return e.expiresTime > Date.now()
}

// Default item order (manual curation)
const ITEM_ORDER: Record<string, number> = {
  'streak-forgiveness': 1,
  'pampu-skin': 2,
  'avatar-golden-border': 3,
  'avatar-crown': 4,
  'hovercard-glow': 5,
  'avatar-graduation-cap': 6,
}

type SortOption =
  | 'default'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc'
  | 'name-desc'

const sortItems = (items: ShopItem[], sort: SortOption): ShopItem[] => {
  const sorted = [...items]
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price)
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case 'default':
    default:
      return sorted.sort(
        (a, b) => (ITEM_ORDER[a.id] ?? 99) - (ITEM_ORDER[b.id] ?? 99)
      )
  }
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
  const [sortOption, setSortOption] = useState<SortOption>('default')

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
        // Note: Don't clear localStreakBonus here - streak freezes aren't entitlements,
        // so this sync logic doesn't apply. The bonus will clear when user.streakForgiveness
        // updates via WebSocket, or on page refresh.
        optimisticContext?.clearOptimisticEntitlements()
      }
    }
  }, [user?.entitlements, localEntitlements, optimisticContext])

  // Clear streak bonus when server's streakForgiveness updates (via WebSocket)
  useEffect(() => {
    if (localStreakBonus > 0) {
      setLocalStreakBonus(0)
    }
  }, [user?.streakForgiveness])

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

      // Also update global context so sidebar/mobile profile avatar updates instantly
      // Find the newly purchased entitlement and push it to the global context
      const item = getShopItem(itemId)
      if (item) {
        const entitlementId = getEntitlementId(item)
        const purchased = entitlements.find(
          (e) => e.entitlementId === entitlementId
        )
        if (purchased) {
          optimisticContext?.setOptimisticEntitlement(purchased)

          // For exclusive categories, also disable other items in the same category
          // (matching the toggle behavior)
          if (EXCLUSIVE_CATEGORIES.includes(item.category)) {
            const categoryEntitlementIds = getEntitlementIdsForCategory(
              item.category
            )
            for (const ent of entitlements) {
              if (
                categoryEntitlementIds.includes(ent.entitlementId) &&
                ent.entitlementId !== entitlementId &&
                !ent.enabled
              ) {
                optimisticContext?.setOptimisticEntitlement(ent)
              }
            }
          }

          // For items with explicit conflicts, disable conflicting items
          if (item.conflicts?.length) {
            for (const ent of entitlements) {
              if (item.conflicts.includes(ent.entitlementId) && !ent.enabled) {
                optimisticContext?.setOptimisticEntitlement(ent)
              }
            }
          }
        }
      }
    }
    if (itemId === 'streak-forgiveness') {
      setLocalStreakBonus((prev) => prev + 1)
    }
    // Skip confetti for consumables and skins (button customizations)
    const purchasedItem = getShopItem(itemId)
    if (
      purchasedItem?.category !== 'consumable' &&
      purchasedItem?.category !== 'skin'
    ) {
      setJustPurchased(itemId)
      setTimeout(() => setJustPurchased(null), 2500)
    }
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

    // Build optimistic state - update the toggled item AND disable others in same category/team
    setLocalEntitlements((_prev) => {
      // Start with a copy of all effective entitlements to get full picture
      let newState = [...effectiveEntitlements]

      // If enabling an item in an exclusive category, disable others first
      if (actualEnabled && EXCLUSIVE_CATEGORIES.includes(item.category)) {
        const categoryEntitlementIds = getEntitlementIdsForCategory(
          item.category
        )
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

      // If enabling an item with explicit conflicts, disable conflicting items
      if (actualEnabled && item.conflicts?.length) {
        newState = newState.map((e) => {
          if (item.conflicts!.includes(e.entitlementId)) {
            return { ...e, enabled: false }
          }
          return e
        })
      }

      // If enabling a team item, disable items from the opposite team
      if (actualEnabled && item.team) {
        const oppositeTeamIds = getEntitlementIdsForTeam(
          getOppositeTeam(item.team)
        )
        newState = newState.map((e) => {
          if (oppositeTeamIds.includes(e.entitlementId)) {
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
          optimisticContext?.setOptimisticEntitlement({
            ...ent,
            enabled: false,
          })
        }
      }
    }

    // Also update global context for conflicting items we disabled
    if (actualEnabled && item.conflicts?.length) {
      for (const ent of effectiveEntitlements) {
        if (item.conflicts.includes(ent.entitlementId) && ent.enabled) {
          optimisticContext?.setOptimisticEntitlement({
            ...ent,
            enabled: false,
          })
        }
      }
    }

    // Also update global context for opposite team items we disabled
    if (actualEnabled && item.team) {
      const oppositeTeamIds = getEntitlementIdsForTeam(
        getOppositeTeam(item.team)
      )
      for (const ent of effectiveEntitlements) {
        if (oppositeTeamIds.includes(ent.entitlementId) && ent.enabled) {
          optimisticContext?.setOptimisticEntitlement({
            ...ent,
            enabled: false,
          })
        }
      }
    }
  }

  // Get current toggle version for passing to API calls
  const getToggleVersion = () => toggleVersionRef.current

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
          <Row className="text-ink-700 mb-6 items-center gap-4 text-sm">
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

        {/* Featured supporter card */}
        <SupporterCard
          entitlements={effectiveEntitlements}
          onPurchaseComplete={handlePurchaseComplete}
        />

        {/* Sort dropdown */}
        <Row className="mb-4 mt-8 items-center justify-between">
          <span className="text-lg font-semibold">
            Digital goods & cosmetics
          </span>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="bg-canvas-0 border-ink-300 text-ink-700 rounded-md border px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="default">Default order</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
          </select>
        </Row>

        {/* Shop items grid - exclude supporter tiers (handled on /supporter page) */}
        {/* Single column on mobile (<480px), 2 columns on wider screens */}
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
          {sortItems(
            SHOP_ITEMS.filter(
              (item) =>
                !SUPPORTER_ENTITLEMENT_IDS.includes(
                  item.id as (typeof SUPPORTER_ENTITLEMENT_IDS)[number]
                )
            ),
            sortOption
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
                allEntitlements={effectiveEntitlements}
                justPurchased={justPurchased === item.id}
                onPurchaseComplete={handlePurchaseComplete}
                onToggleComplete={handleToggleComplete}
                getToggleVersion={getToggleVersion}
                localStreakBonus={localStreakBonus}
              />
            )
          })}
        </div>

        {/* Charity giveaway card at bottom */}
        <CharityGiveawayCard variant="full" className="mt-8" />

        {isAdminOrMod && <AdminTestingTools user={user} />}
      </Col>
    </Page>
  )
}

function AdminTestingTools(props: { user: User | null | undefined }) {
  const { user } = props
  const [resetting, setResetting] = useState(false)

  const handleResetCosmetics = async () => {
    if (!user) return
    if (
      !confirm(
        'This will delete all your non-subscription cosmetics and refund the mana. Supporter tiers will NOT be affected. Continue?'
      )
    )
      return

    setResetting(true)
    try {
      await api('shop-reset-all', {})
      toast.success('All cosmetics returned and mana refunded!')
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
      <div className="text-ink-400 mt-1 text-xs">
        Refunds all non-subscription purchases. Supporter tiers are preserved.
      </div>
    </div>
  )
}

// Simplified Supporter card that opens a modal
function SupporterCard(props: {
  entitlements?: UserEntitlement[]
  onPurchaseComplete?: (
    itemId: string,
    entitlements?: UserEntitlement[]
  ) => void
}) {
  const { entitlements, onPurchaseComplete } = props
  const user = useUser()
  const [showModal, setShowModal] = useState(false)
  const [hoveredTier, setHoveredTier] = useState<SupporterTier | null>(null)
  const [modalInitialTier, setModalInitialTier] =
    useState<SupporterTier | null>(null)

  const currentTier = getUserSupporterTier(entitlements)
  const supporterEntitlement = getSupporterEnt(entitlements)
  const isSupporter = currentTier !== null

  const daysRemaining = supporterEntitlement?.expiresTime
    ? Math.max(
        0,
        Math.ceil((supporterEntitlement.expiresTime - Date.now()) / DAY_MS)
      )
    : 0
  const isAutoRenewing = supporterEntitlement?.autoRenew ?? false
  const renewalDate = supporterEntitlement?.expiresTime
    ? new Date(supporterEntitlement.expiresTime).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null

  const tierPrices = {
    basic: 500,
    plus: 2500,
    premium: 10000,
  }

  // Reset modal initial tier and hover state when modal closes
  const handleSetShowModal = (open: boolean) => {
    setShowModal(open)
    if (!open) {
      setModalInitialTier(null)
      setHoveredTier(null) // Clear hover state on modal close
    }
  }

  // Check if device supports hover (desktop)
  const supportsHover =
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

  return (
    <>
      <div
        onClick={() => handleSetShowModal(true)}
        className={clsx(
          'group relative mb-4 w-full cursor-pointer overflow-hidden rounded-xl p-1 text-left transition-all duration-300',
          'bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800',
          // Default state (no tier owned, no hover)
          !hoveredTier &&
            !currentTier &&
            'hover:shadow-xl hover:shadow-amber-200/50 dark:hover:shadow-amber-900/30',
          // Owned tier glow (default state when not hovering)
          !hoveredTier &&
            currentTier === 'basic' &&
            'shadow-[0_0_12px_rgba(107,114,128,0.4)] dark:shadow-[0_0_12px_rgba(156,163,175,0.3)]',
          !hoveredTier &&
            currentTier === 'plus' &&
            'animate-glow-indigo-subtle shadow-[0_0_16px_rgba(99,102,241,0.5)] dark:shadow-[0_0_16px_rgba(129,140,248,0.4)]',
          !hoveredTier &&
            currentTier === 'premium' &&
            'animate-glow-amber-subtle shadow-[0_0_20px_rgba(245,158,11,0.5)] dark:shadow-[0_0_20px_rgba(251,191,36,0.4)]',
          // Hovered tier glow (intensified)
          hoveredTier === 'basic' &&
            'shadow-[0_0_20px_rgba(107,114,128,0.6),0_0_30px_rgba(107,114,128,0.3)] dark:shadow-[0_0_24px_rgba(156,163,175,0.5),0_0_36px_rgba(156,163,175,0.25)]',
          hoveredTier === 'plus' &&
            'animate-glow-indigo shadow-[0_0_24px_rgba(99,102,241,0.7),0_0_40px_rgba(99,102,241,0.4)] dark:shadow-[0_0_28px_rgba(129,140,248,0.6),0_0_48px_rgba(129,140,248,0.35)]',
          hoveredTier === 'premium' &&
            'animate-glow-amber shadow-[0_0_28px_rgba(245,158,11,0.7),0_0_50px_rgba(245,158,11,0.4)] dark:shadow-[0_0_32px_rgba(251,191,36,0.6),0_0_56px_rgba(251,191,36,0.35)]'
        )}
      >
        {/* Animated gradient border - color changes based on hovered tier or owned tier */}
        <div
          className={clsx(
            'absolute inset-0 transition-all duration-300',
            // Hovered tier takes priority
            hoveredTier === 'basic' &&
              'bg-gradient-to-r from-gray-400 via-gray-300 to-gray-400 opacity-60 dark:from-gray-500/50 dark:via-gray-400/50 dark:to-gray-500/50 dark:opacity-40',
            hoveredTier === 'plus' &&
              'bg-gradient-to-r from-indigo-400 via-indigo-300 to-indigo-400 opacity-60 dark:from-indigo-500/50 dark:via-indigo-400/50 dark:to-indigo-500/50 dark:opacity-40',
            hoveredTier === 'premium' &&
              'bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 opacity-75 dark:from-amber-500/60 dark:via-yellow-400/60 dark:to-orange-500/60 dark:opacity-50',
            // When not hovering, show owned tier's border color
            !hoveredTier &&
              currentTier === 'basic' &&
              'bg-gradient-to-r from-gray-400 via-gray-300 to-gray-400 opacity-50 group-hover:opacity-60 dark:from-gray-500/50 dark:via-gray-400/50 dark:to-gray-500/50 dark:opacity-30 dark:group-hover:opacity-40',
            !hoveredTier &&
              currentTier === 'plus' &&
              'bg-gradient-to-r from-indigo-400 via-indigo-300 to-indigo-400 opacity-50 group-hover:opacity-60 dark:from-indigo-500/50 dark:via-indigo-400/50 dark:to-indigo-500/50 dark:opacity-30 dark:group-hover:opacity-40',
            !hoveredTier &&
              currentTier === 'premium' &&
              'bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 opacity-50 group-hover:opacity-75 dark:from-amber-500/60 dark:via-yellow-400/60 dark:to-orange-500/60 dark:opacity-30 dark:group-hover:opacity-50',
            // Default (no tier owned, not hovering) - amber/gold default
            !hoveredTier &&
              !currentTier &&
              'bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 opacity-50 group-hover:opacity-75 dark:from-amber-600/50 dark:via-yellow-500/50 dark:to-orange-600/50 dark:opacity-30 dark:group-hover:opacity-50'
          )}
        />

        <div className="bg-canvas-0 relative rounded-lg p-5">
          {/* Header */}
          <Row className="items-start justify-between">
            <Col className="gap-1">
              <Row className="items-center gap-2">
                <FaStar
                  className="h-6 w-6 text-amber-500"
                  style={{
                    filter: 'drop-shadow(0 0 3px rgba(245, 158, 11, 0.5))',
                  }}
                />
                <span className="text-xl font-bold">Manifold Membership</span>
              </Row>
              <p className="text-ink-600 text-sm">Unlock premium benefits</p>
            </Col>
            {isSupporter && (
              <div className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {SUPPORTER_TIERS[currentTier].name.toUpperCase()}
              </div>
            )}
          </Row>

          {/* Profile Preview - horizontal layout like modal */}
          <div className="my-4 rounded-lg bg-gradient-to-r from-amber-50/50 to-orange-50/50 px-4 py-3 dark:from-slate-700/50 dark:to-slate-700/50">
            <Row className="flex-wrap items-center justify-between gap-3">
              {/* Left: Avatar + Name + Current Badge */}
              <Row className="items-center gap-3">
                <Avatar
                  username={user?.username}
                  avatarUrl={user?.avatarUrl}
                  size="md"
                  noLink
                  entitlements={entitlements}
                  displayContext="shop"
                />
                <Col className="gap-0.5">
                  <Row className="items-center gap-1.5">
                    <span className="font-semibold">
                      {user?.name ?? 'YourName'}
                    </span>
                    {/* Show hovered tier star, or current tier star, or nothing */}
                    {(hoveredTier || currentTier) && (
                      <div className="relative">
                        <FaStar
                          className={clsx(
                            'h-4 w-4 transition-colors duration-150',
                            (hoveredTier ?? currentTier) === 'basic' &&
                              'text-gray-400',
                            (hoveredTier ?? currentTier) === 'plus' &&
                              'text-indigo-500',
                            (hoveredTier ?? currentTier) === 'premium' &&
                              'text-amber-500'
                          )}
                          style={
                            (hoveredTier ?? currentTier) === 'premium'
                              ? {
                                  filter:
                                    'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))',
                                }
                              : undefined
                          }
                        />
                        {(hoveredTier ?? currentTier) === 'premium' && (
                          <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-sm" />
                        )}
                      </div>
                    )}
                  </Row>
                  {/* Show hovered tier text, or current tier text, or "Not a member yet" */}
                  {hoveredTier ? (
                    <span
                      className={clsx(
                        'text-sm font-medium transition-colors duration-150',
                        SUPPORTER_TIERS[hoveredTier].textColor
                      )}
                    >
                      Manifold {SUPPORTER_TIERS[hoveredTier].name}
                    </span>
                  ) : isSupporter ? (
                    <span
                      className={clsx(
                        'text-sm font-medium',
                        SUPPORTER_TIERS[currentTier].textColor
                      )}
                    >
                      Manifold {SUPPORTER_TIERS[currentTier].name}
                    </span>
                  ) : (
                    <span className="text-ink-500 text-sm">
                      Not a member yet
                    </span>
                  )}
                </Col>
              </Row>

              {/* Right: Renewal/expiry info (only show if supporter) */}
              {isSupporter && renewalDate && (
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
              )}
            </Row>
          </div>

          {/* Mini Tier Selector (interactive with hover) */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(['basic', 'plus', 'premium'] as const).map((tier) => {
              const isCurrentUserTier = currentTier === tier
              const isHovered = hoveredTier === tier
              return (
                <button
                  key={tier}
                  onClick={(e) => {
                    e.stopPropagation()
                    setModalInitialTier(tier)
                    handleSetShowModal(true)
                  }}
                  onMouseEnter={() => supportsHover && setHoveredTier(tier)}
                  onMouseLeave={() => supportsHover && setHoveredTier(null)}
                  className={clsx(
                    'relative flex flex-col items-center rounded-lg border-2 px-2 py-2 transition-all duration-150',
                    // Current user's tier styling
                    isCurrentUserTier &&
                      tier === 'basic' &&
                      'border-gray-400 bg-gray-50 dark:bg-gray-900/30',
                    isCurrentUserTier &&
                      tier === 'plus' &&
                      'border-indigo-400 bg-indigo-50 shadow-md shadow-indigo-200/50 dark:bg-indigo-950/30',
                    isCurrentUserTier &&
                      tier === 'premium' &&
                      'border-amber-400 bg-amber-50 shadow-lg shadow-amber-200/50 dark:bg-amber-950/30',
                    // Hover styling (when not current tier)
                    !isCurrentUserTier &&
                      isHovered &&
                      tier === 'basic' &&
                      'border-gray-400 bg-gray-50 shadow-[0_0_8px_rgba(107,114,128,0.4)] dark:bg-gray-900/30',
                    !isCurrentUserTier &&
                      isHovered &&
                      tier === 'plus' &&
                      'border-indigo-400 bg-indigo-50 shadow-[0_0_12px_rgba(99,102,241,0.5)] dark:bg-indigo-950/30',
                    !isCurrentUserTier &&
                      isHovered &&
                      tier === 'premium' &&
                      'border-amber-400 bg-amber-50 shadow-[0_0_16px_rgba(245,158,11,0.5)] dark:bg-amber-950/30',
                    // Default state
                    !isCurrentUserTier &&
                      !isHovered &&
                      'border-ink-200 bg-canvas-0 hover:border-ink-300'
                  )}
                >
                  {isCurrentUserTier && (
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded bg-green-500 px-1 text-[8px] font-bold text-white">
                      CURRENT
                    </div>
                  )}
                  <div className="relative">
                    <FaStar
                      className={clsx(
                        'h-4 w-4',
                        tier === 'basic' && 'text-gray-400',
                        tier === 'plus' && 'text-indigo-500',
                        tier === 'premium' && 'text-amber-500'
                      )}
                      style={
                        tier === 'premium'
                          ? {
                              filter:
                                'drop-shadow(0 0 3px rgba(245, 158, 11, 0.5))',
                            }
                          : undefined
                      }
                    />
                    {tier === 'premium' && (
                      <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-40 blur-[2px]" />
                    )}
                  </div>
                  <div
                    className={clsx(
                      'text-xs font-semibold',
                      SUPPORTER_TIERS[tier].textColor
                    )}
                  >
                    {SUPPORTER_TIERS[tier].name}
                  </div>
                  <div className="text-ink-500 text-[10px]">
                    {formatMoney(tierPrices[tier])}
                  </div>
                </button>
              )
            })}
          </div>

          {/* CTA */}
          <div className="text-primary-600 text-center text-sm font-medium group-hover:underline">
            {isSupporter
              ? isAutoRenewing
                ? `Manage Subscription →`
                : 'Resubscribe →'
              : 'See details & subscribe →'}
          </div>
        </div>
      </div>

      <SupporterModal
        open={showModal}
        setOpen={handleSetShowModal}
        entitlements={entitlements}
        onPurchaseComplete={onPurchaseComplete}
        initialTier={modalInitialTier}
      />
    </>
  )
}

// Modal containing the supporter page content
function SupporterModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  entitlements?: UserEntitlement[]
  onPurchaseComplete?: (
    itemId: string,
    entitlements?: UserEntitlement[]
  ) => void
  initialTier?: SupporterTier | null
}) {
  const { open, setOpen, entitlements, onPurchaseComplete, initialTier } = props
  const user = useUser()
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [purchasedTier, setPurchasedTier] = useState<SupporterTier | null>(null)
  const [confirmingPurchase, setConfirmingPurchase] =
    useState<SupporterTier | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [hoveredTier, setHoveredTier] = useState<SupporterTier | null>(null)
  const [selectedTier, setSelectedTier] = useState<SupporterTier>('plus')

  // Reset celebration state and set initial tier when modal opens
  useEffect(() => {
    if (open) {
      setShowCelebration(false)
      setPurchasedTier(null)
      // Set the initial tier if provided, otherwise default to 'plus'
      if (initialTier) {
        setSelectedTier(initialTier)
      }
    }
  }, [open, initialTier])

  const currentTier = getUserSupporterTier(entitlements)
  const currentEntitlement = getSupporterEnt(entitlements)
  const isSupporter = currentTier !== null

  const daysRemaining = currentEntitlement?.expiresTime
    ? Math.max(
        0,
        Math.ceil((currentEntitlement.expiresTime - Date.now()) / DAY_MS)
      )
    : 0
  const isAutoRenewing = currentEntitlement?.autoRenew ?? false
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
          <h2 className="mb-6 text-2xl font-bold">
            You're now a{' '}
            {purchasedTier && (
              <>
                <span className="relative inline-flex">
                  <FaStar
                    className={clsx(
                      'inline h-4 w-4',
                      purchasedTier === 'basic' && 'text-gray-400',
                      purchasedTier === 'plus' && 'text-indigo-500',
                      purchasedTier === 'premium' && 'text-amber-500'
                    )}
                  />
                  {purchasedTier === 'premium' && (
                    <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-[1px]" />
                  )}
                </span>{' '}
                {SUPPORTER_TIERS[purchasedTier].name}
              </>
            )}{' '}
            member!
          </h2>

          <Col className="mb-6 gap-2 text-left">
            {purchasedTier && (
              <>
                <Row className="items-center gap-2">
                  <span>🎯</span>
                  <span>
                    {SUPPORTER_BENEFITS[purchasedTier].questMultiplier}x quest
                    rewards
                  </span>
                </Row>
                {SUPPORTER_BENEFITS[purchasedTier].shopDiscount > 0 && (
                  <Row className="items-center gap-2">
                    <span>💎</span>
                    <span>
                      {Math.round(
                        SUPPORTER_BENEFITS[purchasedTier].shopDiscount * 100
                      )}
                      % shop discount
                    </span>
                  </Row>
                )}
                {SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes > 1 && (
                  <Row className="items-center gap-2">
                    <span>❄️</span>
                    <span>
                      {SUPPORTER_BENEFITS[purchasedTier].maxStreakFreezes} max
                      streak freezes
                    </span>
                  </Row>
                )}
                {SUPPORTER_BENEFITS[purchasedTier].freeLoanRate > 0.01 && (
                  <Row className="items-center gap-2">
                    <span>💰</span>
                    <span>
                      {Math.round(
                        SUPPORTER_BENEFITS[purchasedTier].freeLoanRate * 100
                      )}
                      % daily free loans
                    </span>
                  </Row>
                )}
                {SUPPORTER_BENEFITS[purchasedTier].marginLoanAccess && (
                  <Row className="items-center gap-2">
                    <span>📈</span>
                    <span>
                      {SUPPORTER_BENEFITS[purchasedTier]
                        .maxLoanNetWorthPercent + 1}
                      x leverage boost
                    </span>
                  </Row>
                )}
              </>
            )}
          </Col>

          <Button color="amber" onClick={() => setOpen(false)}>
            Continue
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
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-6 dark:from-slate-800/90 dark:via-slate-800/80 dark:to-slate-800/90">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-200/30 blur-3xl dark:bg-amber-500/10" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-orange-200/30 blur-3xl dark:bg-orange-500/10" />

            <div className="relative">
              {isSupporter ? (
                <Row className="flex-wrap items-center justify-between gap-3">
                  {/* Left: Avatar + Name + Badge (changes on hover/select) */}
                  <Row className="items-center gap-3">
                    <Avatar
                      username={user?.username}
                      avatarUrl={user?.avatarUrl}
                      size="lg"
                      noLink
                      entitlements={entitlements}
                      displayContext="shop"
                    />
                    <Col className="gap-0.5">
                      <Row className="items-center gap-2">
                        <span className="text-lg font-bold">{user?.name}</span>
                        <span className="relative inline-flex">
                          <FaStar
                            className={clsx(
                              'h-4 w-4 transition-colors duration-150',
                              activeTier === 'basic' && 'text-gray-400',
                              activeTier === 'plus' && 'text-indigo-500',
                              activeTier === 'premium' && 'text-amber-500'
                            )}
                          />
                          {activeTier === 'premium' && (
                            <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-[1px]" />
                          )}
                        </span>
                      </Row>
                      <span
                        className={clsx(
                          'text-sm font-medium transition-colors duration-150',
                          SUPPORTER_TIERS[activeTier].textColor
                        )}
                      >
                        Manifold {SUPPORTER_TIERS[activeTier].name}
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

                  {/* Right: Renewal/expiry info */}
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
                </Row>
              ) : (
                <Row className="items-center justify-between gap-4">
                  {/* Left: Avatar + Name + Badge (changes on hover/select) */}
                  <Row className="items-center gap-3">
                    <Avatar
                      username={user?.username}
                      avatarUrl={user?.avatarUrl}
                      size="lg"
                      noLink
                      entitlements={entitlements}
                      displayContext="shop"
                    />
                    <Col className="gap-0.5">
                      <Row className="items-center gap-2">
                        <span className="text-lg font-bold">
                          {user?.name ?? 'You'}
                        </span>
                        <span className="relative inline-flex">
                          <FaStar
                            className={clsx(
                              'h-4 w-4 transition-colors duration-150',
                              activeTier === 'basic' && 'text-gray-400',
                              activeTier === 'plus' && 'text-indigo-500',
                              activeTier === 'premium' && 'text-amber-500'
                            )}
                          />
                          {activeTier === 'premium' && (
                            <FaStar className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-[1px]" />
                          )}
                        </span>
                      </Row>
                      <span
                        className={clsx(
                          'text-sm font-medium transition-colors duration-150',
                          SUPPORTER_TIERS[activeTier].textColor
                        )}
                      >
                        Manifold {SUPPORTER_TIERS[activeTier].name}
                      </span>
                    </Col>
                  </Row>

                  {/* Right: Tagline - hidden on small screens */}
                  <Col className="hidden items-end gap-0.5 sm:flex">
                    <span className="text-ink-600 text-sm font-medium">
                      Manifold Membership
                    </span>
                    <span className="text-ink-500 text-xs">
                      Unlock premium benefits
                    </span>
                  </Col>
                </Row>
              )}
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
            variant="modal"
          />

          {/* Subscribe/Upgrade Button */}
          {activeTier && (
            <SubscribeButton
              tier={activeTier}
              currentTier={currentTier}
              effectiveBalance={effectiveBalance}
              loading={purchasing === TIER_ITEMS[activeTier].id || cancelling}
              disabled={!user || !!purchasing || cancelling}
              entitlements={entitlements}
              currentExpiresTime={currentEntitlement?.expiresTime}
              isAutoRenewing={isAutoRenewing}
              onClick={() => setConfirmingPurchase(activeTier)}
              onCancelClick={() => setConfirmingCancel(true)}
            />
          )}

          {/* Benefits Comparison Table */}
          <BenefitsTable currentTier={currentTier} activeTier={activeTier} />

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
          <Row className="justify-end gap-2">
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
    </>
  )
}

// Preview components for each shop item type

function GoldenBorderPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
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

function ManaAuraPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <div
          className="absolute -inset-1.5 animate-pulse rounded-full opacity-80 blur-md"
          style={{
            background:
              'radial-gradient(circle, rgba(139,92,246,0.6) 0%, rgba(59,130,246,0.4) 50%, rgba(139,92,246,0.2) 100%)',
          }}
        />
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative ring-2 ring-violet-400"
        />
      </div>
    </div>
  )
}

function BlackHolePreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <svg
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: 60, height: 60 }}
          viewBox="0 0 48 48"
        >
          <defs>
            <radialGradient id="bh-accretion-glow-p" cx="24" cy="24" r="24" gradientUnits="userSpaceOnUse">
              <stop offset="60%" stopColor="#000" stopOpacity="0" />
              <stop offset="85%" stopColor="#4b0082" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="24" cy="24" r="23" fill="url(#bh-accretion-glow-p)" />
          <path d="M24 3C35.0457 3 45 11.9543 45 24" stroke="#2d004d" strokeWidth="5" fill="none" opacity="0.7" strokeLinecap="round" />
          <path d="M45 24C45 36.0457 35.0457 45 24 45" stroke="#4b0082" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
          <path d="M24 45C11.9543 45 3 36.0457 3 24" stroke="#1a0033" strokeWidth="6" fill="none" opacity="0.8" strokeLinecap="round" />
          <path d="M3 24C3 11.9543 11.9543 3 24 3" stroke="#6a0dad" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" />
          <path d="M24 7 A17 17 0 0 1 41 24" stroke="#9333ea" strokeWidth="1.5" fill="none" opacity="0.3" strokeDasharray="4 2" />
          <circle cx="38" cy="12" r="0.6" fill="#fff" opacity="0.9" />
          <circle cx="10" cy="36" r="0.4" fill="#ba55d3" opacity="0.7" />
        </svg>
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative ring-2 ring-purple-900"
        />
      </div>
    </div>
  )
}

function FireRingPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <svg
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: 60, height: 60 }}
          viewBox="0 0 48 48"
        >
          <defs>
            <linearGradient id="fire-grad-red-p" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7f1d1d" />
              <stop offset="50%" stopColor="#b91c1c" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <linearGradient id="fire-grad-orange-p" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c2410c" />
              <stop offset="100%" stopColor="#fb923c" />
            </linearGradient>
            <linearGradient id="fire-grad-yellow-p" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fef08a" />
            </linearGradient>
          </defs>
          <path
            d="M24 46 C11.8 46 2 36.2 2 24 C2 13 9.5 3.8 20 2.4 C18 5 17 8 18 11 C19 14 22 16 24 16 C26 16 28 14 29 11 C31 7 34 4 38 6 C43 9 46 16 46 24 C46 36.2 36.2 46 24 46 Z M24 44 C34 44 42 36 42 26 C42 20 38 16 34 14 C32 16 30 20 28 22 C26 24 22 24 20 22 C18 20 16 16 14 14 C10 16 6 20 6 26 C6 36 14 44 24 44 Z"
            fill="url(#fire-grad-red-p)"
            opacity="0.9"
          />
          <path
            d="M24 42 C30 42 36 38 38 32 C39 29 37 26 35 24 C33 22 32 20 32 18 C32 15 34 12 36 10 C34 9 32 8 30 8 C27 8 25 10 24 12 C23 10 21 8 18 8 C16 8 14 9 12 10 C14 12 16 15 16 18 C16 20 15 22 13 24 C11 26 9 29 10 32 C12 38 18 42 24 42 Z"
            fill="url(#fire-grad-orange-p)"
          />
          <path
            d="M24 40 C28 40 32 37 33 33 C33.5 31 32 29 31 27 C30 25 29 23 29 21 C29 19 30 17 31 15 C28 15 26 16 24 18 C22 16 20 15 17 15 C18 17 19 19 19 21 C19 23 18 25 17 27 C16 29 14.5 31 15 33 C16 37 20 40 24 40 Z"
            fill="url(#fire-grad-yellow-p)"
            opacity="0.9"
          />
          <path d="M24 8 C24 8 22 6 21 4 C20.5 3 21 2 21 2 C21 2 22 3 22.5 4 C23 5 24 6 24 6 C24 6 25 5 25.5 4 C26 3 27 2 27 2 C27 2 27.5 3 27 4 C26 6 24 8 24 8" fill="url(#fire-grad-yellow-p)" />
        </svg>
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative ring-2 ring-orange-400"
        />
      </div>
    </div>
  )
}

function BadAuraPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <div className="absolute -inset-1 animate-pulse rounded-full bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-75 blur-sm" />
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative ring-2 ring-red-500"
        />
      </div>
    </div>
  )
}

function AngelWingsPreview(props: { user: User | null | undefined }) {
  const { user } = props

  const wingSvg = (
    <>
      <path
        d="M16 12 C 10.5 2 3.5 4 2.5 12 C 2.1 18 2.1 24 2.5 28 L 4.5 29 L 3.5 36 L 7 38 L 6 44 C 11 40 15 32 16 22 Z"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 13 C 11.5 5 6 6 5 13 C 4.5 18 5 21 6 25 C 10 23 13.5 22 16 20 Z"
        fill="#E2E8F0"
      />
      <path
        d="M16 13 C 12.5 7 8.5 8 7.5 13 C 7.5 16 8 18.5 9 21 C 12 19.5 14.5 19 16 18 Z"
        fill="#E5E7EB"
      />
      <path
        d="M16 13 C 14.2 9.5 11.5 9.5 10.5 12 C 10.5 14 11 15.5 12 17 C 13.5 16.5 15 16.5 16 16 Z"
        fill="#F1F5F9"
      />
    </>
  )

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        {/* Left wing */}
        <svg
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: -10, width: 15, height: 46, opacity: 0.9 }}
          viewBox="0 0 16 44"
        >
          {wingSvg}
        </svg>
        {/* Right wing (mirrored) */}
        <svg
          className="absolute top-1/2"
          style={{
            right: -10,
            width: 15,
            height: 46,
            opacity: 0.9,
            transform: 'translateY(-50%) scaleX(-1)',
          }}
          viewBox="0 0 16 44"
        >
          {wingSvg}
        </svg>
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
      </div>
    </div>
  )
}

function MonoclePreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        {/* Bigger, thicker monocle centered on the right side */}
        <svg
          className="absolute left-1/2 top-1/2"
          style={{
            marginLeft: 3,
            marginTop: -7,
            width: 22,
            height: 22,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="9" fill="rgba(255,255,255,0.1)" stroke="#D4AF37" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="7" fill="none" stroke="#B8860B" strokeWidth="0.5" />
          <ellipse cx="9" cy="9" rx="3" ry="2" fill="rgba(255,255,255,0.4)" />
          <path d="M21 12 Q24 16 22 22" stroke="#D4AF37" strokeWidth="1.5" fill="none" />
          <circle cx="22" cy="22" r="1" fill="#D4AF37" />
        </svg>
      </div>
    </div>
  )
}

function CrystalBallPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        {/* Crystal ball in bottom-right corner, overlapping avatar */}
        <svg
          className="absolute"
          style={{
            right: -6,
            bottom: -5,
            width: 24,
            height: 24,
            filter: 'drop-shadow(0 0 4px rgba(139,92,246,0.6))',
          }}
          viewBox="0 0 24 24"
        >
          <ellipse cx="12" cy="22" rx="5" ry="1.5" fill="#4B5563" />
          <path d="M8 20 L10 22 L14 22 L16 20 Z" fill="#6B7280" />
          <circle cx="12" cy="12" r="10" fill="url(#crystalGradientPrev2)" />
          <circle cx="12" cy="12" r="7" fill="rgba(139,92,246,0.25)" />
          <ellipse cx="12" cy="12" rx="5" ry="3" fill="rgba(167,139,250,0.3)" transform="rotate(-20 12 12)" />
          <circle cx="8" cy="8" r="2" fill="rgba(255,255,255,0.5)" />
          <circle cx="6" cy="10" r="1" fill="rgba(255,255,255,0.3)" />
          <defs>
            <radialGradient id="crystalGradientPrev2" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#E9D5FF" />
              <stop offset="40%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#6D28D9" />
            </radialGradient>
          </defs>
        </svg>
      </div>
    </div>
  )
}

function ThoughtBubblePreview(props: {
  user: User | null | undefined
  type: 'yes' | 'no'
}) {
  const { user, type } = props
  const isYes = type === 'yes'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 pt-6 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: -20 }}>
          <div
            className={clsx(
              'relative rounded-full px-2 py-1 text-white',
              isYes ? 'bg-green-500' : 'bg-red-500'
            )}
            style={{ fontSize: '10px', fontWeight: 'bold' }}
          >
            {isYes ? 'YES' : 'NO'}
            <div
              className={clsx(
                'absolute left-1/2 -translate-x-1/2 rounded-full',
                isYes ? 'bg-green-500' : 'bg-red-500'
              )}
              style={{ bottom: -4, width: 5, height: 5 }}
            />
            <div
              className={clsx(
                'absolute left-1/2 -translate-x-1/2 rounded-full',
                isYes ? 'bg-green-500' : 'bg-red-500'
              )}
              style={{ bottom: -8, width: 3, height: 3 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StonksPreview(props: {
  user: User | null | undefined
  direction: 'up' | 'down'
}) {
  const { user, direction } = props
  const isUp = direction === 'up'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        {/* Stonks meme style chart */}
        <svg
          className="absolute"
          style={{
            right: -8,
            bottom: -6,
            width: 28,
            height: 28,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          <rect x="1" y="1" width="22" height="22" rx="2" fill="#1F2937" opacity="0.9" />
          <line x1="4" y1="18" x2="20" y2="18" stroke="#374151" strokeWidth="0.5" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="#374151" strokeWidth="0.5" />
          <line x1="4" y1="6" x2="20" y2="6" stroke="#374151" strokeWidth="0.5" />
          {isUp ? (
            <>
              <polyline points="4,16 8,14 12,12 16,7 20,4" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polygon points="20,4 17,6 18,8" fill="#22C55E" />
              <polyline points="4,16 8,14 12,12 16,7 20,4" fill="none" stroke="#4ADE80" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
            </>
          ) : (
            <>
              <polyline points="4,6 8,8 12,10 16,15 20,19" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polygon points="20,19 17,17 18,15" fill="#EF4444" />
              <polyline points="4,6 8,8 12,10 16,15 20,19" fill="none" stroke="#FCA5A5" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

function CrownPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
          <LuCrown className="h-5 w-5 text-amber-500 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
        </div>
      </div>
    </div>
  )
}

function GraduationCapPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
          <LuGraduationCap className="h-5 w-5 text-indigo-500 drop-shadow-[0_0_4px_rgba(99,102,241,0.5)]" />
        </div>
      </div>
    </div>
  )
}

// Generic hat preview for new hats
function HatPreview(props: {
  user: User | null | undefined
  hatType:
    | 'top-hat'
    | 'halo'
    | 'propeller-hat'
    | 'wizard-hat'
    | 'tinfoil-hat'
    | 'microphone'
    | 'jester-hat'
    | 'fedora'
    | 'devil-horns'
}) {
  const { user, hatType } = props

  const renderHat = () => {
    switch (hatType) {
      case 'top-hat':
        return (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            {/* Light mode */}
            <GiTopHat
              className="h-5 w-5 text-gray-800 dark:hidden"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
            {/* Dark mode - black with white outline */}
            <GiTopHat
              className="hidden h-5 w-5 text-gray-900 dark:block"
              style={{
                filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)',
              }}
            />
          </div>
        )
      case 'halo':
        return (
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 transition-transform duration-300 group-hover:-translate-y-0.5">
            {/* Light mode - amber gold visible against light backgrounds */}
            <div
              className="dark:hidden"
              style={{
                width: '2.5rem',
                height: '0.6rem',
                borderRadius: '50%',
                transform: 'rotate(-8deg)',
                border: '2px solid rgba(245, 158, 11, 0.9)',
                boxShadow:
                  '0 0 6px rgba(245, 158, 11, 0.5), 0 0 2px rgba(217, 119, 6, 0.8)',
              }}
            />
            {/* Dark mode - white-gold glow visible against dark backgrounds */}
            <div
              className="hidden dark:block"
              style={{
                width: '2.5rem',
                height: '0.6rem',
                borderRadius: '50%',
                transform: 'rotate(-8deg)',
                border: '1.5px solid rgba(255, 250, 220, 0.95)',
                boxShadow:
                  '0 0 6px rgba(255, 255, 255, 0.8), 0 0 12px rgba(255, 255, 200, 0.4)',
              }}
            />
          </div>
        )
      case 'propeller-hat':
        return (
          <div className="absolute -right-1 top-0 rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <div className="relative flex flex-col items-center">
              {/* Beanie dome */}
              <div className="h-2.5 w-5 rounded-t-full bg-red-500" />
              {/* Propeller blades - positioned to overlap beanie top */}
              <div
                className="absolute"
                style={{
                  top: -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  perspective: '80px',
                }}
              >
                <div style={{ transform: 'rotateX(50deg)' }}>
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 18 18"
                    className="animate-spin"
                    style={{ animationDuration: '0.5s' }}
                  >
                    <rect
                      x="1"
                      y="7.5"
                      width="6.5"
                      height="3"
                      rx="1.5"
                      fill="#3B82F6"
                    />
                    <rect
                      x="10.5"
                      y="7.5"
                      width="6.5"
                      height="3"
                      rx="1.5"
                      fill="#EF4444"
                    />
                    <circle cx="9" cy="9" r="2.5" fill="#FBBF24" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )
      case 'wizard-hat':
        return (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 0 3px rgba(139, 92, 246, 0.5))' }}
            >
              <ellipse cx="12" cy="19" rx="11" ry="3.5" fill="#6D28D9" />
              <polygon points="12,1 5,19 19,19" fill="#8B5CF6" />
              <circle cx="11" cy="12" r="1.2" fill="#FBBF24" opacity="0.9" />
            </svg>
          </div>
        )
      case 'tinfoil-hat':
        return (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}
            >
              <path d="M10 2L6 8 4 14 3 20h18l-2-7-2-6-3-4z" fill="#94A3B8" />
              <path
                d="M10 2l2 11-4 7"
                stroke="#CBD5E1"
                strokeWidth="1"
                fill="none"
                opacity="0.5"
              />
              <path
                d="M14 3l-1 12 4 5"
                stroke="#CBD5E1"
                strokeWidth="0.8"
                fill="none"
                opacity="0.4"
              />
              <line
                x1="3"
                y1="20"
                x2="21"
                y2="20"
                stroke="#64748B"
                strokeWidth="0.8"
              />
            </svg>
          </div>
        )
      case 'microphone':
        return (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            {/* Light mode */}
            <GiDunceCap
              className="h-5 w-5 text-gray-900 dark:hidden"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
            {/* Dark mode - black with white outline */}
            <GiDunceCap
              className="hidden h-5 w-5 text-gray-900 dark:block"
              style={{
                filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)',
              }}
            />
          </div>
        )
      case 'jester-hat':
        return (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            >
              {/* Right Flap (Green) */}
              <path d="M12 21L15 13L22 6L12 21Z" fill="#16A34A" />
              <path d="M12 21L22 6L19 16L12 21Z" fill="#14532D" />
              {/* Left Flap (Indigo) - neck + beak */}
              <path d="M12 21L9 13L5 7L12 21Z" fill="#3730A3" />
              <path d="M12 21L5 7L5 16L12 21Z" fill="#312E81" />
              <path d="M5 7L5 10L2 6L5 7Z" fill="#4338CA" />
              {/* Center Flap (Red) - foreground */}
              <path d="M12 21L9 13L12 2L12 21Z" fill="#991B1B" />
              <path d="M12 21L15 13L12 2L12 21Z" fill="#DC2626" />
              {/* Gold Bells */}
              <circle cx="2" cy="6" r="1.5" fill="#FBBF24" />
              <circle cx="22" cy="6" r="1.5" fill="#FBBF24" />
              <circle cx="12" cy="2" r="1.5" fill="#FBBF24" />
            </svg>
          </div>
        )
      case 'fedora':
        return (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            >
              <path d="M6 16 Q6 8 12 8 Q18 8 18 16Z" fill="#78716C" />
              <path
                d="M8 14 Q12 10 16 14"
                stroke="#57534E"
                strokeWidth="0.8"
                fill="none"
              />
              <ellipse cx="12" cy="16" rx="11" ry="3" fill="#78716C" />
              <rect
                x="6"
                y="14"
                width="12"
                height="1.5"
                rx="0.5"
                fill="#44403C"
              />
            </svg>
          </div>
        )
      case 'devil-horns':
        return (
          <>
            {/* Left horn (swapped + tilted outward) */}
            <svg
              className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
              style={{
                left: -3,
                top: -4,
                width: 12,
                height: 12,
                filter: 'drop-shadow(0 0 2px rgba(220, 38, 38, 0.5))',
                transform: 'rotate(-45deg)',
              }}
              viewBox="0 0 16 16"
            >
              <path d="M0 16C0 8 8 2 14 1C11 4 6 12 5 16H0Z" fill="#DC2626" />
              <path d="M5 16C6 12 11 4 14 1C10 6 6 12 5 16Z" fill="#991B1B" />
            </svg>
            {/* Right horn (swapped + tilted outward) */}
            <svg
              className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
              style={{
                right: -3,
                top: -4,
                width: 12,
                height: 12,
                filter: 'drop-shadow(0 0 2px rgba(220, 38, 38, 0.5))',
                transform: 'rotate(45deg)',
              }}
              viewBox="0 0 16 16"
            >
              <path d="M16 16C16 8 8 2 2 1C5 4 10 12 11 16H16Z" fill="#DC2626" />
              <path d="M11 16C10 12 5 4 2 1C6 6 10 12 11 16Z" fill="#991B1B" />
            </svg>
          </>
        )
    }
  }

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        {renderHat()}
      </div>
    </div>
  )
}

function StreakFreezePreview(props: {
  user: User | null | undefined
  localBonus?: number
  allEntitlements?: UserEntitlement[]
}) {
  const { user, localBonus = 0, allEntitlements } = props
  // Include local bonus for optimistic display
  const currentFreezes = (user?.streakForgiveness ?? 0) + localBonus
  // Max is only a purchase cap, not an accumulation cap
  const maxPurchasable = getMaxStreakFreezes(allEntitlements)
  const isAtPurchaseMax = currentFreezes >= maxPurchasable

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <Row className="flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="text-ink-600 text-xs sm:text-sm">Your freezes:</span>
        <Row className="items-center gap-1.5">
          <span className="text-base sm:text-lg">❄️</span>
          {isAtPurchaseMax ? (
            <span className="font-bold text-blue-500">
              {currentFreezes}/{maxPurchasable} owned (max)
            </span>
          ) : (
            <>
              <span className="font-bold text-blue-500">{currentFreezes}</span>
              <span className="text-ink-500">→</span>
              <span className="font-bold text-blue-500">
                {currentFreezes + 1}
              </span>
            </>
          )}
        </Row>
      </Row>
    </div>
  )
}

function PampuSkinPreview() {
  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <Col className="items-center gap-2">
        <span className="text-ink-500 text-xs">Your YES button becomes:</span>
        <Row className="items-center gap-2">
          <Button
            color="green-outline"
            size="sm"
            className="transition-all duration-200 group-hover:scale-105 group-hover:shadow-md group-hover:shadow-green-500/30"
          >
            PAMPU <ArrowUpIcon className="ml-1 h-4 w-4" />
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
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-2 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="bg-canvas-0 divide-ink-300 w-44 origin-center scale-[0.85] divide-y rounded-md shadow-[0_0_15px_rgba(167,139,250,0.5)] ring-2 ring-violet-400 transition-shadow duration-500 group-hover:shadow-[0_0_25px_rgba(167,139,250,0.7)]">
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

function CustomYesButtonPreview(props: {
  selectedText?: YesButtonOption
  onSelect?: (text: YesButtonOption) => void
  owned?: boolean
}) {
  const { selectedText = 'PAMPU', onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, YES_BUTTON_OPTIONS.indexOf(selectedText ?? 'PAMPU'))
  )
  const pendingMetadataRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayText = YES_BUTTON_OPTIONS[previewIndex]

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + YES_BUTTON_OPTIONS.length) % YES_BUTTON_OPTIONS.length
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      // Debounce metadata update
      if (pendingMetadataRef.current) clearTimeout(pendingMetadataRef.current)
      pendingMetadataRef.current = setTimeout(() => {
        onSelect(YES_BUTTON_OPTIONS[newIndex])
      }, 800)
    }
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % YES_BUTTON_OPTIONS.length
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      if (pendingMetadataRef.current) clearTimeout(pendingMetadataRef.current)
      pendingMetadataRef.current = setTimeout(() => {
        onSelect(YES_BUTTON_OPTIONS[newIndex])
      }, 800)
    }
  }

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <span className="text-ink-500 text-xs">Your YES button becomes:</span>
      <Row className="w-full items-center">
        <button
          onClick={cyclePrev}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-start py-2 pl-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="flex items-center justify-center">
          <Button
            color="green-outline"
            size="sm"
            className="transition-all duration-200 group-hover:scale-105 group-hover:shadow-md group-hover:shadow-green-500/30"
          >
            {displayText} <ArrowUpIcon className="ml-1 h-4 w-4" />
          </Button>
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
    </div>
  )
}

function CustomNoButtonPreview(props: {
  selectedText?: NoButtonOption
  onSelect?: (text: NoButtonOption) => void
  owned?: boolean
}) {
  const { selectedText = 'DUMPU', onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, NO_BUTTON_OPTIONS.indexOf(selectedText ?? 'DUMPU'))
  )
  const pendingMetadataRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayText = NO_BUTTON_OPTIONS[previewIndex]

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + NO_BUTTON_OPTIONS.length) % NO_BUTTON_OPTIONS.length
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      if (pendingMetadataRef.current) clearTimeout(pendingMetadataRef.current)
      pendingMetadataRef.current = setTimeout(() => {
        onSelect(NO_BUTTON_OPTIONS[newIndex])
      }, 800)
    }
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % NO_BUTTON_OPTIONS.length
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      if (pendingMetadataRef.current) clearTimeout(pendingMetadataRef.current)
      pendingMetadataRef.current = setTimeout(() => {
        onSelect(NO_BUTTON_OPTIONS[newIndex])
      }, 800)
    }
  }

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <span className="text-ink-500 text-xs">Your NO button becomes:</span>
      <Row className="w-full items-center">
        <button
          onClick={cyclePrev}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-start py-2 pl-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="flex items-center justify-center">
          <Button
            color="red-outline"
            size="sm"
            className="transition-all duration-200 group-hover:scale-105 group-hover:shadow-md group-hover:shadow-red-500/30"
          >
            {displayText} <ArrowDownIcon className="ml-1 h-4 w-4" />
          </Button>
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
    </div>
  )
}

function ItemPreview(props: {
  itemId: string
  user: User | null | undefined
  localStreakBonus?: number
  allEntitlements?: UserEntitlement[]
  entitlement?: UserEntitlement
  onMetadataUpdate?: (metadata: Record<string, any>) => void
}) {
  const {
    itemId,
    user,
    localStreakBonus,
    allEntitlements,
    entitlement,
    onMetadataUpdate,
  } = props

  switch (itemId) {
    case 'avatar-golden-border':
      return <GoldenBorderPreview user={user} />
    case 'avatar-crown':
      return <CrownPreview user={user} />
    case 'avatar-graduation-cap':
      return <GraduationCapPreview user={user} />
    case 'avatar-top-hat':
      return <HatPreview user={user} hatType="top-hat" />
    case 'avatar-halo':
      return <HatPreview user={user} hatType="halo" />
    case 'avatar-propeller-hat':
      return <HatPreview user={user} hatType="propeller-hat" />
    case 'avatar-wizard-hat':
      return <HatPreview user={user} hatType="wizard-hat" />
    case 'avatar-tinfoil-hat':
      return <HatPreview user={user} hatType="tinfoil-hat" />
    case 'avatar-microphone':
      return <HatPreview user={user} hatType="microphone" />
    case 'avatar-jester-hat':
      return <HatPreview user={user} hatType="jester-hat" />
    case 'avatar-fedora':
      return <HatPreview user={user} hatType="fedora" />
    case 'avatar-devil-horns':
      return <HatPreview user={user} hatType="devil-horns" />
    case 'avatar-angel-wings':
      return <AngelWingsPreview user={user} />
    case 'avatar-mana-aura':
      return <ManaAuraPreview user={user} />
    case 'avatar-black-hole':
      return <BlackHolePreview user={user} />
    case 'avatar-fire-ring':
      return <FireRingPreview user={user} />
    case 'avatar-bad-aura':
      return <BadAuraPreview user={user} />
    case 'avatar-monocle':
      return <MonoclePreview user={user} />
    case 'avatar-crystal-ball':
      return <CrystalBallPreview user={user} />
    case 'avatar-thought-yes':
      return <ThoughtBubblePreview user={user} type="yes" />
    case 'avatar-thought-no':
      return <ThoughtBubblePreview user={user} type="no" />
    case 'avatar-stonks-up':
      return <StonksPreview user={user} direction="up" />
    case 'avatar-stonks-down':
      return <StonksPreview user={user} direction="down" />
    case 'streak-forgiveness':
      return (
        <StreakFreezePreview
          user={user}
          localBonus={localStreakBonus}
          allEntitlements={allEntitlements}
        />
      )
    case 'pampu-skin':
      return <PampuSkinPreview />
    case 'hovercard-glow':
      return <HovercardGlowPreview user={user} />
    case 'custom-yes-button':
      return (
        <CustomYesButtonPreview
          selectedText={entitlement?.metadata?.selectedText as YesButtonOption}
          owned={!!entitlement}
          onSelect={
            onMetadataUpdate
              ? (text) => onMetadataUpdate({ selectedText: text })
              : undefined
          }
        />
      )
    case 'custom-no-button':
      return (
        <CustomNoButtonPreview
          selectedText={entitlement?.metadata?.selectedText as NoButtonOption}
          owned={!!entitlement}
          onSelect={
            onMetadataUpdate
              ? (text) => onMetadataUpdate({ selectedText: text })
              : undefined
          }
        />
      )
    default:
      return null
  }
}

function ShopItemCard(props: {
  item: ShopItem
  user: User | null | undefined
  owned: boolean
  entitlement?: UserEntitlement
  allEntitlements?: UserEntitlement[]
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
}) {
  const {
    item,
    user,
    owned,
    entitlement,
    allEntitlements,
    justPurchased,
    onPurchaseComplete,
    onToggleComplete,
    getToggleVersion,
    localStreakBonus,
  } = props
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [purchasing, setPurchasing] = useState(false)

  // Calculate supporter discount
  const shopDiscount = getBenefit(allEntitlements, 'shopDiscount', 0)
  const discountedPrice =
    shopDiscount > 0 ? Math.floor(item.price * (1 - shopDiscount)) : item.price
  const hasDiscount = shopDiscount > 0 && !owned

  const canPurchase = user && user.balance >= discountedPrice
  // Items are toggleable unless they're always enabled (like supporter badges)
  const isToggleable =
    (item.type === 'permanent-toggleable' || item.type === 'time-limited') &&
    !item.alwaysEnabled

  // Use entitlement state directly - optimistic updates handled by parent
  const isEnabled = entitlement?.enabled ?? false

  // Check if streak freeze is at purchase max (only applies to streak-forgiveness item)
  const isStreakFreezeAtMax =
    item.id === 'streak-forgiveness' &&
    user &&
    (user.streakForgiveness ?? 0) + localStreakBonus >=
      getMaxStreakFreezes(allEntitlements)

  // Check if seasonal item is currently unavailable
  const isSeasonalUnavailable =
    item.seasonalAvailability && !isSeasonalItemAvailable(item)

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

  const handleMetadataUpdate = async (metadata: Record<string, any>) => {
    try {
      const result = await api('shop-update-metadata', {
        itemId: item.id,
        metadata,
      })
      // Update parent state with new entitlements (no confetti since skin category is excluded)
      onPurchaseComplete(item.id, result.entitlements)
    } catch (e: any) {
      toast.error(e.message || 'Failed to update selection')
    }
  }

  const cardRef = useRef<HTMLDivElement>(null)

  // Premium items (over 100k mana) get special styling
  const isPremiumItem = item.price >= 100000

  return (
    <>
      <Card
        ref={cardRef}
        className={clsx(
          'group relative flex cursor-default flex-col gap-3 p-4 transition-all duration-200',
          justPurchased && 'ring-2 ring-indigo-500 ring-offset-2',
          !justPurchased && 'hover:-translate-y-1 hover:shadow-xl hover:ring-2',
          !justPurchased &&
            isPremiumItem &&
            'hover:shadow-amber-200/50 hover:ring-amber-500 dark:hover:shadow-amber-900/30',
          !justPurchased &&
            !isPremiumItem &&
            'hover:shadow-indigo-200/50 hover:ring-indigo-500 dark:hover:shadow-indigo-900/30',
          isPremiumItem &&
            'dark:to-yellow-900/15 bg-gradient-to-br from-amber-50/50 to-yellow-50/50 dark:from-amber-900/20'
        )}
      >
        {/* Loading overlay during purchase */}
        {purchasing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 dark:bg-gray-900/80">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span className="text-ink-600 text-xs">Purchasing...</span>
            </div>
          </div>
        )}

        {/* Card header with badge inline */}
        <Row className="items-start justify-between gap-2">
          <div
            className={clsx(
              'text-base font-semibold sm:text-lg',
              isPremiumItem && 'text-amber-700 dark:text-amber-400'
            )}
          >
            {item.name}
          </div>
          {/* OWNED badge for purchased items */}
          {owned && (
            <div
              className={clsx(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs',
                isPremiumItem
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                  : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
              )}
            >
              OWNED
            </div>
          )}
          {/* LEGENDARY badge for premium items (not owned) */}
          {isPremiumItem && !owned && (
            <div className="shrink-0 rounded bg-gradient-to-r from-amber-500 to-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm sm:px-2 sm:text-xs">
              LEGENDARY
            </div>
          )}
        </Row>

        <p className="text-ink-600 text-sm">{item.description}</p>

        {/* Achievement requirement badge */}
        {item.requirement && (
          <div className="rounded-md bg-amber-50 px-2 py-1 dark:bg-amber-900/30">
            <span className="text-xs text-amber-700 dark:text-amber-300">
              🏆 Requires: {item.requirement.description}
            </span>
          </div>
        )}

        {/* Seasonal availability badge */}
        {item.seasonalAvailability && (
          <div
            className={clsx(
              'rounded-md px-2 py-1',
              isSeasonalItemAvailable(item)
                ? 'bg-green-50 dark:bg-green-900/30'
                : 'bg-gray-100 dark:bg-gray-800'
            )}
          >
            <span
              className={clsx(
                'text-xs',
                isSeasonalItemAvailable(item)
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-ink-500'
              )}
            >
              {isSeasonalItemAvailable(item)
                ? '🎉 Available now!'
                : `⏰ ${getSeasonalAvailabilityText(item) ?? 'Limited time'}`}
            </span>
          </div>
        )}

        {/* Live Preview with actual user data */}
        <ItemPreview
          itemId={item.id}
          user={user}
          localStreakBonus={localStreakBonus}
          allEntitlements={allEntitlements}
          entitlement={entitlement}
          onMetadataUpdate={owned ? handleMetadataUpdate : undefined}
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
                Expires {new Date(entitlement.expiresTime).toLocaleDateString()}
              </div>
            )}
            {/* Buy more button for unlimited items (like supporter badges that stack) */}
            {item.limit === 'unlimited' && (
              <Row className="border-ink-200 mt-1 items-center justify-between border-t pt-2">
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
          // Non-owned item layout - stacks vertically on very narrow screens
          <>
            <Col className="mt-auto gap-2 pt-2">
              <Row className="items-center justify-between">
                {hasDiscount ? (
                  <Col className="gap-0.5">
                    <Row className="items-center gap-1.5">
                      <span className="text-ink-400 text-xs line-through">
                        {formatMoney(item.price)}
                      </span>
                      <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/50 dark:text-green-300">
                        -{Math.round(shopDiscount * 100)}%
                      </span>
                    </Row>
                    <div className="font-semibold text-teal-600">
                      {formatMoney(discountedPrice)}
                    </div>
                  </Col>
                ) : (
                  <div className="font-semibold text-teal-600">
                    {formatMoney(item.price)}
                  </div>
                )}

                {/* Buy button inline on wider screens */}
                <div className="hidden min-[480px]:block">
                  {isSeasonalUnavailable ? (
                    <Button size="sm" color="gray" disabled>
                      Not available
                    </Button>
                  ) : isStreakFreezeAtMax ? (
                    <Button size="sm" color="gray" disabled>
                      Max owned
                    </Button>
                  ) : !canPurchase && user ? (
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
                </div>
              </Row>

              {/* Full-width button on narrow screens */}
              <div className="min-[480px]:hidden">
                {isSeasonalUnavailable ? (
                  <Button size="sm" color="gray" disabled className="w-full">
                    Not available
                  </Button>
                ) : isStreakFreezeAtMax ? (
                  <Button size="sm" color="gray" disabled className="w-full">
                    Max owned
                  </Button>
                ) : !canPurchase && user ? (
                  <Link href="/checkout" className="block">
                    <Button size="sm" color="gradient-pink" className="w-full">
                      Buy mana
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    color="indigo"
                    disabled={!user}
                    onClick={() => setShowConfirmModal(true)}
                    className="w-full"
                  >
                    Buy
                  </Button>
                )}
              </div>
            </Col>

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
            {hasDiscount ? (
              <>
                <span className="text-ink-400 line-through">
                  {formatMoney(item.price)}
                </span>{' '}
                <span className="font-semibold text-teal-600">
                  {formatMoney(discountedPrice)}
                </span>
                <span className="ml-1 text-xs text-green-600">
                  ({Math.round(shopDiscount * 100)}% shop discount)
                </span>
              </>
            ) : (
              <span className="font-semibold text-teal-600">
                {formatMoney(item.price)}
              </span>
            )}
            ?
          </p>

          {/* Preview in modal too with actual user data */}
          <ItemPreview
            itemId={item.id}
            user={user}
            localStreakBonus={localStreakBonus}
            allEntitlements={allEntitlements}
            entitlement={entitlement}
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
