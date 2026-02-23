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
  YES_BUTTON_OPTIONS,
  NO_BUTTON_OPTIONS,
  YesButtonOption,
  NoButtonOption,
  SLOT_LABELS,
  getCompatibleSlots,
  EXCLUSIVE_SLOTS,
  getEntitlementIdsForSlot,
  CROWN_POSITION_OPTIONS,
  getMerchItems,
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
import { FaGem, FaLock } from 'react-icons/fa6'
import { LuCrown, LuGraduationCap } from 'react-icons/lu'
import { GiTopHat, GiDunceCap } from 'react-icons/gi'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SPEND_MANA_ENABLED } from 'web/components/nav/sidebar'
import { SEO } from 'web/components/SEO'
import { Avatar, BlueCapSvg, RedCapSvg, GreenCapSvg, BlackCapSvg } from 'web/components/widgets/avatar'
import { Card } from 'web/components/widgets/card'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
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
import {
  CharityGiveawayCard,
  CharityGiveawayData,
} from 'web/components/shop/charity-giveaway-card'
import { CharityChampionCard } from 'web/components/shop/charity-champion-card'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { getAnimationLocationText } from 'common/shop/display-config'

// Check if user owns the item (not expired), regardless of enabled status
const isEntitlementOwned = (e: UserEntitlement) => {
  if (!e.expiresTime) return true
  return e.expiresTime > Date.now()
}

// Default item order (manual curation)
const ITEM_ORDER: Record<string, number> = {
  'streak-forgiveness': 1,
  'avatar-tinfoil-hat': 2,
  'avatar-golden-border': 3,
  'avatar-crown': 4,
  'hovercard-glow': 5,
  'avatar-graduation-cap': 6,
  // Buttons
  'pampu-skin': 10,
  'custom-no-button': 11,
  // Caps
  'avatar-blue-cap': 15,
  'avatar-team-red-hat': 16,
  'avatar-team-green-hat': 17,
  'avatar-black-cap': 18,
  // Hats
  'avatar-top-hat': 20,
  'avatar-wizard-hat': 21,
  'avatar-jester-hat': 22,
  // Avatar effects
  'avatar-crystal-ball': 30,
  'avatar-disguise': 31,
  'avatar-fire-item': 32,
  // Hovercard
  'hovercard-golden-follow': 40,
  'hovercard-royalty': 41,
  'hovercard-trading-floor': 42,
  'hovercard-royal-border': 43,
}

type SortOption =
  | 'default'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc'
  | 'name-desc'

type FilterOption = 'all' | 'hats' | 'avatar' | 'hovercard' | 'buttons' | 'other' | 'merch' | 'seasonal'

const FILTER_CONFIG: Record<FilterOption, { label: string; slots: string[]; special?: boolean }> = {
  all: { label: 'All', slots: [] },
  hats: { label: 'Hats', slots: ['hat'] },
  avatar: { label: 'Avatar', slots: ['profile-border', 'profile-accessory'] },
  hovercard: { label: 'Hovercard', slots: ['hovercard-background', 'hovercard-border', 'unique'] },
  buttons: { label: 'Buttons', slots: ['button-yes', 'button-no'] },
  other: { label: 'Other', slots: ['consumable', 'badge'] },
  merch: { label: 'Merch', slots: [], special: true },
  seasonal: { label: 'Seasonal', slots: [], special: true },
}

const filterItems = (items: ShopItem[], filter: FilterOption): ShopItem[] => {
  if (filter === 'all') return items
  if (filter === 'seasonal') return items.filter((item) => item.seasonalAvailability)
  if (filter === 'merch') return [] // merch handled by separate section
  const allowedSlots = FILTER_CONFIG[filter].slots
  return items.filter((item) => allowedSlots.includes(item.slot))
}

// Check if a filter tab has any visible items (for dynamic tab visibility)
const hasVisibleItems = (
  filter: FilterOption,
  allItems: ShopItem[],
  visibleItemIds: Set<string>,
  showHidden: boolean
): boolean => {
  if (filter === 'all') return true
  if (filter === 'merch') {
    return getMerchItems().some((item) => !item.hidden || showHidden)
  }
  if (filter === 'seasonal') {
    return allItems.some(
      (item) => item.seasonalAvailability && (visibleItemIds.has(item.id) || showHidden)
    )
  }
  const allowedSlots = FILTER_CONFIG[filter].slots
  return allItems.some(
    (item) => allowedSlots.includes(item.slot) && (visibleItemIds.has(item.id) || showHidden)
  )
}

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

  // Fetch charity giveaway data once for both cards
  const { data: charityData, refresh: refreshCharityData } = useAPIGetter(
    'get-charity-giveaway',
    { userId: user?.id }
  )
  const charityGiveawayData = charityData as CharityGiveawayData | undefined
  const isCharityLoading = charityData === undefined

  // Local state for optimistic updates
  const [localEntitlements, setLocalEntitlements] = useState<UserEntitlement[]>(
    []
  )
  const [justPurchased, setJustPurchased] = useState<string | null>(null)
  const [localStreakBonus, setLocalStreakBonus] = useState(0) // Track streak purchases
  const [sortOption, setSortOption] = useState<SortOption>('default')
  const [filterOption, setFilterOption] = useState<FilterOption>('all')
  const [showHidden, setShowHidden] = useState(false)

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
            server.enabled === local.enabled &&
            JSON.stringify(server.metadata ?? null) ===
              JSON.stringify(local.metadata ?? null)
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

  // Set of item IDs that are visible in the shop (for dynamic filter tab visibility)
  const visibleShopItemIds = new Set(
    SHOP_ITEMS.filter(
      (item) =>
        !SUPPORTER_ENTITLEMENT_IDS.includes(item.id as (typeof SUPPORTER_ENTITLEMENT_IDS)[number]) &&
        item.id !== 'charity-champion-trophy' &&
        item.category !== 'merch' &&
        (!item.hidden || ownedItemIds.has(getEntitlementId(item)) ||
          (item.seasonalAvailability && isSeasonalItemAvailable(item)))
    ).map((item) => item.id)
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

          // For exclusive slots, also disable other items in the same slot
          // (matching the toggle behavior)
          if (EXCLUSIVE_SLOTS.includes(item.slot)) {
            const slotEntitlementIds = getEntitlementIdsForSlot(item.slot)
            for (const ent of entitlements) {
              if (
                slotEntitlementIds.includes(ent.entitlementId) &&
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

      // If enabling an item in an exclusive slot, disable others first
      if (actualEnabled && EXCLUSIVE_SLOTS.includes(item.slot)) {
        const slotEntitlementIds = getEntitlementIdsForSlot(item.slot)
        newState = newState.map((e) => {
          if (
            slotEntitlementIds.includes(e.entitlementId) &&
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
    if (actualEnabled && EXCLUSIVE_SLOTS.includes(item.slot)) {
      const slotEntitlementIds = getEntitlementIdsForSlot(item.slot)
      for (const ent of effectiveEntitlements) {
        if (
          slotEntitlementIds.includes(ent.entitlementId) &&
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

  }

  // Callback for metadata-only updates (no confetti, used by style pickers)
  const handleMetadataChange = (
    _itemId: string,
    updatedEntitlement: UserEntitlement
  ) => {
    // Upsert just the changed entitlement into local state
    setLocalEntitlements((prev) => {
      const idx = prev.findIndex(
        (e) => e.entitlementId === updatedEntitlement.entitlementId
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updatedEntitlement
        return next
      }
      return [...prev, updatedEntitlement]
    })
    // Update global context so sidebar/profile avatar updates instantly
    optimisticContext?.setOptimisticEntitlement(updatedEntitlement)
  }

  // Get current toggle version for passing to API calls
  const getToggleVersion = () => toggleVersionRef.current


  return (
    <Page trackPageView="shop page" className="p-3">
      <SEO
        title="Shop"
        description="Spend your mana in the Manifold shop"
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

        {/* Header and sort dropdown */}
        <Row className="mb-2 mt-8 items-center justify-between">
          <span className="text-lg font-semibold">
            Cosmetics & goods
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

        {/* Category filter pills — only show tabs that have visible items */}
        <Row className="mb-4 flex-wrap gap-2">
          {(Object.keys(FILTER_CONFIG) as FilterOption[]).map((filter) => {
            if (!hasVisibleItems(filter, SHOP_ITEMS, visibleShopItemIds, showHidden)) return null
            const isSeasonal = filter === 'seasonal'
            const isActive = filterOption === filter
            return (
              <button
                key={filter}
                onClick={() => setFilterOption(filter)}
                className={clsx(
                  'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                  isActive && isSeasonal
                    ? 'bg-gradient-to-r from-pink-500 to-rose-400 text-white shadow-sm'
                    : isActive
                    ? 'bg-primary-500 text-white'
                    : isSeasonal
                    ? 'bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 hover:from-pink-200 hover:to-rose-200 dark:from-pink-900/30 dark:to-rose-900/30 dark:text-pink-300'
                    : 'bg-canvas-50 text-ink-600 hover:bg-canvas-100'
                )}
              >
                {FILTER_CONFIG[filter].label}
              </button>
            )
          })}
        </Row>

        {/* Shop items grid — hidden when merch filter is active */}
        {filterOption !== 'merch' && (
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
            {sortItems(
              filterItems(
                SHOP_ITEMS.filter(
                  (item) =>
                    !SUPPORTER_ENTITLEMENT_IDS.includes(
                      item.id as (typeof SUPPORTER_ENTITLEMENT_IDS)[number]
                    ) &&
                    item.id !== 'charity-champion-trophy' &&
                    item.category !== 'merch' &&
                    (!item.hidden || showHidden || ownedItemIds.has(getEntitlementId(item)) ||
                      (item.seasonalAvailability && isSeasonalItemAvailable(item)))
                ),
                filterOption
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
                  onMetadataChange={handleMetadataChange}
                  getToggleVersion={getToggleVersion}
                  localStreakBonus={localStreakBonus}
                />
              )
            })}
          </div>
        )}

        {/* Merch section — shown on 'all' and 'merch' filters */}
        {(filterOption === 'all' || filterOption === 'merch') &&
          getMerchItems().filter((item) => !item.hidden || showHidden).length > 0 && (
          <>
            {filterOption !== 'merch' && (
              <Row className="mb-4 mt-8 items-center gap-2">
                <span className="text-lg font-semibold">Merch</span>
                <span className="text-ink-500 text-sm">(Ships worldwide)</span>
              </Row>
            )}
            <div className={clsx(
              'grid grid-cols-1 gap-4 min-[360px]:grid-cols-2',
              filterOption === 'merch' && 'mt-0'
            )}>
              {getMerchItems()
                .filter((item) => !item.hidden || showHidden)
                .map((item) => (
                  <MerchItemCard key={item.id} item={item} user={user} allEntitlements={effectiveEntitlements} />
                ))}
            </div>
          </>
        )}

        {/* Charity giveaway and champion cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <CharityGiveawayCard
            data={charityGiveawayData}
            isLoading={isCharityLoading}
            user={user}
          />
          <CharityChampionCard
            data={charityGiveawayData}
            isLoading={isCharityLoading}
            user={user}
            entitlements={effectiveEntitlements}
            onEntitlementsChange={(newEntitlements) => {
              setLocalEntitlements(newEntitlements)
              refreshCharityData()
            }}
          />
        </div>

        {isAdminOrMod && <AdminTestingTools user={user} showHidden={showHidden} setShowHidden={setShowHidden} />}
      </Col>
    </Page>
  )
}

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IN', name: 'India' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'BE', name: 'Belgium' },
  { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'SG', name: 'Singapore' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'IL', name: 'Israel' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'RO', name: 'Romania' },
  { code: 'HU', name: 'Hungary' },
  { code: 'GR', name: 'Greece' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'TH', name: 'Thailand' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
].sort((a, b) => a.name.localeCompare(b.name))

type ShippingRate = {
  id: string
  name: string
  rate: string
  currency: string
  minDeliveryDays: number
  maxDeliveryDays: number
}

function MerchItemCard(props: {
  item: ShopItem
  user: User | null | undefined
  allEntitlements?: UserEntitlement[]
}) {
  const { item, user, allEntitlements } = props
  const shopDiscount = getBenefit(allEntitlements, 'shopDiscount', 0)
  const discountedPrice = shopDiscount > 0 ? Math.floor(item.price * (1 - shopDiscount)) : item.price
  const hasDiscount = shopDiscount > 0
  const singleVariant = (item.variants ?? []).length === 1
  const [selectedSize, setSelectedSize] = useState<string | null>(
    singleVariant ? (item.variants![0].size) : null
  )
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [showShippingModal, setShowShippingModal] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [fetchingRates, setFetchingRates] = useState(false)
  const [shippingRates, setShippingRates] = useState<ShippingRate[] | null>(null)
  const [selectedShipping, setSelectedShipping] = useState<ShippingRate | null>(null)
  const [shippingInfo, setShippingInfo] = useState({
    name: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  })
  const [showConfirmOrderModal, setShowConfirmOrderModal] = useState(false)
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    if (!showConfirmOrderModal) {
      setCountdown(5)
      return
    }
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [showConfirmOrderModal, countdown])

  const canPurchase = user && user.balance >= discountedPrice
  const variants = item.variants ?? []

  const images = item.merchImages ?? [
    { label: 'Front', url: item.imageUrl || '' },
  ]

  const handleBuyClick = () => {
    if (!selectedSize) {
      toast.error('Please select a size')
      return
    }
    setShowPurchaseModal(true)
  }

  const handleProceedToShipping = () => {
    setShowPurchaseModal(false)
    setShowShippingModal(true)
    setShippingRates(null)
    setSelectedShipping(null)
  }

  const handleGetShippingRates = async () => {
    const variant = variants.find((v) => v.size === selectedSize)
    if (!variant) return

    setFetchingRates(true)
    setShippingRates(null)
    setSelectedShipping(null)

    try {
      const result = await api('shop-shipping-rates', {
        variantId: variant.printfulSyncVariantId,
        address: {
          address1: shippingInfo.address1,
          city: shippingInfo.city,
          state: shippingInfo.state || undefined,
          zip: shippingInfo.zip,
          country: shippingInfo.country,
        },
      })
      setShippingRates(result.rates)
      if (result.rates.length > 0) {
        setSelectedShipping(result.rates[0])
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to get shipping rates')
    } finally {
      setFetchingRates(false)
    }
  }

  const handleSubmitOrder = async () => {
    if (!user || !selectedSize || !selectedShipping) return
    const variant = variants.find((v) => v.size === selectedSize)
    if (!variant) return

    setPurchasing(true)
    try {
      const result = await api('shop-purchase-merch', {
        itemId: item.id,
        variantId: variant.printfulSyncVariantId,
        shipping: shippingInfo,
      })
      toast.success(`Order placed! Order ID: ${result.printfulOrderId}`)
      setShowConfirmOrderModal(false)
      setShowShippingModal(false)
      setSelectedSize(null)
      setShippingRates(null)
      setSelectedShipping(null)
      setShippingInfo({ name: '', address1: '', address2: '', city: '', state: '', zip: '', country: 'US' })
    } catch (e: any) {
      toast.error(e.message || 'Failed to place order')
      setShowConfirmOrderModal(false)
    } finally {
      setPurchasing(false)
    }
  }

  const canGetRates = shippingInfo.address1 && shippingInfo.city && shippingInfo.zip

  return (
    <>
      <Card className="group relative flex flex-col gap-3 p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:ring-2 hover:ring-indigo-500 hover:shadow-indigo-200/50 dark:hover:shadow-indigo-900/30">
        {item.hidden && (
          <div className="absolute right-2 top-2 z-10 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
            Hidden
          </div>
        )}

        {/* Image carousel */}
        <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
          <img
            src={images[currentImageIndex].url}
            alt={`${item.name} - ${images[currentImageIndex].label}`}
            className="h-full w-full object-contain p-2"
          />
          <Row className="absolute bottom-2 left-1/2 -translate-x-1/2 gap-1.5">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentImageIndex(idx)}
                className={clsx(
                  'h-2 w-2 rounded-full transition-all',
                  currentImageIndex === idx
                    ? 'bg-indigo-500 w-4'
                    : 'bg-white/70 hover:bg-white'
                )}
              />
            ))}
          </Row>
          {images.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex((i) => i === 0 ? images.length - 1 : i - 1)}
                className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-white"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentImageIndex((i) => i === images.length - 1 ? 0 : i + 1)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-white"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Title and description */}
        <div className="text-base font-semibold sm:text-lg">{item.name}</div>
        <p className="text-ink-600 text-sm">{item.description}</p>

        {/* Size selector (hidden for single-variant items like one-size caps) */}
        {!singleVariant && (
          <Col className="gap-2">
            <span className="text-ink-600 text-sm font-medium">Select size:</span>
            <Row className="flex-wrap gap-2">
              {variants.map((variant) => (
                <button
                  key={variant.size}
                  onClick={() => setSelectedSize(variant.size)}
                  className={clsx(
                    'rounded-md border-2 px-3 py-1.5 text-sm font-medium transition-all',
                    selectedSize === variant.size
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                      : 'border-ink-200 hover:border-ink-400 text-ink-700'
                  )}
                >
                  {variant.size}
                </button>
              ))}
            </Row>
          </Col>
        )}

        {/* Price and buy button */}
        <Row className="mt-auto items-center justify-between border-t border-ink-200 pt-3">
          <Col>
            <div className="text-lg font-bold text-teal-600">
              {hasDiscount ? formatMoney(discountedPrice) : formatMoney(item.price)}
              {hasDiscount && (
                <span className="ml-1 text-xs text-green-600">
                  ({Math.round(shopDiscount * 100)}% off)
                </span>
              )}
            </div>
            {hasDiscount && (
              <span className="text-ink-400 text-xs line-through">{formatMoney(item.price)}</span>
            )}
            <span className="text-ink-500 text-xs">+ shipping (paid in mana)</span>
            {item.limit === 'one-time' && (
              <Row className="text-ink-500 mt-0.5 items-center gap-1 text-xs">
                <span>Limit 1 per customer</span>
                <InfoTooltip
                  text="We hope to lift this restriction once the mana shop is up and running smoothly!"
                  size="sm"
                />
              </Row>
            )}
          </Col>
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
              disabled={!user || !selectedSize}
              onClick={handleBuyClick}
            >
              {selectedSize ? 'Buy' : 'Select a size'}
            </Button>
          )}
        </Row>
      </Card>

      {/* Purchase confirmation modal */}
      <Modal open={showPurchaseModal} setOpen={setShowPurchaseModal} size="md">
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <div className="text-lg font-semibold">Confirm Purchase</div>
          <p className="text-ink-600">
            You're ordering: <strong>{item.name}</strong>{!singleVariant && <> (Size: {selectedSize})</>}
          </p>
          <p className="text-ink-600">
            Price:{' '}
            <span className="font-semibold text-teal-600">{formatMoney(discountedPrice)}</span>
            {hasDiscount && <span className="text-ink-400 ml-1 text-sm line-through">{formatMoney(item.price)}</span>}
            <span className="text-ink-500 text-sm"> + shipping</span>
          </p>
          <p className="text-ink-500 text-sm">All costs (item + shipping) are paid in mana.</p>

          {/* Size Guide (only for multi-size items like t-shirts) */}
          {!singleVariant && (
            <Col className="bg-canvas-50 gap-2 rounded-lg p-3">
              <div className="text-sm font-semibold">Size Guide (Gildan 64000)</div>
              <div className="overflow-x-auto">
                <table className="text-ink-600 w-full text-xs">
                  <thead>
                    <tr className="border-b border-ink-200">
                      <th className="py-1 pr-3 text-left font-medium">Size</th>
                      <th className="px-2 py-1 text-center font-medium">Chest (in)</th>
                      <th className="px-2 py-1 text-center font-medium">Length (in)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { size: 'S', chest: '34-36', length: '28' },
                      { size: 'M', chest: '38-40', length: '29' },
                      { size: 'L', chest: '42-44', length: '30' },
                      { size: 'XL', chest: '46-48', length: '31' },
                      { size: '2XL', chest: '50-52', length: '32' },
                      { size: '3XL', chest: '54-56', length: '33' },
                    ].map((row) => (
                      <tr key={row.size} className={selectedSize === row.size ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}>
                        <td className="py-1 pr-3 font-medium">{row.size}</td>
                        <td className="px-2 py-1 text-center">{row.chest}</td>
                        <td className="px-2 py-1 text-center">{row.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-ink-500 text-xs">Measurements are approximate. When in doubt, size up!</p>
            </Col>
          )}

          <div className="rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
            <p className="text-blue-700 dark:text-blue-300">
              After confirming, you'll enter your shipping address. Your address is sent directly to our fulfillment partner and <strong>not stored</strong> by Manifold.
            </p>
          </div>

          <Row className="justify-end gap-2">
            <Button color="gray" onClick={() => setShowPurchaseModal(false)}>Cancel</Button>
            <Button color="indigo" onClick={handleProceedToShipping}>Continue to Shipping</Button>
          </Row>
        </Col>
      </Modal>

      {/* Shipping address modal */}
      <Modal open={showShippingModal} setOpen={setShowShippingModal} size="md">
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <div className="text-lg font-semibold">Shipping Address</div>
          <p className="text-ink-500 text-sm">
            Enter your shipping details. This info is sent directly to our fulfillment partner and not stored by Manifold.
          </p>

          <Col className="gap-3">
            <input type="text" placeholder="Full name" value={shippingInfo.name}
              onChange={(e) => setShippingInfo((s) => ({ ...s, name: e.target.value }))}
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <input type="text" placeholder="Street address" value={shippingInfo.address1}
              onChange={(e) => setShippingInfo((s) => ({ ...s, address1: e.target.value }))}
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <input type="text" placeholder="Apt, suite, etc. (optional)" value={shippingInfo.address2}
              onChange={(e) => setShippingInfo((s) => ({ ...s, address2: e.target.value }))}
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <input type="text" placeholder="City" value={shippingInfo.city}
              onChange={(e) => setShippingInfo((s) => ({ ...s, city: e.target.value }))}
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:hidden" />
            <Row className="w-full gap-3">
              <input type="text" placeholder="City" value={shippingInfo.city}
                onChange={(e) => setShippingInfo((s) => ({ ...s, city: e.target.value }))}
                className="border-ink-300 bg-canvas-0 hidden min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:block" />
              <input type="text" placeholder="State" value={shippingInfo.state}
                onChange={(e) => setShippingInfo((s) => ({ ...s, state: e.target.value }))}
                className="border-ink-300 bg-canvas-0 min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-24 sm:flex-none" />
              <input type="text" placeholder="ZIP" value={shippingInfo.zip}
                onChange={(e) => setShippingInfo((s) => ({ ...s, zip: e.target.value }))}
                className="border-ink-300 bg-canvas-0 min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-24 sm:flex-none" />
            </Row>
            <select value={shippingInfo.country}
              onChange={(e) => { setShippingInfo((s) => ({ ...s, country: e.target.value })); setShippingRates(null); setSelectedShipping(null) }}
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </Col>

          {!shippingRates && (
            <Button color="indigo-outline" onClick={handleGetShippingRates} loading={fetchingRates} disabled={!canGetRates} className="w-full">
              {fetchingRates ? 'Getting rates...' : 'Get Shipping Rates'}
            </Button>
          )}

          {shippingRates && shippingRates.length > 0 && (
            <Col className="gap-2">
              <Row className="items-center justify-between">
                <div className="text-sm font-medium">Select shipping option:</div>
                <span className="text-ink-500 text-xs">Prices in mana</span>
              </Row>
              {shippingRates.map((rate) => {
                const shippingMana = Math.round(parseFloat(rate.rate) * 100)
                return (
                  <button key={rate.id} onClick={() => setSelectedShipping(rate)}
                    className={clsx(
                      'flex items-center justify-between rounded-lg border-2 p-3 text-left transition-all',
                      selectedShipping?.id === rate.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                        : 'border-ink-200 hover:border-ink-400'
                    )}>
                    <div>
                      <div className="font-medium">{rate.name}</div>
                      <div className="text-ink-500 text-xs">
                        {rate.minDeliveryDays === rate.maxDeliveryDays
                          ? `${rate.minDeliveryDays} business days`
                          : `${rate.minDeliveryDays}-${rate.maxDeliveryDays} business days`}
                      </div>
                    </div>
                    <div className="font-semibold text-teal-600">{formatMoney(shippingMana)}</div>
                  </button>
                )
              })}
            </Col>
          )}

          {shippingRates && shippingRates.length === 0 && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              No shipping options available for this address. Please check your address details.
            </div>
          )}

          <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <Row className="items-start gap-2">
              <span className="text-amber-700 dark:text-amber-300">
                Please double-check your address. Orders ship directly from our partner and cannot be easily modified after submission.
              </span>
            </Row>
          </div>

          <Row className="justify-end gap-2">
            <Button color="gray" onClick={() => setShowShippingModal(false)}>Back</Button>
            <Button color="indigo" disabled={!shippingInfo.name || !selectedShipping}
              onClick={() => setShowConfirmOrderModal(true)}>
              Place Order ({formatMoney(discountedPrice)}
              {selectedShipping && ` + ${formatMoney(Math.round(parseFloat(selectedShipping.rate) * 100))} shipping`})
            </Button>
          </Row>
        </Col>
      </Modal>

      {/* Final confirmation modal */}
      <Modal open={showConfirmOrderModal} setOpen={setShowConfirmOrderModal} size="md">
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <div className="text-lg font-semibold">Confirm Your Order</div>
          <Col className="bg-canvas-50 gap-3 rounded-lg p-4 text-sm">
            <Row className="justify-between">
              <span className="text-ink-500">Item:</span>
              <span className="font-medium">{item.name}</span>
            </Row>
            {!singleVariant && (
              <Row className="justify-between">
                <span className="text-ink-500">Size:</span>
                <span className="font-medium">{selectedSize}</span>
              </Row>
            )}
            <Row className="justify-between">
              <span className="text-ink-500">Shipping to:</span>
              <span className="font-medium text-right">
                {shippingInfo.name}<br />
                {shippingInfo.address1}{shippingInfo.address2 && `, ${shippingInfo.address2}`}<br />
                {shippingInfo.city}, {shippingInfo.state} {shippingInfo.zip}<br />
                {COUNTRIES.find((c) => c.code === shippingInfo.country)?.name}
              </span>
            </Row>
            {selectedShipping && (
              <Row className="justify-between">
                <span className="text-ink-500">Shipping method:</span>
                <span className="font-medium">
                  {selectedShipping.name} ({selectedShipping.minDeliveryDays === selectedShipping.maxDeliveryDays
                    ? `${selectedShipping.minDeliveryDays} days`
                    : `${selectedShipping.minDeliveryDays}-${selectedShipping.maxDeliveryDays} days`})
                </span>
              </Row>
            )}
            <div className="border-ink-200 my-1 border-t" />
            <Row className="justify-between">
              <span className="text-ink-500">Item price:</span>
              <span className="font-medium">
                {formatMoney(discountedPrice)}
                {hasDiscount && (
                  <span className="text-ink-400 ml-1 text-xs line-through">{formatMoney(item.price)}</span>
                )}
              </span>
            </Row>
            {selectedShipping && (
              <Row className="justify-between">
                <span className="text-ink-500">Shipping:</span>
                <span className="font-medium">{formatMoney(Math.round(parseFloat(selectedShipping.rate) * 100))}</span>
              </Row>
            )}
            <Row className="justify-between text-base font-semibold">
              <span>Total (mana):</span>
              <span className="text-teal-600">
                {formatMoney(discountedPrice + (selectedShipping ? Math.round(parseFloat(selectedShipping.rate) * 100) : 0))}
              </span>
            </Row>
          </Col>

          <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <Row className="items-start gap-2">
              <span className="text-amber-700 dark:text-amber-300">
                Please verify all details above. Orders cannot be modified after submission.
              </span>
            </Row>
          </div>

          <Row className="justify-end gap-2">
            <Button color="gray" onClick={() => setShowConfirmOrderModal(false)}>Go Back</Button>
            <Button color="indigo" loading={purchasing} disabled={countdown > 0 || purchasing} onClick={handleSubmitOrder}>
              {purchasing ? 'Processing...' : countdown > 0 ? `Confirm Order (${countdown})` : 'Confirm Order'}
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}

function AdminTestingTools(props: {
  user: User | null | undefined
  showHidden: boolean
  setShowHidden: (v: boolean) => void
}) {
  const { user, showHidden, setShowHidden } = props
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
      <label className="mt-3 flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(e) => setShowHidden(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
        <span className="text-ink-600 text-sm">Show hidden items</span>
      </label>

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
                      % off shop items
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
          style={{
            width: 64,
            height: 64,
            marginLeft: -8,
            marginTop: -8,
            filter: 'drop-shadow(0 0 8px rgba(147, 51, 234, 0.5))',
          }}
          viewBox="0 0 64 64"
        >
          <defs>
            {/* Bright accretion disk gradient - hot colors */}
            <linearGradient id="bh-accretion-hot-p" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="30%" stopColor="#ec4899" />
              <stop offset="60%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
            {/* Dark void center */}
            <radialGradient id="bh-void-p" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000000" />
              <stop offset="70%" stopColor="#0a0010" />
              <stop offset="100%" stopColor="#1a0030" stopOpacity="0" />
            </radialGradient>
            {/* Outer glow */}
            <radialGradient id="bh-outer-glow-p" cx="50%" cy="50%" r="50%">
              <stop offset="65%" stopColor="transparent" />
              <stop offset="85%" stopColor="#7c3aed" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.05" />
            </radialGradient>
          </defs>

          {/* Outer purple glow */}
          <circle cx="32" cy="32" r="30" fill="url(#bh-outer-glow-p)" />

          {/* Bright accretion disk - tilted ellipse effect with multiple rings */}
          <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-accretion-hot-p)" strokeWidth="4" opacity="0.8" transform="rotate(-20 32 32)" />
          <ellipse cx="32" cy="32" rx="24" ry="8" fill="none" stroke="#f472b6" strokeWidth="2" opacity="0.6" transform="rotate(-20 32 32)" />
          <ellipse cx="32" cy="32" rx="20" ry="6" fill="none" stroke="#c084fc" strokeWidth="1.5" opacity="0.5" transform="rotate(-20 32 32)" />

          {/* Swirling matter streams */}
          <path d="M8 32 Q16 20 32 18 Q48 16 56 28" stroke="#f97316" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />
          <path d="M56 32 Q48 44 32 46 Q16 48 8 36" stroke="#a855f7" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />

          {/* Spiral arms */}
          <path d="M32 4 Q44 8 52 20 Q56 32 48 44" stroke="#ec4899" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />
          <path d="M32 60 Q20 56 12 44 Q8 32 16 20" stroke="#8b5cf6" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />

          {/* Bright hot spots in the disk */}
          <circle cx="12" cy="28" r="2" fill="#fbbf24" opacity="0.9" />
          <circle cx="52" cy="36" r="2" fill="#fb923c" opacity="0.9" />
          <circle cx="20" cy="40" r="1.5" fill="#f472b6" opacity="0.8" />
          <circle cx="44" cy="24" r="1.5" fill="#c084fc" opacity="0.8" />

          {/* Infalling particles/stars */}
          <circle cx="6" cy="20" r="1" fill="#fff" opacity="0.9" />
          <circle cx="58" cy="44" r="1" fill="#fff" opacity="0.9" />
          <circle cx="24" cy="6" r="0.8" fill="#e9d5ff" opacity="0.8" />
          <circle cx="40" cy="58" r="0.8" fill="#fce7f3" opacity="0.8" />
          <circle cx="10" cy="48" r="0.6" fill="#ddd6fe" opacity="0.7" />
          <circle cx="54" cy="16" r="0.6" fill="#fbcfe8" opacity="0.7" />
        </svg>
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative ring-1 ring-purple-500/40 shadow-[0_0_6px_rgba(147,51,234,0.5)]"
        />
      </div>
    </div>
  )
}

function FireItemPreview(props: { user: User | null | undefined }) {
  const { user } = props

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative h-fit w-fit">
        <style>{`
          @keyframes preview-ember-1 {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            100% { transform: translate(4px, -15px) scale(0); opacity: 0; }
          }
          @keyframes preview-ember-2 {
            0% { transform: translate(0, 0) scale(1); opacity: 0.8; }
            100% { transform: translate(-2px, -12px) scale(0); opacity: 0; }
          }
          @keyframes preview-ember-3 {
            0% { transform: translate(0, 0) scale(1); opacity: 0.9; }
            100% { transform: translate(1px, -18px) scale(0); opacity: 0; }
          }
          @keyframes preview-wisp-1 {
            0%, 100% { transform: translateX(0) translateY(0); }
            50% { transform: translateX(6px) translateY(-1.5px); }
          }
          @keyframes preview-wisp-2 {
            0%, 100% { transform: translateX(0) translateY(0); }
            50% { transform: translateX(5px) translateY(1px); }
          }
          @keyframes preview-wisp-3 {
            0%, 100% { transform: translateX(0) translateY(0); }
            50% { transform: translateX(4px) translateY(-1px); }
          }
          @keyframes preview-flame-smoke-1 {
            0% { transform: translate(0, 0); opacity: 0.7; }
            50% { transform: translate(-6px, -8px); opacity: 0.4; }
            100% { transform: translate(-12px, -14px); opacity: 0; }
          }
          @keyframes preview-flame-smoke-2 {
            0% { transform: translate(0, 0); opacity: 0.6; }
            50% { transform: translate(-4px, -7px); opacity: 0.3; }
            100% { transform: translate(-8px, -12px); opacity: 0; }
          }
        `}</style>

        {/* Background: fiery glow concentrated at bottom-right where flames are */}
        <div
          className="absolute -inset-1.5 animate-pulse rounded-full blur-[5px]"
          style={{
            background:
              'radial-gradient(ellipse at 70% 75%, rgba(249,115,22,0.7) 0%, rgba(234,88,12,0.5) 25%, rgba(220,38,38,0.3) 45%, rgba(180,83,9,0.15) 65%, transparent 85%)',
          }}
        />

        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative"
        />

        {/* Flame cluster — ON TOP of avatar, unclipped so flames at edge are visible */}
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 overflow-visible"
          style={{ width: 66, height: 66 }}
          viewBox="0 0 80 80"
          fill="none"
        >
          {/* Top flame cluster — ~4.5 o'clock */}
          <path d="M60,59 C62,59 64,58 66,55 C68,51 66,47 65,44 C64,47 62,51 60,53 C58,55 59,57 60,59Z" fill="#f97316" className="origin-[60px_59px] scale-110 opacity-90" />
          <path d="M56,59 C58,59 60,58 61,56 C61,53 60,51 59,49 C58,51 57,53 55,55 C55,57 55,58 56,59Z" fill="#dc2626" className="origin-[56px_59px] scale-110 opacity-80" />
          <path d="M64,53 C65,53 66,52 67,50 C68,48 67,46 66.5,45 C66,46 65,48 64,49 C63,50 63.5,52 64,53Z" fill="#fbbf24" className="origin-[64px_53px] scale-125 opacity-70" />
          {/* Mini flame cluster — ~5 o'clock */}
          <path d="M54,65 C56,65 57,64 58,62 C59,60 58,58 57,56 C57,58 56,60 55,61 C54,63 54,64 54,65Z" fill="#f97316" className="origin-[54px_65px] scale-110 opacity-85" />
          <path d="M51,66 C52,66 53,65 54,64 C54,62 53,61 53,60 C52,61 52,62 51,63 C50,64 51,65 51,66Z" fill="#dc2626" className="origin-[51px_66px] scale-110 opacity-75" />
          <path d="M57,61 C58,61 58,60 59,59 C59,58 58,57 58,56 C58,57 57,58 57,59 C57,60 57,60 57,61Z" fill="#fbbf24" className="origin-[57px_61px] scale-125 opacity-65" />
          {/* Primary flame cluster — ~5.5 o'clock, spilling right */}
          <path d="M56,70 C54,70 52,69 51,67 C51,64 52,62 53,60 C54,63 55,65 56,67 C57,68 57,69 56,70Z" fill="#f59e0b" className="origin-[56px_70px] scale-110 opacity-75" />
          <path d="M52,72 C50,72 48,71 48,69 C47,66 48,64 49,62 C50,65 51,67 52,69 C52,70 52,71 52,72Z" fill="#ea580c" className="origin-[52px_72px] scale-110 opacity-75" />
          <path d="M52,72 C54,72 56,71 58,68 C60,64 58,60 57,57 C56,60 54,64 52,66 C50,68 51,70 52,72Z" fill="#f97316" className="origin-[52px_72px] scale-110 opacity-90" />
          <path d="M56,66 C57,66 58,65 59,63 C60,61 59,59 58.5,58 C58,59 57,61 56,62 C55,63 55.5,65 56,66Z" fill="#fbbf24" className="origin-[56px_66px] scale-125 opacity-70" />
        </svg>

        {/* Smoke wisps drifting over flames — CSS divs for reliable animation */}
        <div
          className="pointer-events-none absolute z-20"
          style={{
            right: '-2%', bottom: '20%',
            width: '16px', height: '3px',
            background: 'linear-gradient(135deg, rgba(200,200,210,0.7) 0%, rgba(160,165,175,0.4) 60%, transparent 100%)',
            borderRadius: '2px',
            filter: 'blur(1.5px)',
            animation: 'preview-flame-smoke-1 2.5s ease-out infinite',
          }}
        />
        <div
          className="pointer-events-none absolute z-20"
          style={{
            right: '2%', bottom: '26%',
            width: '12px', height: '2.5px',
            background: 'linear-gradient(135deg, rgba(180,185,195,0.6) 0%, rgba(160,165,175,0.3) 60%, transparent 100%)',
            borderRadius: '2px',
            filter: 'blur(1px)',
            animation: 'preview-flame-smoke-2 3s ease-out infinite',
            animationDelay: '0.6s',
          }}
        />

        {/* Clipped overlay — wisps, flame smoke, embers (clipped to avatar circle) */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-full">
          {/* Fiery light cast — same radial gradient as background glow, overlaying the avatar */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 70% 75%, rgba(249,115,22,0.35) 0%, rgba(234,88,12,0.2) 25%, rgba(220,38,38,0.1) 45%, transparent 70%)',
            }}
          />
          {/* Wispy smoke streaks */}
          <div style={{ position: 'absolute', left: '10%', top: '55%', width: '80%', height: '4px', background: 'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.45) 20%, rgba(180,185,195,0.3) 60%, transparent 100%)', borderRadius: '2px', filter: 'blur(1.5px)', animation: 'preview-wisp-1 4s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', left: '5%', top: '40%', width: '65%', height: '3.5px', background: 'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.4) 30%, rgba(180,185,195,0.25) 70%, transparent 100%)', borderRadius: '2px', filter: 'blur(2px)', animation: 'preview-wisp-2 5s ease-in-out infinite', animationDelay: '0.8s' }} />
          <div style={{ position: 'absolute', left: '20%', top: '68%', width: '70%', height: '3.5px', background: 'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.42) 25%, rgba(180,185,195,0.28) 55%, transparent 100%)', borderRadius: '2px', filter: 'blur(1.5px)', animation: 'preview-wisp-3 4.5s ease-in-out infinite', animationDelay: '1.5s' }} />
          {/* Ember particles — above the flames */}
          <div className="absolute h-[2px] w-[2px] rounded-full bg-amber-400" style={{ left: '70%', top: '60%', boxShadow: '0 0 3px #fbbf24', animation: 'preview-ember-1 1.5s infinite ease-out' }} />
          <div className="absolute h-[1.5px] w-[1.5px] rounded-full bg-orange-500" style={{ left: '66%', top: '66%', animation: 'preview-ember-2 2s infinite ease-out', animationDelay: '0.2s' }} />
          <div className="absolute h-[1.5px] w-[1.5px] rounded-full bg-red-500 opacity-80" style={{ left: '76%', top: '54%', animation: 'preview-ember-3 1.8s infinite ease-out', animationDelay: '0.5s' }} />
        </div>
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
      <div className="relative isolate">
        {/* Left wing — behind avatar via negative z */}
        <svg
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: -10, width: 15, height: 46, opacity: 0.9, zIndex: -1 }}
          viewBox="0 0 16 44"
        >
          {wingSvg}
        </svg>
        {/* Right wing (mirrored) — behind avatar via negative z */}
        <svg
          className="absolute top-1/2"
          style={{
            right: -10,
            width: 15,
            height: 46,
            opacity: 0.9,
            transform: 'translateY(-50%) scaleX(-1)',
            zIndex: -1,
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
        {/* Monocle over left eye area (viewer's right) — matches real avatar placement */}
        <svg
          className="absolute"
          style={{
            left: 6,
            top: 8,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          {/* Gold frame */}
          <circle cx="12" cy="12" r="10" fill="rgba(200,220,255,0.15)" stroke="#D4AF37" strokeWidth="2.5" />
          {/* Inner ring detail */}
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="#B8860B" strokeWidth="0.5" />
          {/* Glass reflection */}
          <ellipse cx="9" cy="9" rx="3" ry="2" fill="rgba(255,255,255,0.5)" />
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
        {/* Crystal ball with base in bottom-right corner */}
        <svg
          className="absolute"
          style={{
            right: -4,
            bottom: -4,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.6))',
          }}
          viewBox="0 0 24 24"
        >
          <defs>
            <radialGradient id="crystalGradientPrev2" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#E9D5FF" />
              <stop offset="40%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#6D28D9" />
            </radialGradient>
          </defs>
          {/* Base */}
          <ellipse cx="12" cy="22.5" rx="6" ry="1.5" fill="#8B6914" />
          {/* Stem */}
          <rect x="9.5" y="19" width="5" height="3.5" rx="0.5" fill="#B8860B" />
          {/* Cradle */}
          <path d="M5 16 Q5 20.5 12 20.5 Q19 20.5 19 16" fill="#D4AF37" />
          {/* Ball */}
          <circle cx="12" cy="9.5" r="8.5" fill="url(#crystalGradientPrev2)" />
          <circle cx="12" cy="9.5" r="5.5" fill="rgba(139,92,246,0.3)" />
          <circle cx="9" cy="6.5" r="2" fill="rgba(255,255,255,0.6)" />
          <circle cx="7" cy="9" r="0.8" fill="rgba(255,255,255,0.4)" />
        </svg>
      </div>
    </div>
  )
}

function DisguisePreview(props: { user: User | null | undefined }) {
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
        {/* Silly glasses with nose - Groucho Marx style */}
        <svg
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: 8,
            width: 28,
            height: 20,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
          viewBox="0 0 32 22"
        >
          {/* Left lens */}
          <circle cx="8" cy="8" r="6" fill="rgba(200,220,255,0.2)" stroke="#1F2937" strokeWidth="2" />
          {/* Right lens */}
          <circle cx="24" cy="8" r="6" fill="rgba(200,220,255,0.2)" stroke="#1F2937" strokeWidth="2" />
          {/* Bridge */}
          <path d="M14 8 Q16 6 18 8" stroke="#1F2937" strokeWidth="2" fill="none" />
          {/* Left temple hint */}
          <line x1="2" y1="8" x2="0" y2="7" stroke="#1F2937" strokeWidth="1.5" />
          {/* Right temple hint */}
          <line x1="30" y1="8" x2="32" y2="7" stroke="#1F2937" strokeWidth="1.5" />
          {/* Big silly nose */}
          <ellipse cx="16" cy="15" rx="4" ry="5" fill="#FBBF8E" />
          <ellipse cx="16" cy="16" rx="3.5" ry="4" fill="#F5A67A" />
          {/* Nose highlight */}
          <ellipse cx="14.5" cy="13" rx="1.5" ry="2" fill="rgba(255,255,255,0.3)" />
          {/* Nostril hints */}
          <ellipse cx="14.5" cy="18" rx="1" ry="0.8" fill="#E08B65" />
          <ellipse cx="17.5" cy="18" rx="1" ry="0.8" fill="#E08B65" />
          {/* Bushy eyebrows */}
          <path d="M3 3 Q8 1 13 4" stroke="#4B3621" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M19 4 Q24 1 29 3" stroke="#4B3621" strokeWidth="2" strokeLinecap="round" fill="none" />
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
  const bgColor = isYes ? 'bg-green-500' : 'bg-red-500'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative">
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
        />
        {/* Thought bubble in top-left corner with trailing bubbles */}
        <div
          className="absolute"
          style={{
            top: -10,
            left: -8,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        >
          {/* Main bubble */}
          <div
            className={clsx('rounded-full px-1 py-0.5 text-white', bgColor)}
            style={{ fontSize: '8px', fontWeight: 'bold' }}
          >
            {isYes ? 'YES' : 'NO'}
          </div>
          {/* Trailing bubbles */}
          <div
            className={clsx('absolute rounded-full', bgColor)}
            style={{ width: 4, height: 4, right: -2, bottom: -3 }}
          />
          <div
            className={clsx('absolute rounded-full', bgColor)}
            style={{ width: 2.5, height: 2.5, right: -4, bottom: -5.5 }}
          />
        </div>
      </div>
    </div>
  )
}

function ArrowPreview(props: {
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
        {/* Arrow badge in bottom-right corner */}
        <svg
          className="absolute"
          style={{
            right: -4,
            bottom: -4,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          <defs>
            <linearGradient id={isUp ? 'arrow-up-prev' : 'arrow-down-prev'} x1="0%" y1={isUp ? '100%' : '0%'} x2="100%" y2={isUp ? '0%' : '100%'}>
              <stop offset="0%" stopColor={isUp ? '#15803d' : '#fca5a5'} />
              <stop offset="50%" stopColor={isUp ? '#22c55e' : '#ef4444'} />
              <stop offset="100%" stopColor={isUp ? '#4ade80' : '#b91c1c'} />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="11" fill="#1f2937" />
          {isUp ? (
            <path d="M12 4 L18 12 L14 12 L14 20 L10 20 L10 12 L6 12 Z" fill="url(#arrow-up-prev)" />
          ) : (
            <path d="M12 20 L18 12 L14 12 L14 4 L10 4 L10 12 L6 12 Z" fill="url(#arrow-down-prev)" />
          )}
        </svg>
      </div>
    </div>
  )
}

function StonksMemePreview(props: { user: User | null | undefined }) {
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
        {/* Iconic diagonal STONKS meme arrow - overlays the avatar */}
        <svg
          className="absolute pointer-events-none"
          style={{
            left: '60%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 44,
            height: 44,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            zIndex: 10,
          }}
          viewBox="0 0 64 64"
        >
          <defs>
            <linearGradient id="stonks-meme-top" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
            <linearGradient id="stonks-meme-side" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
          </defs>
          {/* 3D Depth/Side */}
          <path d="M27 50L47 21L43 17L62 6L57 28L53 24L33 54Z" fill="url(#stonks-meme-side)" />
          {/* Main Face */}
          <path d="M25 48L45 19L41 15L60 4L55 26L51 22L31 52Z" fill="url(#stonks-meme-top)" />
        </svg>
      </div>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const RED_CAP_STYLE_LABELS = ['Classic', 'Mini', 'MANA', 'MANA Left', 'Left', 'Mini Left', 'MANA Right', 'Right', 'Mini Right']
const RED_CAP_STYLE_COUNT = RED_CAP_STYLE_LABELS.length

function RedCapStylePreview(props: {
  user: User | null | undefined
  selectedStyle?: number
  onSelect?: (style: number) => void
  owned?: boolean
}) {
  const { user, selectedStyle = 0, onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, Math.min(selectedStyle, RED_CAP_STYLE_COUNT - 1))
  )

  const isSmall = previewIndex === 1 || previewIndex === 5 || previewIndex === 8
  const isFrontFacing = previewIndex <= 2
  const capW = isSmall ? 24 : 30

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + RED_CAP_STYLE_COUNT) % RED_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % RED_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <Row className="w-full items-center">
        <button
          onClick={cyclePrev}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-start py-2 pl-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="relative">
          <Avatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="lg"
            noLink
          />
          <div
            className="absolute transition-all duration-200"
            style={{
              left: '50%',
              transform: isFrontFacing ? 'translateX(-50%)' : 'translateX(-50%) rotate(-5deg)',
              top: -7,
              width: capW,
              height: capW,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            }}
          >
            <RedCapSvg style={previewIndex} />
          </div>
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
      <span className="text-ink-500 text-xs">{RED_CAP_STYLE_LABELS[previewIndex]}</span>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const BLUE_CAP_STYLE_LABELS = ['Classic', 'Mini', 'MANA', 'MANA Left', 'Left', 'Mini Left', 'MANA Right', 'Right', 'Mini Right']
const BLUE_CAP_STYLE_COUNT = BLUE_CAP_STYLE_LABELS.length

function BlueCapStylePreview(props: {
  user: User | null | undefined
  selectedStyle?: number
  onSelect?: (style: number) => void
  owned?: boolean
}) {
  const { user, selectedStyle = 0, onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, Math.min(selectedStyle, BLUE_CAP_STYLE_COUNT - 1))
  )

  const isSmall = previewIndex === 1 || previewIndex === 5 || previewIndex === 8
  const isFrontFacing = previewIndex <= 2
  const capW = isSmall ? 24 : 30

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + BLUE_CAP_STYLE_COUNT) % BLUE_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % BLUE_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <Row className="w-full items-center">
        <button
          onClick={cyclePrev}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-start py-2 pl-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="relative">
          <Avatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="lg"
            noLink
          />
          <div
            className="absolute transition-all duration-200"
            style={{
              left: '50%',
              transform: isFrontFacing ? 'translateX(-50%)' : 'translateX(-50%) rotate(-5deg)',
              top: -7,
              width: capW,
              height: capW,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            }}
          >
            <BlueCapSvg style={previewIndex} />
          </div>
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
      <span className="text-ink-500 text-xs">{BLUE_CAP_STYLE_LABELS[previewIndex]}</span>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const GREEN_CAP_STYLE_LABELS = ['Classic', 'Mini', 'MANA', 'MANA Left', 'Left', 'Mini Left', 'MANA Right', 'Right', 'Mini Right']
const GREEN_CAP_STYLE_COUNT = GREEN_CAP_STYLE_LABELS.length

function GreenCapStylePreview(props: {
  user: User | null | undefined
  selectedStyle?: number
  onSelect?: (style: number) => void
  owned?: boolean
}) {
  const { user, selectedStyle = 0, onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, Math.min(selectedStyle, GREEN_CAP_STYLE_COUNT - 1))
  )

  const isSmall = previewIndex === 1 || previewIndex === 5 || previewIndex === 8
  const isFrontFacing = previewIndex <= 2
  const capW = isSmall ? 24 : 30

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + GREEN_CAP_STYLE_COUNT) % GREEN_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % GREEN_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <Row className="w-full items-center">
        <button
          onClick={cyclePrev}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-start py-2 pl-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="relative">
          <Avatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="lg"
            noLink
          />
          <div
            className="absolute transition-all duration-200"
            style={{
              left: '50%',
              transform: isFrontFacing ? 'translateX(-50%)' : 'translateX(-50%) rotate(-5deg)',
              top: -7,
              width: capW,
              height: capW,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            }}
          >
            <GreenCapSvg style={previewIndex} />
          </div>
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
      <span className="text-ink-500 text-xs">{GREEN_CAP_STYLE_LABELS[previewIndex]}</span>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const BLACK_CAP_STYLE_LABELS = ['Classic', 'Mini', 'MANA', 'MANA Left', 'Left', 'Mini Left', 'MANA Right', 'Right', 'Mini Right']
const BLACK_CAP_STYLE_COUNT = BLACK_CAP_STYLE_LABELS.length

function BlackCapStylePreview(props: {
  user: User | null | undefined
  selectedStyle?: number
  onSelect?: (style: number) => void
  owned?: boolean
}) {
  const { user, selectedStyle = 0, onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, Math.min(selectedStyle, BLACK_CAP_STYLE_COUNT - 1))
  )

  const isSmall = previewIndex === 1 || previewIndex === 5 || previewIndex === 8
  const isFrontFacing = previewIndex <= 2
  const capW = isSmall ? 24 : 30

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + BLACK_CAP_STYLE_COUNT) % BLACK_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % BLACK_CAP_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <Row className="w-full items-center">
        <button
          onClick={cyclePrev}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-start py-2 pl-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="relative">
          <Avatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="lg"
            noLink
          />
          <div
            className="absolute transition-all duration-200"
            style={{
              left: '50%',
              transform: isFrontFacing ? 'translateX(-50%)' : 'translateX(-50%) rotate(-5deg)',
              top: -7,
              width: capW,
              height: capW,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            }}
          >
            <BlackCapSvg style={previewIndex} />
          </div>
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
      <span className="text-ink-500 text-xs">{BLACK_CAP_STYLE_LABELS[previewIndex]}</span>
    </div>
  )
}

function BullHornsPreview(props: { user: User | null | undefined }) {
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
        {/* Left horn - thick throughout curve, 4-stop gradient */}
        <svg
          className="absolute"
          style={{
            right: '50%',
            top: -11,
            width: 32,
            height: 24,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
          viewBox="0 0 32 24"
        >
          <defs>
            <linearGradient id="bull-preview-left" gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="4" y2="4">
              <stop offset="0%" stopColor="#D4A574" />
              <stop offset="35%" stopColor="#8B6914" />
              <stop offset="70%" stopColor="#5C3D1A" />
              <stop offset="100%" stopColor="#2C1A0A" />
            </linearGradient>
          </defs>
          <path
            d="M30 23 L16 23 C8 23 3 20 3 4 C3 8 6 13 10 16 C14 18 20 18 30 15 Z"
            fill="url(#bull-preview-left)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
        </svg>
        {/* Right horn (mirrored) */}
        <svg
          className="absolute"
          style={{
            left: '50%',
            top: -11,
            width: 32,
            height: 24,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            transform: 'scaleX(-1)',
          }}
          viewBox="0 0 32 24"
        >
          <defs>
            <linearGradient id="bull-preview-right" gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="4" y2="4">
              <stop offset="0%" stopColor="#D4A574" />
              <stop offset="35%" stopColor="#8B6914" />
              <stop offset="70%" stopColor="#5C3D1A" />
              <stop offset="100%" stopColor="#2C1A0A" />
            </linearGradient>
          </defs>
          <path
            d="M30 23 L16 23 C8 23 3 20 3 4 C3 8 6 13 10 16 C14 18 20 18 30 15 Z"
            fill="url(#bull-preview-right)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}

function BearEarsPreview(props: { user: User | null | undefined }) {
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
        {/* Left ear */}
        <svg
          className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
          style={{
            left: -4,
            top: -7,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" fill="#78350F" />
          <circle cx="12" cy="12" r="6" fill="#FBBF24" opacity="0.6" />
        </svg>
        {/* Right ear */}
        <svg
          className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
          style={{
            right: -4,
            top: -7,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" fill="#78350F" />
          <circle cx="12" cy="12" r="6" fill="#FBBF24" opacity="0.6" />
        </svg>
      </div>
    </div>
  )
}

function SantaHatPreview(props: { user: User | null | undefined }) {
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
        {/* Santa hat - tapered cone with connected pom pom */}
        <div
          className="absolute rotate-[20deg] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
          style={{
            right: -8,
            top: -10,
            width: 28,
            height: 24,
            filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))',
          }}
        >
          <svg viewBox="0 0 28 24">
            <defs>
              <linearGradient id="santa-preview-red" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#DC2626" />
              </linearGradient>
            </defs>
            {/* Hat body - voluminous cone with fold */}
            <path
              d="M5 16C5 6 8 2 14 2C20 2 25 3 27 7C27 10 25 11 23 10.5C23 8 20 5 17 5C13 5 20 10 20 16H5Z"
              fill="url(#santa-preview-red)"
            />
            {/* Crease line for depth */}
            <path
              d="M17 5C19 7 21 9 22 10.5"
              fill="none"
              stroke="#B91C1C"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.4"
            />
            {/* Thick white fur brim */}
            <path
              d="M2 18C2 15.5 5 14 13 14C21 14 24 15.5 24 18C24 20.5 21 22 13 22C5 22 2 20.5 2 18Z"
              fill="white"
            />
            {/* Pom pom connected to tip */}
            <circle cx="25" cy="10" r="3.5" fill="white" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function BunnyEarsPreview(props: { user: User | null | undefined }) {
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
        {/* Left ear */}
        <svg
          className="absolute transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-5deg]"
          style={{
            left: 4,
            top: -18,
            width: 22,
            height: 33,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            transform: 'rotate(-15deg)',
          }}
          viewBox="0 0 20 30"
        >
          <ellipse cx="10" cy="15" rx="8" ry="14" fill="#F5F5F5" />
          <ellipse cx="10" cy="16" rx="4" ry="10" fill="#FBCFE8" />
        </svg>
        {/* Right ear */}
        <svg
          className="absolute transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[5deg]"
          style={{
            right: 4,
            top: -18,
            width: 22,
            height: 33,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            transform: 'rotate(15deg)',
          }}
          viewBox="0 0 20 30"
        >
          <ellipse cx="10" cy="15" rx="8" ry="14" fill="#F5F5F5" />
          <ellipse cx="10" cy="16" rx="4" ry="10" fill="#FBCFE8" />
        </svg>
      </div>
    </div>
  )
}

function CatEarsPreview(props: { user: User | null | undefined }) {
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
        {/* Left ear - squat wide anime-style */}
        <svg
          className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-3deg]"
          style={{
            left: -2,
            top: -9,
            width: 22,
            height: 16,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            transform: 'rotate(-12deg)',
          }}
          viewBox="0 0 24 18"
        >
          {/* Outer ear - squat wide triangle */}
          <path
            d="M3 18 C3 10, 8 5, 12 0 C16 5, 21 10, 21 18 Q12 15 3 18 Z"
            fill="#4B5563"
            stroke="#374151"
            strokeWidth="0.8"
          />
          {/* Inner ear - vibrant pink */}
          <path
            d="M6 17 C6 10, 9 5, 12 4 C15 5, 18 10, 18 17 Q12 16 6 17 Z"
            fill="#F472B6"
          />
          {/* Highlight */}
          <path
            d="M10 14 Q11 9 12 5"
            stroke="#FBCFE8"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
        {/* Right ear (mirrored) */}
        <svg
          className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[3deg]"
          style={{
            right: -2,
            top: -9,
            width: 22,
            height: 16,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            transform: 'rotate(12deg) scaleX(-1)',
          }}
          viewBox="0 0 24 18"
        >
          <path
            d="M3 18 C3 10, 8 5, 12 0 C16 5, 21 10, 21 18 Q12 15 3 18 Z"
            fill="#4B5563"
            stroke="#374151"
            strokeWidth="0.8"
          />
          <path
            d="M6 17 C6 10, 9 5, 12 4 C15 5, 18 10, 18 17 Q12 16 6 17 Z"
            fill="#F472B6"
          />
          <path
            d="M10 14 Q11 9 12 5"
            stroke="#FBCFE8"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      </div>
    </div>
  )
}

// Crown position: 0 = Right, 1 = Center, 2 = Left
function CrownPreview(props: {
  user: User | null | undefined
  selectedPosition?: number
  onSelect?: (position: number) => void
  owned?: boolean
}) {
  const { user, selectedPosition = 0, onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, Math.min(selectedPosition, CROWN_POSITION_OPTIONS.length - 1))
  )

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + CROWN_POSITION_OPTIONS.length) % CROWN_POSITION_OPTIONS.length
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % CROWN_POSITION_OPTIONS.length
    setPreviewIndex(newIndex)
    if (owned && onSelect) {
      onSelect(newIndex)
    }
  }

  // Position-specific classes (0=Right, 1=Left, 2=Center)
  const getPositionClasses = () => {
    switch (previewIndex) {
      case 2: // Center
        return 'absolute left-1/2 -translate-x-1/2 -top-2'
      case 1: // Left
        return 'absolute -left-2 -top-[0.41rem] -rotate-45'
      default: // Right (0)
        return 'absolute -right-2 -top-[0.41rem] rotate-45'
    }
  }

  return (
    <div className="bg-canvas-50 flex flex-col items-center justify-center gap-2 rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <Row className="w-full items-center">
        <button
          onClick={cyclePrev}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-start py-2 pl-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="relative">
          <Avatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="lg"
            noLink
          />
          <div className={clsx(getPositionClasses(), 'transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110')}>
            <LuCrown className="h-5 w-5 text-amber-500 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
          </div>
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
      <span className="text-ink-500 text-xs">{CROWN_POSITION_OPTIONS[previewIndex]}</span>
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
            {/* Light mode — dual-stroke SVG matching live avatar halo */}
            <svg
              className="dark:hidden"
              width="3.3rem"
              height="0.85rem"
              viewBox="0 0 40 12"
              overflow="visible"
              style={{
                transform: 'rotate(-8deg)',
                filter:
                  'drop-shadow(0 0 3px rgba(245, 200, 80, 0.5)) drop-shadow(0 0 1px rgba(217, 170, 50, 0.6))',
              }}
            >
              <ellipse cx="20" cy="6" rx="18" ry="5" stroke="rgba(217, 170, 50, 0.7)" strokeWidth="3.5" fill="none" />
              <ellipse cx="20" cy="6" rx="18" ry="5" stroke="rgba(255, 252, 240, 0.95)" strokeWidth="1.5" fill="none" />
            </svg>
            {/* Dark mode — dual-stroke SVG matching live avatar halo */}
            <svg
              className="hidden dark:block"
              width="3.3rem"
              height="0.85rem"
              viewBox="0 0 40 12"
              overflow="visible"
              style={{
                transform: 'rotate(-8deg)',
                filter:
                  'drop-shadow(0 0 3px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 6px rgba(255, 255, 200, 0.4))',
              }}
            >
              <ellipse cx="20" cy="6" rx="18" ry="5" stroke="rgba(200, 160, 60, 0.5)" strokeWidth="3.5" fill="none" />
              <ellipse cx="20" cy="6" rx="18" ry="5" stroke="rgba(255, 252, 240, 0.95)" strokeWidth="1.5" fill="none" />
            </svg>
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
              <path
                d="M12 1.5L22 20l-2-2-2 3-2-3-2 3-2-3-2 3-2-3-2 3-4-2z"
                fill="#94A3B8"
              />
              <path
                d="M12 1.5L22 20l-2-2-2 3-2-3-2 3V11z"
                fill="#64748B"
                opacity="0.3"
              />
              <path
                d="M12 1.5L2 20l2-2 2 3 2-3V9z"
                fill="#E2E8F0"
                opacity="0.25"
              />
              <path
                d="M12 1.5l3 8-5 4 3 6.5"
                stroke="#E2E8F0"
                strokeWidth="0.7"
                fill="none"
                strokeLinejoin="round"
              />
              <path
                d="M12 1.5l-4 7 6 5-4 4.5"
                stroke="#475569"
                strokeWidth="0.7"
                fill="none"
                strokeLinejoin="round"
                opacity="0.8"
              />
              <path
                d="M4 17.5l5-2 8 2.5 4-1.5"
                stroke="#CBD5E1"
                strokeWidth="0.5"
                fill="none"
                strokeLinejoin="round"
              />
              <path d="M12 1.5l1.5 4-3 0z" fill="#CBD5E1" opacity="0.8" />
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
          <div className="absolute -right-1.5 -top-2 rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            >
              {/* Right Flap (Green) */}
              <path d="M12 21L15 13L22 6L12 21Z" fill="#16A34A" />
              <path d="M12 21L22 6L19 16L12 21Z" fill="#14532D" />
              {/* Left Flap (Purple) - neck + beak */}
              <path d="M12 21L9 13L5 7L12 21Z" fill="#6366F1" />
              <path d="M12 21L5 7L5 16L12 21Z" fill="#4F46E5" />
              <path d="M5 7L5 10L2 6L5 7Z" fill="#818CF8" />
              {/* Center Flap (Red) - foreground */}
              <path d="M12 21L9 13L12 2L12 21Z" fill="#991B1B" />
              <path d="M12 21L15 13L12 2L12 21Z" fill="#DC2626" />
              {/* Headband - rounded base */}
              <rect x="5" y="19" width="14" height="4" rx="2" fill="#FBBF24" />
              <rect x="5" y="19" width="14" height="4" rx="2" fill="none" stroke="#D97706" strokeWidth="0.5" />
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

function HovercardSpinningBorderPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const displayName = user?.name ?? 'YourName'
  const username = user?.username ?? 'username'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-2 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="hovercard-spinning-border bg-canvas-0 divide-ink-300 w-44 origin-center scale-[0.85] divide-y rounded-md">
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

function HovercardRoyalBorderPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const displayName = user?.name ?? 'YourName'
  const username = user?.username ?? 'username'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-2 transition-colors duration-200 group-hover:bg-red-50 dark:group-hover:bg-red-950/50">
      <div className="hovercard-royal-border bg-canvas-0 divide-ink-300 w-44 origin-center scale-[0.85] divide-y rounded-md">
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

type HovercardBgType = 'royalty' | 'mana-printer' | 'oracle' | 'trading-floor' | 'champions-legacy'

function HovercardBackgroundPreview(props: {
  user: User | null | undefined
  background: HovercardBgType
}) {
  const { user, background } = props
  const displayName = user?.name ?? 'YourName'
  const username = user?.username ?? 'username'

  // Background styles and text colors for dark backgrounds
  const bgConfig: Record<HovercardBgType, { bg: string; textColor: string }> = {
    royalty: {
      bg: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
      textColor: 'text-amber-50',
    },
    'mana-printer': {
      bg: 'linear-gradient(135deg, #0a2e1a 0%, #1b4e2d 50%, #0a2e1a 100%)',
      textColor: 'text-emerald-50',
    },
    oracle: {
      bg: 'radial-gradient(ellipse at top, #1a1a3e 0%, #0a0a1e 50%, #000010 100%)',
      textColor: 'text-indigo-50',
    },
    'trading-floor': {
      bg: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
      textColor: 'text-green-50',
    },
    'champions-legacy': {
      bg: 'linear-gradient(135deg, #2a1a00 0%, #1a1000 50%, #2a1a00 100%)',
      textColor: 'text-amber-50',
    },
  }

  const { bg: bgStyle, textColor } = bgConfig[background]

  // Simplified overlay for preview
  const renderOverlay = () => {
    switch (background) {
      case 'trading-floor':
        return (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 176 120"
            preserveAspectRatio="xMidYMid slice"
          >
            <polyline
              points="0,100 30,90 60,95 90,75 120,80 150,55 176,40"
              fill="none"
              stroke="#22C55E"
              strokeWidth="2"
              opacity="0.3"
            />
            <polygon
              points="0,100 30,90 60,95 90,75 120,80 150,55 176,40 176,120 0,120"
              fill="#22C55E"
              opacity="0.1"
            />
            {/* Upward arrow - points at Follow button */}
            <g transform="translate(125, 32)" opacity="0.25">
              <polygon points="8,0 16,10 12,10 12,18 4,18 4,10 0,10" fill="#22C55E" />
            </g>
          </svg>
        )
      case 'mana-printer':
        return (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 176 120"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="coin-gradient-preview" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#C4B5FD" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
            <g opacity="0.35">
              {/* Stick figure turning crank */}
              <circle cx="55" cy="62" r="6" stroke="#C4B5FD" strokeWidth="1.5" fill="none" />
              <line x1="55" y1="68" x2="55" y2="88" stroke="#C4B5FD" strokeWidth="1.5" />
              <line x1="55" y1="88" x2="48" y2="102" stroke="#C4B5FD" strokeWidth="1.5" />
              <line x1="55" y1="88" x2="62" y2="102" stroke="#C4B5FD" strokeWidth="1.5" />
              <line x1="55" y1="75" x2="78" y2="70" stroke="#C4B5FD" strokeWidth="1.5" />
              <line x1="55" y1="75" x2="45" y2="85" stroke="#C4B5FD" strokeWidth="1.5" />

              {/* Machine */}
              <rect
                x="82"
                y="58"
                width="38"
                height="32"
                rx="2"
                stroke="#A78BFA"
                strokeWidth="1.5"
                fill="#8B5CF6"
                fillOpacity="0.1"
              />
              {/* Crank wheel */}
              <circle cx="90" cy="70" r="6" stroke="#A78BFA" strokeWidth="1.5" fill="none" />
              <line x1="90" y1="70" x2="78" y2="70" stroke="#A78BFA" strokeWidth="1.5" />
              {/* Output slot */}
              <rect x="116" y="66" width="4" height="14" fill="#A78BFA" fillOpacity="0.4" rx="1" />

              {/* Mana coins with gradient and white M */}
              <g transform="translate(126, 72)">
                <circle r="7" fill="url(#coin-gradient-preview)" stroke="#7C3AED" strokeWidth="1.5" />
                <text x="0" y="3" fontSize="9" fontWeight="bold" fill="white" textAnchor="middle">M</text>
              </g>
              <g transform="translate(138, 90)" opacity="0.9">
                <circle r="6" fill="url(#coin-gradient-preview)" stroke="#7C3AED" strokeWidth="1" />
                <text x="0" y="2.5" fontSize="8" fontWeight="bold" fill="white" textAnchor="middle">M</text>
              </g>
              <g transform="translate(148, 106)" opacity="0.75">
                <circle r="5" fill="url(#coin-gradient-preview)" stroke="#7C3AED" strokeWidth="1" />
                <text x="0" y="2" fontSize="7" fontWeight="bold" fill="white" textAnchor="middle">M</text>
              </g>

              {/* Motion lines */}
              <path d="M98 54 L104 50" stroke="#C4B5FD" strokeWidth="0.75" />
              <path d="M100 58 L106 54" stroke="#C4B5FD" strokeWidth="0.5" />
            </g>
          </svg>
        )
      case 'oracle':
        return (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 176 120"
            preserveAspectRatio="xMidYMid slice"
          >
            <g fill="white">
              <circle cx="20" cy="20" r="0.8" opacity="0.6" />
              <circle cx="50" cy="15" r="0.6" opacity="0.5" />
              <circle cx="90" cy="25" r="1" opacity="0.7" />
              <circle cx="130" cy="18" r="0.7" opacity="0.55" />
              <circle cx="160" cy="30" r="0.8" opacity="0.6" />
              <circle cx="35" cy="50" r="0.6" opacity="0.45" />
              <circle cx="75" cy="45" r="0.8" opacity="0.5" />
              <circle cx="120" cy="55" r="0.7" opacity="0.5" />
              <circle cx="155" cy="45" r="0.6" opacity="0.45" />
              <circle cx="25" cy="80" r="0.7" opacity="0.4" />
              <circle cx="65" cy="75" r="0.6" opacity="0.35" />
              <circle cx="110" cy="85" r="0.8" opacity="0.4" />
              <circle cx="145" cy="78" r="0.6" opacity="0.35" />
            </g>
          </svg>
        )
      case 'champions-legacy':
        return (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 176 120"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <radialGradient id="cl-glow-p" cx="50%" cy="100%" r="100%" fx="50%" fy="100%">
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.15" />
                <stop offset="60%" stopColor="#B45309" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#B45309" stopOpacity="0" />
              </radialGradient>
              <symbol id="cl-trophy-p" viewBox="0 0 100 100">
                <path d="M20 10h60l-5 30c0 20-15 25-25 25s-25-5-25-25l-5-30z M45 65v15h-10l-5 10h40l-5-10h-10v-15h-10z M80 15c15 0 15 25 0 25v-5c8 0 8-15 0-15v-5z M20 15c-15 0-15 25 0 25v-5c-8 0-8-15 0-15v-5z" fill="currentColor" />
              </symbol>
              <symbol id="cl-star-p" viewBox="0 0 20 20">
                <path d="M10 0l2.5 7.5h7.5l-6 4.5 2.5 7.5-6-4.5-6 4.5 2.5-7.5-6-4.5h7.5z" fill="currentColor" />
              </symbol>
            </defs>
            <rect width="176" height="120" fill="url(#cl-glow-p)" />
            {/* Main trophy — centered */}
            <use href="#cl-trophy-p" x="48" y="20" width="80" height="80" transform="rotate(8 88 60)" fill="#B45309" fillOpacity="0.07" />
            {/* Small accent trophies — top corners */}
            <use href="#cl-trophy-p" x="125" y="2" width="40" height="40" transform="rotate(-10 145 22)" fill="#D97706" fillOpacity="0.05" />
            <use href="#cl-trophy-p" x="5" y="2" width="35" height="35" transform="rotate(12 22 20)" fill="#D97706" fillOpacity="0.04" />
            {/* Laurel stems — bottom corners */}
            <path d="M12 115 C22 100 28 85 32 70" stroke="#D97706" strokeWidth="1.5" strokeOpacity="0.1" fill="none" />
            <path d="M164 115 C154 100 148 85 144 70" stroke="#D97706" strokeWidth="1.5" strokeOpacity="0.1" fill="none" />
            {/* Leaves */}
            <g fill="#F59E0B" fillOpacity="0.1">
              <path d="M28 88 Q18 91 15 82 Q23 79 28 88" />
              <path d="M30 75 Q20 78 17 69 Q25 66 30 75" />
              <path d="M148 88 Q158 91 161 82 Q153 79 148 88" />
              <path d="M146 75 Q156 78 159 69 Q151 66 146 75" />
            </g>
            {/* Stars */}
            <use href="#cl-star-p" x="80" y="8" width="9" height="9" fill="#FBBF24" fillOpacity="0.2" />
            <use href="#cl-star-p" x="25" y="45" width="6" height="6" fill="#F59E0B" fillOpacity="0.12" />
            <use href="#cl-star-p" x="148" y="50" width="5" height="5" fill="#F59E0B" fillOpacity="0.12" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-2 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div
        className={clsx(
          'relative w-44 origin-center scale-[0.85] divide-y divide-white/20 rounded-md shadow-lg ring-1 ring-white/10',
          textColor
        )}
        style={{ background: bgStyle, overflow: 'hidden' }}
      >
        {/* Background overlay */}
        {renderOverlay()}
        <div className="relative z-10 px-3 py-2">
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
          <div className="text-xs opacity-70">@{username}</div>
          <Row className="mt-1 gap-3 text-[10px]">
            <span>
              <b>0</b> Following
            </span>
            <span>
              <b>0</b> Followers
            </span>
          </Row>
        </div>
        <div className="relative z-10 px-3 py-1.5 text-[10px] opacity-80">
          <b>Last active:</b> today
        </div>
      </div>
    </div>
  )
}

function GoldenFollowButtonPreview(props: { user: User | null | undefined }) {
  const { user } = props
  const displayName = user?.name ?? 'YourName'
  const username = user?.username ?? 'username'

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-2 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="bg-canvas-0 divide-ink-300 w-44 origin-center scale-[0.85] divide-y rounded-md shadow-lg ring-1 ring-black/5">
        <div className="px-3 py-2">
          <Row className="items-start justify-between">
            <Avatar
              username={user?.username}
              avatarUrl={user?.avatarUrl}
              size="md"
              noLink
            />
            <div
              className="rounded px-2 py-0.5 text-[10px] font-semibold text-amber-900"
              style={{
                background:
                  'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                boxShadow:
                  '0 0 8px rgba(251, 191, 36, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
              }}
            >
              Follow
            </div>
          </Row>
          <div className="text-ink-900 mt-1 truncate text-sm font-bold">
            {displayName}
          </div>
          <div className="text-ink-500 text-xs">@{username}</div>
          <Row className="text-ink-600 mt-1 gap-3 text-[10px]">
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
      return (
        <CrownPreview
          user={user}
          selectedPosition={(entitlement?.metadata?.style as number) ?? 0}
          owned={!!entitlement}
          onSelect={
            onMetadataUpdate
              ? (position: number) => onMetadataUpdate({ style: position })
              : undefined
          }
        />
      )
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
    case 'avatar-fire-item':
      return <FireItemPreview user={user} />
    case 'avatar-bad-aura':
      return <BadAuraPreview user={user} />
    case 'avatar-monocle':
      return <MonoclePreview user={user} />
    case 'avatar-crystal-ball':
      return <CrystalBallPreview user={user} />
    case 'avatar-disguise':
      return <DisguisePreview user={user} />
    case 'avatar-thought-yes':
      return <ThoughtBubblePreview user={user} type="yes" />
    case 'avatar-thought-no':
      return <ThoughtBubblePreview user={user} type="no" />
    case 'avatar-stonks-up':
      return <ArrowPreview user={user} direction="up" />
    case 'avatar-stonks-down':
      return <ArrowPreview user={user} direction="down" />
    case 'avatar-stonks-meme':
      return <StonksMemePreview user={user} />
    case 'avatar-blue-cap':
      return (
        <BlueCapStylePreview
          user={user}
          selectedStyle={(entitlement?.metadata?.style as number) ?? 0}
          owned={!!entitlement}
          onSelect={
            onMetadataUpdate
              ? (style) => onMetadataUpdate({ style })
              : undefined
          }
        />
      )
    case 'avatar-team-red-hat':
      return (
        <RedCapStylePreview
          user={user}
          selectedStyle={(entitlement?.metadata?.style as number) ?? 0}
          owned={!!entitlement}
          onSelect={
            onMetadataUpdate
              ? (style) => onMetadataUpdate({ style })
              : undefined
          }
        />
      )
    case 'avatar-team-green-hat':
      return (
        <GreenCapStylePreview
          user={user}
          selectedStyle={(entitlement?.metadata?.style as number) ?? 0}
          owned={!!entitlement}
          onSelect={
            onMetadataUpdate
              ? (style) => onMetadataUpdate({ style })
              : undefined
          }
        />
      )
    case 'avatar-black-cap':
      return (
        <BlackCapStylePreview
          user={user}
          selectedStyle={(entitlement?.metadata?.style as number) ?? 0}
          owned={!!entitlement}
          onSelect={
            onMetadataUpdate
              ? (style) => onMetadataUpdate({ style })
              : undefined
          }
        />
      )
    case 'avatar-bull-horns':
      return <BullHornsPreview user={user} />
    case 'avatar-bear-ears':
      return <BearEarsPreview user={user} />
    case 'avatar-santa-hat':
      return <SantaHatPreview user={user} />
    case 'avatar-bunny-ears':
      return <BunnyEarsPreview user={user} />
    case 'avatar-cat-ears':
      return <CatEarsPreview user={user} />
    case 'streak-forgiveness':
      return (
        <StreakFreezePreview
          user={user}
          localBonus={localStreakBonus}
          allEntitlements={allEntitlements}
        />
      )
    case 'hovercard-glow':
      return <HovercardGlowPreview user={user} />
    case 'hovercard-spinning-border':
      return <HovercardSpinningBorderPreview user={user} />
    case 'hovercard-royal-border':
      return <HovercardRoyalBorderPreview user={user} />
    case 'hovercard-royalty':
      return <HovercardBackgroundPreview user={user} background="royalty" />
    case 'hovercard-mana-printer':
      return <HovercardBackgroundPreview user={user} background="mana-printer" />
    case 'hovercard-oracle':
      return <HovercardBackgroundPreview user={user} background="oracle" />
    case 'hovercard-trading-floor':
      return <HovercardBackgroundPreview user={user} background="trading-floor" />
    case 'former-charity-champion':
      return <HovercardBackgroundPreview user={user} background="champions-legacy" />
    case 'hovercard-golden-follow':
      return <GoldenFollowButtonPreview user={user} />
    case 'pampu-skin':
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
  onMetadataChange: (itemId: string, updatedEntitlement: UserEntitlement) => void
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
    onMetadataChange,
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
    (item.type === 'permanent-toggleable' || item.type === 'time-limited' || item.type === 'earned') &&
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

  const pendingMetadataApiRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  const handleMetadataUpdate = (metadata: Record<string, any>) => {
    // Optimistic update: immediately reflect the new metadata locally
    if (entitlement) {
      const updatedEntitlement = {
        ...entitlement,
        metadata: { ...entitlement.metadata, ...metadata },
      }
      onMetadataChange(item.id, updatedEntitlement)
    }

    // Debounce the API call (800ms) so rapid cycling doesn't spam the server
    if (pendingMetadataApiRef.current)
      clearTimeout(pendingMetadataApiRef.current)
    pendingMetadataApiRef.current = setTimeout(async () => {
      try {
        const result = await api('shop-update-metadata', {
          itemId: item.id,
          metadata,
        })
        // Update with server response
        const entitlementId = getEntitlementId(item)
        const serverUpdated = (result.entitlements as UserEntitlement[]).find(
          (e) => e.entitlementId === entitlementId
        )
        if (serverUpdated) {
          onMetadataChange(item.id, serverUpdated)
        }
      } catch (e: any) {
        toast.error(e.message || 'Failed to update selection')
      }
    }, 800)
  }

  const cardRef = useRef<HTMLDivElement>(null)

  // Premium items (over 100k mana) get special styling
  const isPremiumItem = item.price >= 100000

  return (
    <>
      <div className="group flex pb-1">
      <Card
        ref={cardRef}
        className={clsx(
          'group relative flex w-full cursor-default flex-col gap-3 p-4 transition-all duration-200',
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

        {item.hidden && (
          <div className="absolute right-2 top-2 z-10 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
            Hidden
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
          {/* LEGENDARY badge for halo, wings, crown only */}
          {['avatar-halo', 'avatar-angel-wings', 'avatar-crown'].includes(item.id) && !owned && (
            <div className="shrink-0 rounded bg-gradient-to-r from-amber-500 to-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm sm:px-2 sm:text-xs">
              LEGENDARY
            </div>
          )}
          {/* SEASONAL badge */}
          {item.seasonalAvailability && (
            <div className="shrink-0 rounded bg-gradient-to-r from-pink-500 to-rose-400 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm sm:px-2 sm:text-xs">
              SEASONAL
            </div>
          )}
        </Row>

        {/* Slot tag */}
        {EXCLUSIVE_SLOTS.includes(item.slot) && (
          <span
            className={clsx(
              'w-fit rounded-full px-2 py-0.5 text-[10px] font-medium',
              item.slot === 'hat' &&
                'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
              item.slot === 'profile-border' &&
                'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
              item.slot === 'profile-accessory' &&
                'bg-teal-100 text-teal-700 dark:bg-teal-800/60 dark:text-teal-200',
              item.slot === 'hovercard-background' &&
                'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
              item.slot === 'hovercard-border' &&
                'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
              item.slot === 'button-yes' &&
                'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
              item.slot === 'button-no' &&
                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            )}
          >
            {SLOT_LABELS[item.slot]}
          </span>
        )}
        {/* Unique items get a special badge */}
        {item.slot === 'unique' && (
          <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            ✨ Combines with everything
          </span>
        )}

        <p className="text-ink-600 text-sm">{item.description}</p>

        {/* Animation location indicator — driven by display-config */}
        {item.animationTypes && item.animationTypes.length > 0 && (() => {
          const locationText = getAnimationLocationText(item.animationTypes)
          return locationText ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span className="text-ink-500 text-xs">
                Animated on {locationText}
              </span>
            </div>
          ) : null
        })()}

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
        ) : item.type === 'earned' ? (
          // Earned items that aren't owned - show locked state
          <div className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-gray-100 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <FaLock className="h-3 w-3" />
            <span>Reserved for Past Champions</span>
          </div>
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
      </div>

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
                  ({Math.round(shopDiscount * 100)}% off)
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
