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
  isSeasonalItemAvailable,
  getSeasonalAvailabilityText,
  YES_BUTTON_OPTIONS,
  NO_BUTTON_OPTIONS,
  YesButtonOption,
  NoButtonOption,
  SLOT_LABELS,
  EXCLUSIVE_SLOTS,
  getEntitlementIdsForSlot,
  CROWN_POSITION_OPTIONS,
  getMerchItems,
  getTicketItems,
} from 'common/shop/items'
import { UserEntitlement } from 'common/shop/types'
import { requiresPostalCode } from 'common/shop/printful-address'
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
import Router from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { FaStar } from 'react-icons/fa'
import { FaGem, FaGift, FaLock } from 'react-icons/fa6'
import { LuCrown, LuGraduationCap } from 'react-icons/lu'
import { GiTopHat, GiDunceCap } from 'react-icons/gi'
import {
  BlackHoleSvg,
  FireFlamesSvg,
  AngelWingSvg,
  MonocleSvg,
  CrystalBallSvg,
  ArrowBadgeSvg,
  StonksMemeArrowSvg,
  BullHornSvg,
  BearEarSvg,
  CatEarSvg,
  CatWhiskersSvg,
  SantaHatSvg,
  BunnyEarSvg,
  WizardHatSvg,
  TinfoilHatSvg,
  JesterHatSvg,
  FedoraSvg,
  DevilHornSvg,
  HaloSvg,
} from 'web/components/shop/item-svgs'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SPEND_MANA_ENABLED } from 'web/components/nav/sidebar'
import { SEO } from 'web/components/SEO'
import {
  Avatar,
  BlueCapSvg,
  RedCapSvg,
  GreenCapSvg,
  BlackCapSvg,
  DisguiseOnAvatar,
} from 'web/components/widgets/avatar'
import { Card } from 'web/components/widgets/card'
import { SelectDropdown } from 'web/components/widgets/select-dropdown'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Tooltip } from 'web/components/widgets/tooltip'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
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
  formatEntries,
} from 'web/components/shop/charity-giveaway-card'
import { CharityChampionCard } from 'web/components/shop/charity-champion-card'
import {
  ENDED_PILL,
  GiveawayPromoCard,
  promoStatSizeClass,
} from 'web/components/shop/giveaway-promo-card'
import { NewBadge } from 'web/components/shop/new-badge'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { getAnimationLocationText } from 'common/shop/display-config'
import { getTotalPrizePool } from 'common/sweepstakes'

// Check if user owns the item (not expired), regardless of enabled status
const isEntitlementOwned = (e: UserEntitlement) => {
  if (!e.expiresTime) return true
  return e.expiresTime > Date.now()
}

// Default item order (manual curation)
const ITEM_ORDER: Record<string, number> = {
  'streak-forgiveness': 1,
  // 1.6 keeps the former-champion legacy in its default position
  // (lands in the 'hovercard' category pill via its slot).
  'former-charity-champion': 1.6,
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
  | 'category'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc'
  | 'name-desc'

type FilterOption =
  | 'all'
  | 'owned'
  | 'hats'
  | 'avatar'
  | 'hovercard'
  | 'buttons'
  | 'other'
  | 'merch'
  | 'ticket'
  | 'seasonal'

const FILTER_CONFIG: Record<
  FilterOption,
  { label: string; slots: string[]; special?: boolean }
> = {
  all: { label: 'All', slots: [] },
  owned: { label: 'Owned', slots: [], special: true },
  hats: { label: 'Hats', slots: ['hat'] },
  avatar: { label: 'Avatar', slots: ['profile-border', 'profile-accessory'] },
  hovercard: {
    label: 'Hovercard',
    slots: ['hovercard-background', 'hovercard-border', 'unique'],
  },
  buttons: { label: 'Buttons', slots: ['button-yes', 'button-no'] },
  other: { label: 'Other', slots: ['consumable', 'badge'] },
  merch: { label: 'Merch', slots: [], special: true },
  ticket: { label: 'Tickets', slots: [], special: true },
  seasonal: { label: 'Seasonal', slots: [], special: true },
}

const filterItems = (
  items: ShopItem[],
  filter: FilterOption,
  ownedItemIds?: Set<string>
): ShopItem[] => {
  if (filter === 'all') return items
  if (filter === 'seasonal')
    return items.filter((item) => item.seasonalAvailability)
  if (filter === 'merch') return [] // merch handled by separate section
  if (filter === 'ticket') return [] // tickets handled by separate section
  if (filter === 'owned') {
    // Items the user actively manages — owned toggleable goods.
    // Merch + tickets are excluded by the regular-grid filter upstream.
    return items.filter((item) =>
      ownedItemIds ? ownedItemIds.has(getEntitlementId(item)) : false
    )
  }
  const allowedSlots = FILTER_CONFIG[filter].slots
  return items.filter((item) => {
    // filterOverride takes precedence over slot-based categorization so that
    // e.g. `slot: 'unique'` items (Halo, Angel Wings, Crown) can appear under
    // Hats / Avatar instead of being dumped into Hovercard.
    if (item.filterOverride) return item.filterOverride === filter
    return allowedSlots.includes(item.slot)
  })
}

// Check if a filter tab has any visible items (for dynamic tab visibility)
const hasVisibleItems = (
  filter: FilterOption,
  allItems: ShopItem[],
  visibleItemIds: Set<string>,
  showHidden: boolean,
  ownedItemIds?: Set<string>
): boolean => {
  if (filter === 'all') return true
  if (filter === 'owned') {
    // Tab only appears once the user owns at least one toggleable item
    // (excluding merch + tickets, which aren't toggleable).
    if (!ownedItemIds || ownedItemIds.size === 0) return false
    return allItems.some(
      (item) =>
        item.category !== 'merch' &&
        item.category !== 'ticket' &&
        ownedItemIds.has(getEntitlementId(item))
    )
  }
  if (filter === 'merch') {
    return getMerchItems().some((item) => !item.hidden || showHidden)
  }
  if (filter === 'ticket') {
    return getTicketItems().some((item) => !item.hidden || showHidden)
  }
  if (filter === 'seasonal') {
    // Only surface the Seasonal tab when there's at least one non-hidden
    // seasonal item — owned/in-season hidden items don't pull the tab back.
    return allItems.some(
      (item) => item.seasonalAvailability && (!item.hidden || showHidden)
    )
  }
  const allowedSlots = FILTER_CONFIG[filter].slots
  return allItems.some(
    (item) =>
      // filterOverride takes precedence over slot-based matching
      (item.filterOverride
        ? item.filterOverride === filter
        : allowedSlots.includes(item.slot)) &&
      (visibleItemIds.has(item.id) || showHidden)
  )
}

// Order in which non-special category pills appear; drives the 'category' sort
const CATEGORY_PILL_ORDER: FilterOption[] = [
  'hats',
  'avatar',
  'hovercard',
  'buttons',
  'other',
]

const getCategoryRank = (item: ShopItem): number => {
  // filterOverride takes precedence so Halo / Crown / Angel Wings sort with
  // their intended category instead of being pushed to Hovercard by slot.
  if (item.filterOverride) {
    const idx = CATEGORY_PILL_ORDER.indexOf(item.filterOverride)
    if (idx >= 0) return idx
  }
  for (let i = 0; i < CATEGORY_PILL_ORDER.length; i++) {
    if (FILTER_CONFIG[CATEGORY_PILL_ORDER[i]].slots.includes(item.slot)) {
      return i
    }
  }
  return CATEGORY_PILL_ORDER.length // unknown / falls to the end
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
    case 'category':
      return sorted.sort((a, b) => {
        const ra = getCategoryRank(a)
        const rb = getCategoryRank(b)
        if (ra !== rb) return ra - rb
        // Within a category, fall back to the default curated order
        return (ITEM_ORDER[a.id] ?? 99) - (ITEM_ORDER[b.id] ?? 99)
      })
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

  // Mark /shop as visited so the NEW badge on the sidebar + per-card stickers
  // clear for this user. Fire-and-forget; next visit retries on failure.
  useEffect(() => {
    if (!user) return
    api('me/update', { lastShopVisitTime: Date.now() }).catch(() => {})
  }, [user?.id])

  // Fetch user's merch orders to show "Already purchased" state
  const { data: userMerchData, refresh: refreshMerchOrders } = useAPIGetter(
    'get-user-merch-orders',
    {},
    undefined,
    undefined,
    !!user
  )
  const purchasedMerchIds = useMemo(
    () => new Set((userMerchData?.orders ?? []).map((o) => o.itemId)),
    [userMerchData]
  )

  // Fetch merch stock status
  const { data: stockData } = useAPIGetter('get-merch-stock-status', {})
  const outOfStockIds = useMemo(
    () => new Set(stockData?.outOfStockItems ?? []),
    [stockData]
  )

  // Fetch charity giveaway data once for both cards
  const { data: charityData } = useAPIGetter(
    'get-charity-giveaway',
    {
      userId: user?.id,
    }
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

  // "NEW to user" predicate. Falls back to createdTime so fresh signups don't
  // see every historically-added item flagged. Suppresses NEW for items the
  // user already owns (nothing "new to discover" there).
  //
  // lastShopVisit is snapshotted via useMemo([user?.id]) so that the value
  // stays stable for the duration of the page visit — otherwise the WebSocket
  // update triggered by our own me/update call below would collapse the NEW
  // section mid-view, and stickers would vanish while the user is still
  // looking. The snapshot only refreshes on login/logout.
  //
  // DO NOT add user.lastShopVisitTime or user.createdTime to the deps list —
  // the eslint-auto-fix would reintroduce the mid-view collapse bug.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lastShopVisit = useMemo(
    () => user?.lastShopVisitTime ?? user?.createdTime ?? 0,
    [user?.id]
  )
  const isItemNewToUser = (item: ShopItem): boolean =>
    !!user && // logged-out visitors never see NEW (matches the sidebar badge)
    !!item.visibleSinceTime &&
    item.visibleSinceTime > lastShopVisit &&
    !ownedItemIds.has(getEntitlementId(item))

  // Set of item IDs that are visible in the shop (for dynamic filter tab visibility)
  const visibleShopItemIds = new Set(
    SHOP_ITEMS.filter(
      (item) =>
        !SUPPORTER_ENTITLEMENT_IDS.includes(
          item.id as (typeof SUPPORTER_ENTITLEMENT_IDS)[number]
        ) &&
        item.category !== 'merch' &&
        (!item.hidden ||
          ownedItemIds.has(getEntitlementId(item)) ||
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

  // Filtered + sorted regular shop items (excludes tickets/merch/supporter).
  // Computed once so we can split into the NEW section and the main grid.
  const sortedRegularItems =
    filterOption === 'ticket' || filterOption === 'merch'
      ? []
      : sortItems(
          filterItems(
            SHOP_ITEMS.filter(
              (item) =>
                !SUPPORTER_ENTITLEMENT_IDS.includes(
                  item.id as (typeof SUPPORTER_ENTITLEMENT_IDS)[number]
                ) &&
                item.category !== 'merch' &&
                item.category !== 'ticket' &&
                (!item.hidden ||
                  showHidden ||
                  ownedItemIds.has(getEntitlementId(item)) ||
                  (item.seasonalAvailability && isSeasonalItemAvailable(item)))
            ),
            filterOption,
            ownedItemIds
          ),
          sortOption
        )

  // On the 'all' filter, pull NEW-to-user items out into a dedicated section
  // above the main grid. On narrower filters, NEW items stay in place and
  // get the per-card sticker only.
  const newRegularItems =
    filterOption === 'all' ? sortedRegularItems.filter(isItemNewToUser) : []
  const mainRegularItems =
    filterOption === 'all'
      ? sortedRegularItems.filter((i) => !isItemNewToUser(i))
      : sortedRegularItems

  // When merch has launched and at least one merch item is NEW to this user,
  // promote the merch section to the top of the page so first-time visitors
  // see it before scrolling. Once they visit /shop and clear the NEW state,
  // merch falls back to its usual position below the regular grid.
  const merchHasNewItems =
    filterOption === 'all' &&
    getMerchItems().some(
      (item) => (!item.hidden || showHidden) && isItemNewToUser(item)
    )

  // Shared render so the NEW section + main grid handle items identically.
  const renderShopItem = (item: ShopItem) => {
    const entitlementId = getEntitlementId(item)
    const entitlement = effectiveEntitlements.find(
      (e) => e.entitlementId === entitlementId && isEntitlementOwned(e)
    )
    // Trophy: owners see the rich CharityChampionCard (floating trophy
    // decoration + leaderboard) so they can manage it from the shop too.
    // Claiming/dethroning still happens on the charity page.
    if (item.id === 'charity-champion-trophy' && entitlement) {
      return (
        <CharityChampionCard
          key={item.id}
          data={charityGiveawayData}
          isLoading={isCharityLoading}
          user={user}
          entitlements={effectiveEntitlements}
          isNew={isItemNewToUser(item)}
          showHiddenBadge={item.hidden}
          onEntitlementsChange={(newEntitlements) =>
            setLocalEntitlements(newEntitlements)
          }
        />
      )
    }
    return (
      <ShopItemCard
        key={item.id}
        item={item}
        user={user}
        owned={ownedItemIds.has(entitlementId)}
        entitlement={entitlement}
        allEntitlements={effectiveEntitlements}
        justPurchased={justPurchased === item.id}
        isNew={isItemNewToUser(item)}
        onPurchaseComplete={handlePurchaseComplete}
        onToggleComplete={handleToggleComplete}
        onMetadataChange={handleMetadataChange}
        getToggleVersion={getToggleVersion}
        localStreakBonus={localStreakBonus}
      />
    )
  }

  return (
    <Page trackPageView="shop page" className="!col-span-7">
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

      <Col className="mx-auto w-full max-w-3xl p-4">
        <Row className="mb-2 items-center gap-2 text-2xl font-semibold">
          <FaGem className="h-6 w-6 text-violet-500" />
          Mana Shop
        </Row>
        {user ? (
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
        ) : (
          // Skeleton placeholder so the page doesn't shift when the user loads
          <Row className="mb-6 animate-pulse items-center gap-4">
            <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          </Row>
        )}

        {/* Featured supporter card */}
        <SupporterCard
          entitlements={effectiveEntitlements}
          onPurchaseComplete={handlePurchaseComplete}
        />

        {/* Prize Drawing + Charity Giveaway row */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PrizeDrawingCard />
          <CharityGiveawayCard
            data={charityGiveawayData}
            isLoading={isCharityLoading}
            user={user}
          />
        </div>

        {/* Header and sort dropdown */}
        <Row className="mb-2 mt-8 items-center justify-between">
          <span className="text-lg font-semibold">Digital goods & more</span>
          <SelectDropdown<SortOption>
            aria-label="Sort items"
            value={sortOption}
            onChange={setSortOption}
            options={[
              { value: 'default', label: 'Default order' },
              { value: 'category', label: 'Category' },
              { value: 'price-asc', label: 'Price: Low to High' },
              { value: 'price-desc', label: 'Price: High to Low' },
              { value: 'name-asc', label: 'Name: A to Z' },
              { value: 'name-desc', label: 'Name: Z to A' },
            ]}
            anchor={{ to: 'bottom end', gap: 4, padding: 4 }}
          />
        </Row>

        {/* Category filter pills — only show tabs that have visible items */}
        <Row className="mb-4 flex-wrap gap-2">
          {(Object.keys(FILTER_CONFIG) as FilterOption[]).map((filter) => {
            if (
              !hasVisibleItems(
                filter,
                SHOP_ITEMS,
                visibleShopItemIds,
                showHidden,
                ownedItemIds
              )
            )
              return null
            const isSeasonal = filter === 'seasonal'
            const isMerch = filter === 'merch'
            const isOwned = filter === 'owned'
            const isActive = filterOption === filter
            return (
              <button
                key={filter}
                onClick={() => setFilterOption(filter)}
                className={clsx(
                  'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                  isActive && isSeasonal
                    ? 'bg-gradient-to-r from-pink-500 to-rose-400 text-white shadow-sm'
                    : isActive && isMerch
                    ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-white shadow-sm ring-1 ring-amber-300/60'
                    : isActive && isOwned
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm'
                    : isActive
                    ? 'bg-primary-500 text-white'
                    : isSeasonal
                    ? 'bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 hover:from-pink-200 hover:to-rose-200 dark:from-pink-900/30 dark:to-rose-900/30 dark:text-pink-300'
                    : isMerch
                    ? 'bg-gradient-to-r from-amber-100 via-yellow-100 to-amber-200 text-amber-800 shadow-sm ring-1 ring-amber-300/50 hover:from-amber-200 hover:via-yellow-200 hover:to-amber-300 dark:from-amber-900/40 dark:via-yellow-900/30 dark:to-amber-900/50 dark:text-amber-200 dark:ring-amber-500/40'
                    : isOwned
                    ? 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700 hover:from-emerald-200 hover:to-teal-200 dark:from-emerald-900/30 dark:to-teal-900/30 dark:text-emerald-300'
                    : 'bg-canvas-50 text-ink-600 hover:bg-canvas-100'
                )}
              >
                {FILTER_CONFIG[filter].label}
              </button>
            )
          })}
        </Row>

        {/* NEW section — only on the 'all' filter, when user has unseen items */}
        {filterOption === 'all' && newRegularItems.length > 0 && (
          <>
            <Row className="mb-4 mt-2 items-center gap-2">
              <NewBadge variant="inline" />
              <span className="text-lg font-semibold">Just added</span>
            </Row>
            <div className="mb-2 grid grid-cols-1 gap-4 pt-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
              {newRegularItems.map(renderShopItem)}
            </div>
          </>
        )}

        {/* Promote merch above tickets/regular grid on first visit after launch
            (any merch item is NEW to this user). Falls back to its usual
            position below the regular grid once they've cleared the NEW state. */}
        {merchHasNewItems && (
          <MerchSection
            user={user}
            entitlements={effectiveEntitlements}
            purchasedMerchIds={purchasedMerchIds}
            outOfStockIds={outOfStockIds}
            isItemNewToUser={isItemNewToUser}
            showHidden={showHidden}
            filterOption={filterOption}
            onPurchased={refreshMerchOrders}
          />
        )}

        {/* Tickets + shop items — hidden when merch filter is active */}
        {filterOption !== 'merch' && (
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {/* Tickets first on 'all' and 'ticket' filters */}
            {(filterOption === 'all' || filterOption === 'ticket') &&
              getTicketItems()
                .filter((item) => !item.hidden || showHidden)
                .map((item) => (
                  <TicketItemCard
                    key={item.id}
                    item={item}
                    user={user}
                    allEntitlements={effectiveEntitlements}
                  />
                ))}

            {/* Regular shop items — hidden when ticket filter is active.
                On 'all' filter, NEW items are already rendered above, so
                mainRegularItems has them filtered out. */}
            {filterOption !== 'ticket' && mainRegularItems.map(renderShopItem)}
          </div>
        )}

        {/* Merch section in its default position. Skipped when already
            promoted above so we don't render the cards twice. */}
        {!merchHasNewItems && (
          <MerchSection
            user={user}
            entitlements={effectiveEntitlements}
            purchasedMerchIds={purchasedMerchIds}
            outOfStockIds={outOfStockIds}
            isItemNewToUser={isItemNewToUser}
            showHidden={showHidden}
            filterOption={filterOption}
            onPurchased={refreshMerchOrders}
          />
        )}

        {/* Admin testing tools — hidden for the merch launch. Uncomment to
            re-enable for admin/mod debugging. */}
        {/* {isAdminOrMod && (
          <AdminTestingTools
            user={user}
            showHidden={showHidden}
            setShowHidden={setShowHidden}
          />
        )} */}
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

function TicketItemCard(props: {
  item: ShopItem
  user: User | null | undefined
  allEntitlements?: UserEntitlement[]
}) {
  const { item, user, allEntitlements } = props
  const shopDiscount = getBenefit(allEntitlements, 'shopDiscount', 0)
  const discountedPrice =
    shopDiscount > 0 ? Math.floor(item.price * (1 - shopDiscount)) : item.price
  const hasDiscount = shopDiscount > 0
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const privateUser = usePrivateUser()
  const userEmail = privateUser?.email ?? null
  const [purchaseResult, setPurchaseResult] = useState<{
    discountCode: string | null
    remainingStock: number
  } | null>(null)
  const [doneCountdown, setDoneCountdown] = useState(10)

  useEffect(() => {
    if (!purchaseResult) {
      setDoneCountdown(10)
      return
    }
    if (doneCountdown <= 0) return
    const t = setTimeout(() => setDoneCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [purchaseResult, doneCountdown])

  const { data: stockData, refresh: refreshStock } = useAPIGetter(
    'get-ticket-stock',
    { itemId: item.id }
  )

  const { data: purchasedData, refresh: refreshPurchased } = useAPIGetter(
    'get-user-ticket-purchased',
    {},
    undefined,
    undefined,
    !!user
  )
  const alreadyPurchased = !!purchasedData?.purchased

  const available = stockData?.available ?? null
  const maxStock = stockData?.maxStock ?? item.maxStock ?? 0
  const soldOut = available !== null && available <= 0
  const comingSoon = !!item.comingSoon
  const isEarlyBird = item.id === 'manifest-ticket'
  const canPurchase =
    user &&
    user.balance >= discountedPrice &&
    !soldOut &&
    !comingSoon &&
    !alreadyPurchased

  const handleBuy = async () => {
    if (!acceptedTerms) {
      toast.error('Please accept the terms')
      return
    }
    setPurchasing(true)
    try {
      const result = await api('shop-purchase-ticket', {
        itemId: item.id,
      })
      setPurchaseResult({
        discountCode: result.discountCode,
        remainingStock: result.remainingStock,
      })
      toast.success('Ticket purchased!')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to purchase ticket')
    } finally {
      setPurchasing(false)
      refreshStock()
      refreshPurchased?.()
    }
  }

  const closeAndReset = () => {
    setShowPurchaseModal(false)
    setPurchaseResult(null)
    setAcceptedTerms(false)
  }

  const pctClaimed =
    maxStock > 0 && available !== null
      ? Math.round(((maxStock - available) / maxStock) * 100)
      : 0

  return (
    <>
      <div
        className={clsx(
          'bg-canvas-0 text-ink-900 relative overflow-hidden rounded-xl border-2 shadow-sm',
          comingSoon
            ? 'border-ink-300 opacity-80'
            : isEarlyBird
            ? 'border-amber-400'
            : 'border-indigo-400'
        )}
      >
        {/* Top banner */}
        <div
          className={clsx(
            'flex items-center justify-between px-4 py-1.5 text-xs font-bold uppercase tracking-widest',
            comingSoon
              ? 'bg-gradient-to-r from-indigo-500 to-indigo-400 text-indigo-950'
              : isEarlyBird
              ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-amber-950'
              : 'bg-gradient-to-r from-indigo-500 to-indigo-400 text-indigo-950'
          )}
        >
          <span>
            {comingSoon
              ? '⏳ Available Soon'
              : isEarlyBird
              ? 'Early Bird'
              : 'Standard'}
          </span>
          {soldOut && !comingSoon && (
            <span className="text-scarlet-800">Sold Out</span>
          )}
        </div>

        {/* Decorative header with title */}
        <Col
          className={clsx(
            'items-center justify-center gap-1 px-4 py-6 text-center',
            comingSoon
              ? 'bg-canvas-50'
              : isEarlyBird
              ? 'bg-amber-200/50 dark:bg-amber-500/10'
              : 'bg-indigo-200/50 dark:bg-indigo-500/10'
          )}
        >
          <div
            className={clsx(
              'text-sm font-semibold uppercase tracking-widest',
              comingSoon
                ? 'text-ink-500'
                : isEarlyBird
                ? 'text-amber-700 dark:text-amber-500'
                : 'text-indigo-700 dark:text-indigo-400'
            )}
          >
            Manifest 2026
          </div>
          <div className="text-lg font-bold leading-tight">
            {isEarlyBird ? 'Early Bird Ticket' : 'Standard Ticket'}
          </div>
        </Col>

        {/* Details */}
        <Col className="gap-3 p-4">
          <Row className="text-ink-600 flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span>📍 Lighthaven</span>
            <span>📅 Jun 12–14</span>
          </Row>

          <div className="text-ink-700 text-xs leading-relaxed">
            Full access to{' '}
            <a
              className="text-primary-700 hover:underline"
              target="_blank"
              href="https://manifest.is"
            >
              Manifest 2026
            </a>
            , Friday through Sunday. 5 meals included.
          </div>

          {/* Stock display */}
          {!comingSoon &&
            available !== null &&
            (isEarlyBird ? (
              <Col className="gap-1">
                <Row className="text-ink-600 justify-between text-[11px]">
                  <span>
                    {maxStock - available}/{maxStock} claimed
                  </span>
                  <span className="text-amber-700 dark:text-amber-500">
                    {available} left
                  </span>
                </Row>
                <div className="bg-ink-200 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all"
                    style={{ width: `${pctClaimed}%` }}
                  />
                </div>
              </Col>
            ) : (
              <div
                className={clsx(
                  'text-xs',
                  soldOut
                    ? 'text-scarlet-600'
                    : available <= 5
                    ? 'text-scarlet-600 dark:text-scarlet-400'
                    : 'text-teal-600 dark:text-teal-400'
                )}
              >
                {soldOut
                  ? 'Sold out'
                  : available <= 5
                  ? 'Less than 5 remaining — limited stock'
                  : 'More than 5 remaining — limited stock'}
              </div>
            ))}

          {/* Price + CTA */}
          <Col className="mt-auto gap-2">
            <Col className="gap-1">
              <Row className="items-baseline justify-between gap-2">
                <div className="text-ink-500 text-[10px] uppercase tracking-wider">
                  {comingSoon ? 'Price' : 'Your cost'}
                </div>
                {hasDiscount ? (
                  <Row className="items-center gap-1.5">
                    <span className="text-ink-500 text-sm line-through opacity-70">
                      {formatMoney(item.price)}
                    </span>
                    <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/50 dark:text-green-300">
                      -{Math.round((1 - discountedPrice / item.price) * 100)}%
                    </span>
                  </Row>
                ) : (
                  <div className="text-ink-900 text-xl font-bold">
                    {formatMoney(discountedPrice)}
                  </div>
                )}
              </Row>
              {hasDiscount && (
                <div className="text-ink-900 text-right text-xl font-bold">
                  {formatMoney(discountedPrice)}
                </div>
              )}
            </Col>
            <Button
              color={comingSoon ? 'gray' : 'amber'}
              size="sm"
              disabled={!canPurchase}
              onClick={() => setShowPurchaseModal(true)}
            >
              {comingSoon
                ? 'Available Soon'
                : alreadyPurchased
                ? 'Purchased'
                : soldOut
                ? 'Sold Out'
                : !user
                ? 'Sign in to claim'
                : user.balance < discountedPrice
                ? 'Insufficient balance'
                : isEarlyBird
                ? 'Claim Early Bird Code'
                : 'Buy Ticket'}
            </Button>
          </Col>
        </Col>
      </div>

      <Modal
        open={showPurchaseModal}
        setOpen={(open) => {
          if (!open) {
            // Block accidental dismissal while mid-purchase or during countdown
            if (purchasing) return
            if (purchaseResult && doneCountdown > 0) return
            closeAndReset()
          }
        }}
        size="md"
      >
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          {purchaseResult ? (
            <>
              <div className="text-lg font-semibold">
                {purchaseResult.discountCode
                  ? 'Your discount code'
                  : 'Purchase successful'}
              </div>
              {purchaseResult.discountCode ? (
                <Row className="items-stretch gap-2">
                  <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-teal-500 bg-white p-4">
                    <div className="text-2xl font-bold tracking-widest text-teal-700">
                      {purchaseResult.discountCode}
                    </div>
                  </div>
                  <Button
                    color="indigo"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          purchaseResult.discountCode!
                        )
                        toast.success('Code copied!')
                      } catch {
                        toast.error('Copy failed')
                      }
                    }}
                  >
                    Copy
                  </Button>
                </Row>
              ) : (
                <div className="border-scarlet-400 bg-scarlet-100 dark:border-scarlet-500/50 dark:bg-scarlet-500/20 rounded-lg border-2 p-4 text-sm leading-relaxed">
                  <div className="text-scarlet-900 dark:text-scarlet-100 font-semibold">
                    Your purchase was successful, but we couldn't find a code.
                  </div>
                  <div className="text-scarlet-800 dark:text-scarlet-200 mt-1">
                    Contact{' '}
                    <a
                      href="mailto:tod@manifold.markets"
                      className="font-semibold underline"
                    >
                      tod@manifold.markets
                    </a>{' '}
                    or{' '}
                    <Link href="/Genzy" className="font-semibold underline">
                      @Genzy
                    </Link>{' '}
                    on site to get your code.
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <div className="font-semibold text-amber-800 dark:text-amber-200">
                  Important:
                </div>
                <ul className="ml-4 mt-1 list-disc space-y-1 text-amber-700 dark:text-amber-300">
                  <li>
                    This code is <b>single-use per person</b>.
                  </li>
                  <li>
                    <b>Non-transferable</b> — the email on your manifest.is
                    ticket must match your Manifold email.
                  </li>
                  <li>
                    Apply it at checkout on the{' '}
                    <a
                      href="https://manifest.is/#tickets"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline"
                    >
                      Manifest ticket page
                    </a>{' '}
                    for 100% off.
                  </li>
                  <li>Save this code now — it will not be shown again.</li>
                </ul>
              </div>
              <div className="text-ink-500 text-sm">
                {purchaseResult.remainingStock} ticket
                {purchaseResult.remainingStock === 1 ? '' : 's'} remaining.
              </div>
              <Button
                color="indigo"
                disabled={doneCountdown > 0}
                onClick={closeAndReset}
              >
                {doneCountdown > 0 ? `Done (${doneCountdown})` : 'Done'}
              </Button>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold">Buy {item.name}</div>
              <div className="text-ink-600 text-sm">
                You will be charged {formatMoney(discountedPrice)}
                {hasDiscount && ' (supporter discount applied)'} and receive a
                100%-off discount code for Manifest 2026.
              </div>
              <Col className="gap-1">
                <div className="text-sm font-medium">Your email</div>
                <div className="bg-canvas-50 border-ink-200 rounded border px-3 py-2 font-mono text-sm">
                  {userEmail ?? '—'}
                </div>
                <div className="text-ink-500 text-xs">
                  The email on your manifest.is ticket must match this email, or
                  it may be invalidated. Contact{' '}
                  <a href="mailto:info@manifold.markets" className="underline">
                    info@manifold.markets
                  </a>{' '}
                  if this is an issue.
                </div>
              </Col>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-amber-700 dark:text-amber-300">
                  I understand the discount code is single-use and
                  non-transferable.
                </span>
              </label>
              <Row className="justify-end gap-2">
                <Button color="gray" onClick={closeAndReset}>
                  Cancel
                </Button>
                <Button
                  color="indigo"
                  loading={purchasing}
                  disabled={purchasing || !acceptedTerms || !userEmail}
                  onClick={handleBuy}
                >
                  Confirm Purchase ({formatMoney(discountedPrice)})
                </Button>
              </Row>
            </>
          )}
        </Col>
      </Modal>
    </>
  )
}

/** Renders the merch grid plus its "Merch" heading (heading hidden on the
 *  merch filter, since the page header already names the section). Pulled out
 *  so the shop page can render it in two positions: promoted above the regular
 *  grid when any merch item is NEW to the user, or in its default spot below. */
function MerchSection(props: {
  user: User | null | undefined
  entitlements: UserEntitlement[]
  purchasedMerchIds: Set<string>
  outOfStockIds: Set<string>
  isItemNewToUser: (item: ShopItem) => boolean
  showHidden: boolean
  filterOption: string
  onPurchased: () => void
}) {
  const {
    user,
    entitlements,
    purchasedMerchIds,
    outOfStockIds,
    isItemNewToUser,
    showHidden,
    filterOption,
    onPurchased,
  } = props
  if (filterOption !== 'all' && filterOption !== 'merch') return null
  const items = getMerchItems().filter((item) => !item.hidden || showHidden)
  if (items.length === 0) return null
  return (
    <>
      {filterOption !== 'merch' && (
        <Row className="mb-4 mt-8 items-center gap-2">
          <span className="text-lg font-semibold">Merch</span>
          <span className="text-ink-500 text-sm">(Ships worldwide)</span>
        </Row>
      )}
      <div
        className={clsx(
          'mb-8 grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 lg:grid-cols-3',
          filterOption === 'merch' && 'mt-0'
        )}
      >
        {items.map((item) => (
          <MerchItemCard
            key={item.id}
            item={item}
            user={user}
            allEntitlements={entitlements}
            alreadyPurchased={purchasedMerchIds.has(item.id)}
            outOfStock={outOfStockIds.has(item.id)}
            isNew={isItemNewToUser(item)}
            onPurchased={onPurchased}
          />
        ))}
      </div>
    </>
  )
}

function MerchItemCard(props: {
  item: ShopItem
  user: User | null | undefined
  allEntitlements?: UserEntitlement[]
  alreadyPurchased?: boolean
  outOfStock?: boolean
  isNew?: boolean
  onPurchased?: () => void
}) {
  const {
    item,
    user,
    allEntitlements,
    alreadyPurchased,
    outOfStock,
    isNew,
    onPurchased,
  } = props
  const shopDiscount = getBenefit(allEntitlements, 'shopDiscount', 0)
  const discountedPrice =
    shopDiscount > 0 ? Math.floor(item.price * (1 - shopDiscount)) : item.price
  const hasDiscount = shopDiscount > 0
  // Distinct colours offered by this item (in catalog order). Empty for
  // single-colour items (caps, AGGC tee) — colour selector hides when empty.
  const colors = useMemo(
    () =>
      Array.from(
        new Set(
          (item.variants ?? [])
            .map((v) => v.color)
            .filter((c): c is string => !!c)
        )
      ),
    [item.variants]
  )
  const hasColors = colors.length > 0
  const [selectedColor, setSelectedColor] = useState<string | null>(
    hasColors ? colors[0] : null
  )
  // Sizes available for the current colour selection (or all sizes if the
  // item is single-colour).
  const sizesForSelection = (item.variants ?? []).filter(
    (v) => !hasColors || v.color === selectedColor
  )
  const singleVariant = sizesForSelection.length === 1
  const [selectedSize, setSelectedSize] = useState<string | null>(
    singleVariant ? sizesForSelection[0].size : null
  )
  // If the user picks a colour where their previously-selected size doesn't
  // exist, drop the selection so they re-pick.
  useEffect(() => {
    if (
      selectedSize &&
      !sizesForSelection.some((v) => v.size === selectedSize)
    ) {
      setSelectedSize(singleVariant ? sizesForSelection[0].size : null)
    }
    // sizesForSelection rebuilds every render — depend on selectedColor instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColor])
  const [currentImageIndex, setCurrentImageIndex] = useState(
    item.defaultImageIndex ?? 0
  )
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [showShippingModal, setShowShippingModal] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [fetchingRates, setFetchingRates] = useState(false)
  const [shippingRates, setShippingRates] = useState<ShippingRate[] | null>(
    null
  )
  const [selectedShipping, setSelectedShipping] = useState<ShippingRate | null>(
    null
  )
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

  // Per-colour image carousel takes precedence when set; falls back to the
  // shared `merchImages` for single-colour items.
  const images = (hasColors &&
    selectedColor &&
    item.merchImagesByColor?.[selectedColor]) ||
    item.merchImages || [{ label: 'Front', url: item.imageUrl || '' }]
  // Reset the carousel when the user swaps colours so they always start on
  // the new colour's default image (or the first image when no default set).
  useEffect(() => {
    setCurrentImageIndex(item.defaultImageIndex ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColor])

  // Touch-swipe gestures for the image carousel. The image translates with
  // the finger in real time for tactile feedback; on release we either commit
  // (if dragged past the threshold) or snap back with a transition.
  // Direction is locked after 8px of motion — mostly-vertical motion is
  // ignored so page scroll still works when the finger starts on the image.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isSwipeActive, setIsSwipeActive] = useState(false)
  const SWIPE_COMMIT_THRESHOLD = 40
  const SWIPE_DIRECTION_LOCK = 8

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    setIsSwipeActive(false)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStartRef.current
    if (!start || images.length <= 1) return
    const t = e.touches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (!isSwipeActive) {
      if (
        Math.abs(dx) < SWIPE_DIRECTION_LOCK &&
        Math.abs(dy) < SWIPE_DIRECTION_LOCK
      )
        return
      if (Math.abs(dx) <= Math.abs(dy)) {
        // User is scrolling vertically — abandon this gesture for the carousel.
        touchStartRef.current = null
        return
      }
      setIsSwipeActive(true)
    }
    setDragOffset(dx)
  }
  const handleTouchEnd = () => {
    const dx = dragOffset
    const wasActive = isSwipeActive
    touchStartRef.current = null
    if (!wasActive) {
      setDragOffset(0)
      setIsSwipeActive(false)
      return
    }
    if (Math.abs(dx) < SWIPE_COMMIT_THRESHOLD) {
      // Below threshold: snap back with the transition.
      setDragOffset(0)
      setIsSwipeActive(false)
      return
    }
    // Above threshold: flip index, then let the strip's transition slide it
    // to the new resting position. Wrap-around (last → first or first → last)
    // would slide the strip across every image in between, so for those we
    // suppress the transition for one frame and snap to the target instead.
    const isWrap =
      (dx < 0 && currentImageIndex === images.length - 1) ||
      (dx > 0 && currentImageIndex === 0)
    if (dx < 0) {
      setCurrentImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))
    } else {
      setCurrentImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))
    }
    setDragOffset(0)
    if (isWrap) {
      requestAnimationFrame(() => setIsSwipeActive(false))
    } else {
      setIsSwipeActive(false)
    }
  }

  // Pick the variant matching the user's colour + size selection.
  const findSelectedVariant = () =>
    variants.find(
      (v) =>
        v.size === selectedSize && (!hasColors || v.color === selectedColor)
    )

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
    const variant = findSelectedVariant()
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
    const variant = findSelectedVariant()
    if (!variant) return

    setPurchasing(true)
    try {
      const shippingMana = Math.round(parseFloat(selectedShipping.rate) * 100)
      const result = await api('shop-purchase-merch', {
        itemId: item.id,
        variantId: variant.printfulSyncVariantId,
        shippingCost: shippingMana,
        shipping: shippingInfo,
      })
      toast.success(`Order placed! Order ID: ${result.printfulOrderId}`)
      setShowConfirmOrderModal(false)
      setShowShippingModal(false)
      setSelectedSize(null)
      setShippingRates(null)
      setSelectedShipping(null)
      setShippingInfo({
        name: '',
        address1: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
      })
      onPurchased?.()
    } catch (e: any) {
      toast.error(e.message || 'Failed to place order')
      setShowConfirmOrderModal(false)
    } finally {
      setPurchasing(false)
    }
  }

  const zipRequired = requiresPostalCode(shippingInfo.country)
  const canGetRates =
    shippingInfo.address1 &&
    shippingInfo.city &&
    (!zipRequired || shippingInfo.zip)

  return (
    <>
      {/* Wrap Card in a relative flex column so (a) the NEW sticker can
          overflow the card's clipping, and (b) the Card stretches to the full
          grid-cell height — without that the inner mt-auto on the price/buy
          row has no extra space to consume and the button doesn't anchor to
          the bottom. */}
      <div className="group relative flex h-full flex-col pb-2">
        {isNew && <NewBadge variant="sticker" />}
        <Card
          className={clsx(
            'relative flex flex-1 flex-col gap-3 overflow-hidden p-4 transition-all duration-200',
            outOfStock || alreadyPurchased
              ? 'opacity-75'
              : 'group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-indigo-200/50 group-hover:ring-2 group-hover:ring-indigo-500 dark:group-hover:shadow-indigo-900/30'
          )}
        >
          {outOfStock && (
            <div className="absolute right-2 top-2 z-10 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
              Out of Stock
            </div>
          )}
          {alreadyPurchased && !outOfStock && (
            <div className="absolute right-2 top-2 z-10 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400">
              Purchased
            </div>
          )}
          {item.hidden && !outOfStock && !alreadyPurchased && (
            <div className="absolute right-2 top-2 z-10 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
              Hidden
            </div>
          )}

          {/* Image carousel — all images laid out in a horizontal strip; we
              translate the strip rather than the visible image so neighbouring
              images slide in from the side as the user drags. */}
          <div
            className="relative aspect-square touch-pan-y overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            {(() => {
              // Pad the strip with wrap-around clones so a swipe at either
              // edge reveals the image it'll wrap to (last image pulls in
              // from the left at index 0; first image pulls in from the right
              // at the last index). After commit, the index flips and the
              // strip silently snaps to the real position of the same image
              // (see isWrap branch in handleTouchEnd) — no visible jump since
              // both padded positions display the same URL.
              const hasMultiple = images.length > 1
              const padded = hasMultiple
                ? [images[images.length - 1], ...images, images[0]]
                : images
              const slot = hasMultiple ? currentImageIndex + 1 : 0
              return (
                <div
                  className={clsx(
                    'flex h-full will-change-transform',
                    // Soft ease-out-quint (cubic-bezier(0.22, 1, 0.36, 1)) +
                    // ~400ms: small swipes glide back, commits settle in.
                    !isSwipeActive &&
                      'transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
                  )}
                  style={{
                    width: `${padded.length * 100}%`,
                    transform: `translateX(calc(${
                      -slot * (100 / padded.length)
                    }% + ${dragOffset}px))`,
                  }}
                >
                  {padded.map((img, idx) => (
                    <img
                      key={idx}
                      src={img.url}
                      alt={`${item.name} - ${img.label}`}
                      className="h-full object-contain p-2"
                      style={{
                        width: `${100 / padded.length}%`,
                        flexShrink: 0,
                      }}
                      draggable={false}
                    />
                  ))}
                </div>
              )
            })()}
            {images.length > 1 && (
              <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm">
                {images[currentImageIndex].label}
              </div>
            )}
            <Row className="absolute bottom-2 left-1/2 -translate-x-1/2 gap-1.5">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={clsx(
                    'h-2 w-2 rounded-full transition-all',
                    currentImageIndex === idx
                      ? 'w-4 bg-indigo-500'
                      : 'bg-white/70 hover:bg-white'
                  )}
                />
              ))}
            </Row>
            {images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setCurrentImageIndex((i) =>
                      i === 0 ? images.length - 1 : i - 1
                    )
                  }
                  className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 opacity-0 shadow transition-opacity hover:bg-white group-hover:opacity-100"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    setCurrentImageIndex((i) =>
                      i === images.length - 1 ? 0 : i + 1
                    )
                  }
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 opacity-0 shadow transition-opacity hover:bg-white group-hover:opacity-100"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Title and description */}
          <div className="text-base font-semibold sm:text-lg">{item.name}</div>
          <p className="text-ink-600 text-sm">{item.description}</p>

          {/* Colour selector — shown only when the item has multiple colours.
            Same flex-wrap pattern as the size row below. Each colour swap
            updates the image carousel and re-filters the available sizes. */}
          {hasColors && (
            <Row className="flex-wrap items-center gap-1.5">
              <span className="text-ink-600 mr-1 text-sm font-medium">
                Colour:
              </span>
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={clsx(
                    'rounded-md border px-2 py-0.5 text-xs font-medium transition-all',
                    selectedColor === color
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                      : 'border-ink-200 hover:border-ink-400 text-ink-700'
                  )}
                >
                  {color}
                </button>
              ))}
            </Row>
          )}

          {/* Size selector (hidden for single-variant items like one-size caps).
            Label + buttons share one flex-wrap row so the first few sizes sit
            inline with "Size:" and only the overflow wraps onto line 2. */}
          {!singleVariant && (
            <Row className="flex-wrap items-center gap-1.5">
              <span className="text-ink-600 mr-1 text-sm font-medium">
                Size:
              </span>
              {sizesForSelection.map((variant) => (
                <button
                  key={variant.size}
                  onClick={() => setSelectedSize(variant.size)}
                  className={clsx(
                    'rounded-md border px-2 py-0.5 text-xs font-medium transition-all',
                    selectedSize === variant.size
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                      : 'border-ink-200 hover:border-ink-400 text-ink-700'
                  )}
                >
                  {variant.size}
                </button>
              ))}
            </Row>
          )}

          {/* Price block + full-width buy button stacked below.
            Keeps the 3-wide grid readable — the old side-by-side layout
            crammed the pricing into ~half a card and wrapped the button
            text. Strikethrough original price sits ABOVE the discounted
            price, matching the regular ShopItemCard layout. */}
          <Col className="border-ink-200 mt-auto gap-2 border-t pt-3">
            <Col className="gap-0.5">
              {hasDiscount && (
                <span className="text-ink-400 text-xs line-through">
                  {formatMoney(item.price)}
                </span>
              )}
              <div className="text-lg font-bold text-teal-600">
                {hasDiscount
                  ? formatMoney(discountedPrice)
                  : formatMoney(item.price)}
                {hasDiscount && (
                  <span className="ml-1 text-xs text-green-600">
                    ({Math.round(shopDiscount * 100)}% off)
                  </span>
                )}
              </div>
              <span className="text-ink-500 text-xs">
                + shipping (paid in mana)
              </span>
              {item.limit === 'one-time' && (
                <Row className="text-ink-500 mt-0.5 items-center gap-1 text-xs">
                  <span>Limit 1 per customer</span>
                  <InfoTooltip
                    text="Can't get enough? Keep an eye out for new merch drops!"
                    size="sm"
                  />
                </Row>
              )}
            </Col>
            {outOfStock ? (
              <Button size="sm" color="gray" disabled className="w-full">
                Out of Stock
              </Button>
            ) : alreadyPurchased ? (
              <Button size="sm" color="gray" disabled className="w-full">
                Purchased
              </Button>
            ) : !canPurchase && user ? (
              <Link href="/checkout" className="w-full">
                <Button size="sm" color="gradient-pink" className="w-full">
                  Buy mana
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                color="indigo"
                disabled={!user || !selectedSize}
                onClick={handleBuyClick}
                className="w-full"
              >
                {selectedSize ? 'Buy' : 'Select a size'}
              </Button>
            )}
          </Col>
        </Card>
      </div>

      {/* Purchase confirmation modal */}
      <Modal open={showPurchaseModal} setOpen={setShowPurchaseModal} size="md">
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <div className="text-lg font-semibold">Confirm Purchase</div>
          <p className="text-ink-600">
            You're ordering: <strong>{item.name}</strong>
            {!singleVariant && <> (Size: {selectedSize})</>}
          </p>
          <p className="text-ink-600">
            Price:{' '}
            <span className="font-semibold text-teal-600">
              {formatMoney(discountedPrice)}
            </span>
            {hasDiscount && (
              <span className="text-ink-400 ml-1 text-sm line-through">
                {formatMoney(item.price)}
              </span>
            )}
            <span className="text-ink-500 text-sm"> + shipping</span>
          </p>
          <p className="text-ink-500 text-sm">
            All costs (item + shipping) are paid in mana.
          </p>

          {/* Size Guide (only for multi-size items like t-shirts) */}
          {!singleVariant && (
            <Col className="bg-canvas-50 gap-2 rounded-lg p-3">
              <div className="text-sm font-semibold">
                Size Guide (Gildan 64000)
              </div>
              <div className="overflow-x-auto">
                <table className="text-ink-600 w-full text-xs">
                  <thead>
                    <tr className="border-ink-200 border-b">
                      <th className="py-1 pr-3 text-left font-medium">Size</th>
                      <th className="px-2 py-1 text-center font-medium">
                        Chest (in)
                      </th>
                      <th className="px-2 py-1 text-center font-medium">
                        Length (in)
                      </th>
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
                      <tr
                        key={row.size}
                        className={
                          selectedSize === row.size
                            ? 'bg-indigo-50 dark:bg-indigo-950/30'
                            : ''
                        }
                      >
                        <td className="py-1 pr-3 font-medium">{row.size}</td>
                        <td className="px-2 py-1 text-center">{row.chest}</td>
                        <td className="px-2 py-1 text-center">{row.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-ink-500 text-xs">
                Measurements are approximate. When in doubt, size up!
              </p>
            </Col>
          )}

          <div className="rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
            <p className="text-blue-700 dark:text-blue-300">
              After confirming, you'll enter your shipping address. Your address
              is sent directly to our fulfillment partner and{' '}
              <strong>not stored</strong> by Manifold.
            </p>
          </div>

          <Row className="justify-end gap-2">
            <Button color="gray" onClick={() => setShowPurchaseModal(false)}>
              Cancel
            </Button>
            <Button color="indigo" onClick={handleProceedToShipping}>
              Continue to Shipping
            </Button>
          </Row>
        </Col>
      </Modal>

      {/* Shipping address modal */}
      <Modal open={showShippingModal} setOpen={setShowShippingModal} size="md">
        <Col className="bg-canvas-0 gap-4 rounded-md p-6">
          <div className="text-lg font-semibold">Shipping Address</div>
          <p className="text-ink-500 text-sm">
            Enter your shipping details. This info is sent directly to our
            fulfillment partner and not stored by Manifold.
          </p>

          <Col className="gap-3">
            <input
              type="text"
              placeholder="Full name"
              value={shippingInfo.name}
              onChange={(e) =>
                setShippingInfo((s) => ({ ...s, name: e.target.value }))
              }
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Street address"
              value={shippingInfo.address1}
              onChange={(e) =>
                setShippingInfo((s) => ({ ...s, address1: e.target.value }))
              }
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Apt, suite, etc. (optional)"
              value={shippingInfo.address2}
              onChange={(e) =>
                setShippingInfo((s) => ({ ...s, address2: e.target.value }))
              }
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="City"
              value={shippingInfo.city}
              onChange={(e) =>
                setShippingInfo((s) => ({ ...s, city: e.target.value }))
              }
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:hidden"
            />
            <Row className="w-full gap-3">
              <input
                type="text"
                placeholder="City"
                value={shippingInfo.city}
                onChange={(e) =>
                  setShippingInfo((s) => ({ ...s, city: e.target.value }))
                }
                className="border-ink-300 bg-canvas-0 hidden min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:block"
              />
              <input
                type="text"
                placeholder="State"
                value={shippingInfo.state}
                onChange={(e) =>
                  setShippingInfo((s) => ({ ...s, state: e.target.value }))
                }
                className="border-ink-300 bg-canvas-0 min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-24 sm:flex-none"
              />
              <input
                type="text"
                placeholder={zipRequired ? 'ZIP' : 'ZIP (optional)'}
                value={shippingInfo.zip}
                onChange={(e) =>
                  setShippingInfo((s) => ({ ...s, zip: e.target.value }))
                }
                className="border-ink-300 bg-canvas-0 min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-24 sm:flex-none"
              />
            </Row>
            <select
              value={shippingInfo.country}
              onChange={(e) => {
                setShippingInfo((s) => ({ ...s, country: e.target.value }))
                setShippingRates(null)
                setSelectedShipping(null)
              }}
              className="border-ink-300 bg-canvas-0 w-full rounded-md border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Col>

          {!shippingRates && (
            <Button
              color="indigo-outline"
              onClick={handleGetShippingRates}
              loading={fetchingRates}
              disabled={!canGetRates}
              className="w-full"
            >
              {fetchingRates ? 'Getting rates...' : 'Get Shipping Rates'}
            </Button>
          )}

          {shippingRates && shippingRates.length > 0 && (
            <Col className="gap-2">
              <Row className="items-center justify-between">
                <div className="text-sm font-medium">
                  Select shipping option:
                </div>
                <span className="text-ink-500 text-xs">Prices in mana</span>
              </Row>
              {shippingRates.map((rate) => {
                const shippingMana = Math.round(parseFloat(rate.rate) * 100)
                return (
                  <button
                    key={rate.id}
                    onClick={() => setSelectedShipping(rate)}
                    className={clsx(
                      'flex items-center justify-between rounded-lg border-2 p-3 text-left transition-all',
                      selectedShipping?.id === rate.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                        : 'border-ink-200 hover:border-ink-400'
                    )}
                  >
                    <div>
                      <div className="font-medium">{rate.name}</div>
                      <div className="text-ink-500 text-xs">
                        {rate.minDeliveryDays === rate.maxDeliveryDays
                          ? `${rate.minDeliveryDays} business days`
                          : `${rate.minDeliveryDays}-${rate.maxDeliveryDays} business days`}
                      </div>
                    </div>
                    <div className="font-semibold text-teal-600">
                      {formatMoney(shippingMana)}
                    </div>
                  </button>
                )
              })}
            </Col>
          )}

          {shippingRates && shippingRates.length === 0 && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              No shipping options available for this address. Please check your
              address details.
            </div>
          )}

          <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <Row className="items-start gap-2">
              <span className="text-amber-700 dark:text-amber-300">
                Please double-check your address. Orders ship directly from our
                partner and cannot be easily modified after submission.
              </span>
            </Row>
          </div>

          <Row className="justify-end gap-2">
            <Button color="gray" onClick={() => setShowShippingModal(false)}>
              Back
            </Button>
            <Button
              color="indigo"
              disabled={!shippingInfo.name || !selectedShipping}
              onClick={() => {
                setAcceptedTerms(false)
                setShowConfirmOrderModal(true)
              }}
            >
              Place Order ({formatMoney(discountedPrice)}
              {selectedShipping &&
                ` + ${formatMoney(
                  Math.round(parseFloat(selectedShipping.rate) * 100)
                )} shipping`}
              )
            </Button>
          </Row>
        </Col>
      </Modal>

      {/* Final confirmation modal */}
      <Modal
        open={showConfirmOrderModal}
        setOpen={setShowConfirmOrderModal}
        size="md"
      >
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
              <span className="text-right font-medium">
                {shippingInfo.name}
                <br />
                {shippingInfo.address1}
                {shippingInfo.address2 && `, ${shippingInfo.address2}`}
                <br />
                {[shippingInfo.city, shippingInfo.state, shippingInfo.zip]
                  .filter(Boolean)
                  .join(', ')}
                <br />
                {COUNTRIES.find((c) => c.code === shippingInfo.country)?.name}
              </span>
            </Row>
            {selectedShipping && (
              <Row className="justify-between">
                <span className="text-ink-500">Shipping method:</span>
                <span className="font-medium">
                  {selectedShipping.name} (
                  {selectedShipping.minDeliveryDays ===
                  selectedShipping.maxDeliveryDays
                    ? `${selectedShipping.minDeliveryDays} days`
                    : `${selectedShipping.minDeliveryDays}-${selectedShipping.maxDeliveryDays} days`}
                  )
                </span>
              </Row>
            )}
            <div className="border-ink-200 my-1 border-t" />
            <Row className="justify-between">
              <span className="text-ink-500">Item price:</span>
              <span className="font-medium">
                {formatMoney(discountedPrice)}
                {hasDiscount && (
                  <span className="text-ink-400 ml-1 text-xs line-through">
                    {formatMoney(item.price)}
                  </span>
                )}
              </span>
            </Row>
            {selectedShipping && (
              <Row className="justify-between">
                <span className="text-ink-500">Shipping:</span>
                <span className="font-medium">
                  {formatMoney(
                    Math.round(parseFloat(selectedShipping.rate) * 100)
                  )}
                </span>
              </Row>
            )}
            <Row className="justify-between text-base font-semibold">
              <span>Total (mana):</span>
              <span className="text-teal-600">
                {formatMoney(
                  discountedPrice +
                    (selectedShipping
                      ? Math.round(parseFloat(selectedShipping.rate) * 100)
                      : 0)
                )}
              </span>
            </Row>
          </Col>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-amber-700 dark:text-amber-300">
              I understand that orders are final once confirmed with our
              fulfillment partner. Refunds may be issued at admin discretion
              before an order ships. Mana spent on merch is non-refundable after
              shipment.
            </span>
          </label>

          <Row className="justify-end gap-2">
            <Button
              color="gray"
              onClick={() => setShowConfirmOrderModal(false)}
            >
              Go Back
            </Button>
            <Button
              color="indigo"
              loading={purchasing}
              disabled={countdown > 0 || purchasing || !acceptedTerms}
              onClick={handleSubmitOrder}
            >
              {purchasing
                ? 'Processing...'
                : countdown > 0
                ? `Confirm Order (${countdown})`
                : 'Confirm Order'}
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
      <label className="mt-3 flex cursor-pointer items-center gap-2">
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
  const { entitlements } = props
  const user = useUser()
  const [hoveredTier, setHoveredTier] = useState<SupporterTier | null>(null)

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

  // Check if device supports hover (desktop)
  const supportsHover =
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

  return (
    <>
      <div
        onClick={() => Router.push('/membership')}
        className={clsx(
          'group relative mb-6 w-full cursor-pointer overflow-hidden rounded-xl p-1 text-left transition-all duration-300',
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

        <div className="bg-canvas-0 relative rounded-lg p-4">
          {/* Header */}
          <Row className="items-start justify-between">
            <Row className="flex-wrap items-center gap-x-2 gap-y-0.5">
              <Row className="items-center gap-2">
                <FaStar
                  className="h-5 w-5 text-amber-500"
                  style={{
                    filter: 'drop-shadow(0 0 3px rgba(245, 158, 11, 0.5))',
                  }}
                />
                <span className="text-lg font-bold">Manifold Membership</span>
              </Row>
              <span className="text-primary-600 text-sm font-medium group-hover:underline">
                {isSupporter
                  ? isAutoRenewing
                    ? 'Manage Subscription →'
                    : 'Resubscribe →'
                  : 'See details & subscribe →'}
              </span>
            </Row>
            {isSupporter && (
              <div className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {SUPPORTER_TIERS[currentTier].name.toUpperCase()}
              </div>
            )}
          </Row>

          {/* Profile Preview - horizontal layout like modal */}
          <div className="my-3 rounded-lg bg-gradient-to-r from-amber-50/50 to-orange-50/50 px-3 py-2 dark:from-slate-700/50 dark:to-slate-700/50">
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

          {/* Mini Tier Selector (interactive with hover) — hidden for existing subscribers */}
          {!isSupporter && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {(['basic', 'plus', 'premium'] as const).map((tier) => {
                const isCurrentUserTier = currentTier === tier
                const isHovered = hoveredTier === tier
                return (
                  <button
                    key={tier}
                    onClick={(e) => {
                      e.stopPropagation()
                      Router.push(`/membership?tier=${tier}`)
                    }}
                    onMouseEnter={() => supportsHover && setHoveredTier(tier)}
                    onMouseLeave={() => supportsHover && setHoveredTier(null)}
                    className={clsx(
                      'relative flex flex-col items-center rounded-lg border-2 px-2 py-1.5 transition-all duration-150',
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
          )}
        </div>
      </div>
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
              href="/membership"
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

// Prize Drawing promotion card
function PrizeDrawingCard() {
  const { data } = useAPIGetter('get-sweepstakes', {})
  const sweepstakes = data?.sweepstakes
  const totalTickets = data?.totalTickets ?? 0
  const totalPrizePool = sweepstakes ? getTotalPrizePool(sweepstakes.prizes) : 0

  // Time remaining countdown
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  useEffect(() => {
    if (!sweepstakes) return
    const updateTime = () => {
      const now = Date.now()
      const diff = sweepstakes.closeTime - now
      if (diff <= 0) {
        setTimeRemaining('Ended')
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      )
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h`)
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`)
      } else {
        setTimeRemaining(`${minutes}m`)
      }
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [sweepstakes?.closeTime])

  // Loading skeleton — keeps the layout stable until sweepstakes data arrives
  if (!sweepstakes) {
    return (
      <div
        className={clsx(
          'overflow-hidden rounded-xl p-1',
          'bg-gradient-to-br from-gray-300 via-gray-200 to-gray-300 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700'
        )}
      >
        <div className="animate-pulse rounded-lg bg-white p-4 dark:bg-gray-900">
          <Row className="mb-3 items-center gap-2">
            <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          </Row>
          <Row className="mb-3 gap-4">
            <div className="h-12 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-12 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-12 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
          </Row>
          <div className="mb-3 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-8 w-full rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  const isClosed = sweepstakes.closeTime <= Date.now()

  if (isClosed) {
    return (
      <GiveawayPromoCard
        href="/prize"
        gradientClassName="from-teal-400 via-cyan-400 to-blue-500"
        hoverShadowClassName="group-hover:shadow-teal-200/50 dark:group-hover:shadow-teal-900/30"
        icon={<FaGift className="h-5 w-5 text-teal-500" />}
        title="Prize Drawing"
        pill={ENDED_PILL}
        stats={[
          {
            value: `$${totalPrizePool.toLocaleString()}`,
            label: 'Prize Pool',
            valueClassName: clsx(
              'font-bold text-teal-600',
              promoStatSizeClass(totalTickets, true)
            ),
          },
          {
            value: formatEntries(totalTickets),
            label: 'Entries',
            valueClassName: clsx(
              'font-bold text-blue-600',
              promoStatSizeClass(totalTickets, true)
            ),
          },
        ]}
        message="Drawing has ended. Winner will be announced soon!"
        ctaText="View Results →"
        ctaColor="indigo"
      />
    )
  }

  return (
    <GiveawayPromoCard
      href="/prize"
      gradientClassName="from-teal-400 via-cyan-400 to-blue-500"
      hoverShadowClassName="group-hover:shadow-teal-200/50 dark:group-hover:shadow-teal-900/30"
      icon={<FaGift className="h-5 w-5 text-teal-500" />}
      title="Prize Drawing"
      pill={{
        text: 'LIVE',
        className: 'bg-teal-100 text-teal-700 dark:bg-teal-500 dark:text-white',
      }}
      stats={[
        {
          value: `$${totalPrizePool.toLocaleString()}`,
          label: 'Prize Pool',
          valueClassName: clsx(
            'font-bold text-teal-600',
            promoStatSizeClass(totalTickets, true)
          ),
        },
        {
          value: timeRemaining || '...',
          label: 'Time Left',
          valueClassName: clsx(
            'font-bold text-cyan-600',
            promoStatSizeClass(totalTickets, true)
          ),
          extraClassName: 'whitespace-nowrap',
        },
        {
          value: formatEntries(totalTickets),
          label: 'Entries',
          valueClassName: clsx(
            'font-bold text-blue-600',
            promoStatSizeClass(totalTickets, true)
          ),
        },
      ]}
      ctaText="Enter Drawing →"
      ctaColor="indigo"
    />
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
        <BlackHoleSvg
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 64,
            height: 64,
            marginLeft: -8,
            marginTop: -8,
            filter: 'drop-shadow(0 0 8px rgba(147, 51, 234, 0.5))',
          }}
        />
        <Avatar
          username={user?.username}
          avatarUrl={user?.avatarUrl}
          size="lg"
          noLink
          className="relative shadow-[0_0_6px_rgba(147,51,234,0.5)] ring-1 ring-purple-500/40"
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

        {/* Flame cluster — ON TOP of avatar */}
        <FireFlamesSvg
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 overflow-visible"
          style={{ width: 66, height: 66 }}
          animate
        />

        {/* Smoke wisps drifting over flames — CSS divs for reliable animation */}
        <div
          className="pointer-events-none absolute z-20"
          style={{
            right: '-2%',
            bottom: '20%',
            width: '16px',
            height: '3px',
            background:
              'linear-gradient(135deg, rgba(200,200,210,0.7) 0%, rgba(160,165,175,0.4) 60%, transparent 100%)',
            borderRadius: '2px',
            filter: 'blur(1.5px)',
            animation: 'preview-flame-smoke-1 2.5s ease-out infinite',
          }}
        />
        <div
          className="pointer-events-none absolute z-20"
          style={{
            right: '2%',
            bottom: '26%',
            width: '12px',
            height: '2.5px',
            background:
              'linear-gradient(135deg, rgba(180,185,195,0.6) 0%, rgba(160,165,175,0.3) 60%, transparent 100%)',
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
          <div
            style={{
              position: 'absolute',
              left: '10%',
              top: '55%',
              width: '80%',
              height: '4px',
              background:
                'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.45) 20%, rgba(180,185,195,0.3) 60%, transparent 100%)',
              borderRadius: '2px',
              filter: 'blur(1.5px)',
              animation: 'preview-wisp-1 4s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '5%',
              top: '40%',
              width: '65%',
              height: '3.5px',
              background:
                'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.4) 30%, rgba(180,185,195,0.25) 70%, transparent 100%)',
              borderRadius: '2px',
              filter: 'blur(2px)',
              animation: 'preview-wisp-2 5s ease-in-out infinite',
              animationDelay: '0.8s',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '20%',
              top: '68%',
              width: '70%',
              height: '3.5px',
              background:
                'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.42) 25%, rgba(180,185,195,0.28) 55%, transparent 100%)',
              borderRadius: '2px',
              filter: 'blur(1.5px)',
              animation: 'preview-wisp-3 4.5s ease-in-out infinite',
              animationDelay: '1.5s',
            }}
          />
          {/* Ember particles — above the flames */}
          <div
            className="absolute h-[2px] w-[2px] rounded-full bg-amber-400"
            style={{
              left: '70%',
              top: '60%',
              boxShadow: '0 0 3px #fbbf24',
              animation: 'preview-ember-1 1.5s infinite ease-out',
            }}
          />
          <div
            className="absolute h-[1.5px] w-[1.5px] rounded-full bg-orange-500"
            style={{
              left: '66%',
              top: '66%',
              animation: 'preview-ember-2 2s infinite ease-out',
              animationDelay: '0.2s',
            }}
          />
          <div
            className="absolute h-[1.5px] w-[1.5px] rounded-full bg-red-500 opacity-80"
            style={{
              left: '76%',
              top: '54%',
              animation: 'preview-ember-3 1.8s infinite ease-out',
              animationDelay: '0.5s',
            }}
          />
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

  return (
    <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-4 transition-colors duration-200 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50">
      <div className="relative isolate">
        <AngelWingSvg
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: -10, width: 15, height: 46, opacity: 0.9, zIndex: -1 }}
        />
        <AngelWingSvg
          className="absolute top-1/2"
          style={{
            right: -10,
            width: 15,
            height: 46,
            opacity: 0.9,
            transform: 'translateY(-50%) scaleX(-1)',
            zIndex: -1,
          }}
        />
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
        <MonocleSvg
          className="absolute"
          style={{
            left: 6,
            top: 8,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
        />
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
        <CrystalBallSvg
          className="absolute"
          style={{
            right: -4,
            bottom: -4,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.6))',
          }}
        />
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
        <DisguiseOnAvatar size="lg" />
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
        <ArrowBadgeSvg
          direction={direction}
          className="absolute"
          style={{
            right: -4,
            bottom: -4,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
        />
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
        <StonksMemeArrowSvg
          className="pointer-events-none absolute"
          style={{
            left: '60%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 44,
            height: 44,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            zIndex: 10,
          }}
        />
      </div>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const RED_CAP_STYLE_LABELS = [
  'Classic',
  'Mini',
  'MANA',
  'MANA Left',
  'Left',
  'Mini Left',
  'MANA Right',
  'Right',
  'Mini Right',
]
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
              transform: isFrontFacing
                ? 'translateX(-50%)'
                : 'translateX(-50%) rotate(-5deg)',
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
      <span className="text-ink-500 text-xs">
        {RED_CAP_STYLE_LABELS[previewIndex]}
      </span>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const BLUE_CAP_STYLE_LABELS = [
  'Classic',
  'Mini',
  'MANA',
  'MANA Left',
  'Left',
  'Mini Left',
  'MANA Right',
  'Right',
  'Mini Right',
]
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
              transform: isFrontFacing
                ? 'translateX(-50%)'
                : 'translateX(-50%) rotate(-5deg)',
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
      <span className="text-ink-500 text-xs">
        {BLUE_CAP_STYLE_LABELS[previewIndex]}
      </span>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const GREEN_CAP_STYLE_LABELS = [
  'Classic',
  'Mini',
  'MANA',
  'MANA Left',
  'Left',
  'Mini Left',
  'MANA Right',
  'Right',
  'Mini Right',
]
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
              transform: isFrontFacing
                ? 'translateX(-50%)'
                : 'translateX(-50%) rotate(-5deg)',
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
      <span className="text-ink-500 text-xs">
        {GREEN_CAP_STYLE_LABELS[previewIndex]}
      </span>
    </div>
  )
}

// Style mapping: Front: 0 Classic, 1 Mini, 2 MANA | Left: 3 MANA, 4 Clean, 5 Mini | Right: 6 MANA, 7 Clean, 8 Mini
const BLACK_CAP_STYLE_LABELS = [
  'Classic',
  'Mini',
  'MANA',
  'MANA Left',
  'Left',
  'Mini Left',
  'MANA Right',
  'Right',
  'Mini Right',
]
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
              transform: isFrontFacing
                ? 'translateX(-50%)'
                : 'translateX(-50%) rotate(-5deg)',
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
      <span className="text-ink-500 text-xs">
        {BLACK_CAP_STYLE_LABELS[previewIndex]}
      </span>
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
        {/* Left horn */}
        <BullHornSvg
          className="absolute"
          style={{
            right: '50%',
            top: -11,
            width: 32,
            height: 24,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        />
        {/* Right horn (mirrored) */}
        <BullHornSvg
          className="absolute"
          style={{
            left: '50%',
            top: -11,
            width: 32,
            height: 24,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            transform: 'scaleX(-1)',
          }}
        />
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
        <BearEarSvg
          className="absolute origin-bottom rotate-[-25deg] transition-transform duration-300 group-hover:rotate-[-20deg]"
          style={{
            left: -1,
            top: -2,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        />
        {/* Right ear */}
        <BearEarSvg
          className="absolute origin-bottom rotate-[25deg] -scale-x-100 transition-transform duration-300 group-hover:rotate-[20deg]"
          style={{
            right: -1,
            top: -2,
            width: 18,
            height: 18,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        />
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
          <SantaHatSvg />
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
        <BunnyEarSvg
          className="absolute transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-5deg]"
          style={{
            left: 4,
            top: -18,
            width: 22,
            height: 33,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            transform: 'rotate(-15deg)',
          }}
        />
        {/* Right ear */}
        <BunnyEarSvg
          className="absolute transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[5deg]"
          style={{
            right: 4,
            top: -18,
            width: 22,
            height: 33,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            transform: 'rotate(15deg)',
          }}
        />
      </div>
    </div>
  )
}

const CAT_EARS_STYLE_COUNT = 2
const CAT_EARS_STYLE_LABELS = ['Ears', 'Ears + Whiskers']

function CatEarsStylePreview(props: {
  user: User | null | undefined
  selectedStyle?: number
  onSelect?: (style: number) => void
  owned?: boolean
}) {
  const { user, selectedStyle = 0, onSelect, owned } = props
  const [previewIndex, setPreviewIndex] = useState(
    Math.max(0, Math.min(selectedStyle, CAT_EARS_STYLE_COUNT - 1))
  )

  const cyclePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex =
      (previewIndex - 1 + CAT_EARS_STYLE_COUNT) % CAT_EARS_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) onSelect(newIndex)
  }
  const cycleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newIndex = (previewIndex + 1) % CAT_EARS_STYLE_COUNT
    setPreviewIndex(newIndex)
    if (owned && onSelect) onSelect(newIndex)
  }

  const showWhiskers = previewIndex === 1

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
          {showWhiskers && (
            <>
              {/* Light mode whiskers */}
              <CatWhiskersSvg
                className="absolute top-1/2 dark:hidden"
                style={{
                  left: -7,
                  width: 14,
                  height: 7,
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
                  transform: 'translateY(-50%) scaleX(-1)',
                }}
              />
              <CatWhiskersSvg
                className="absolute top-1/2 dark:hidden"
                style={{
                  right: -7,
                  width: 14,
                  height: 7,
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
                  transform: 'translateY(-50%)',
                }}
              />
              {/* Dark mode whiskers — subtle white glow */}
              <CatWhiskersSvg
                className="absolute top-1/2 hidden dark:block"
                style={{
                  left: -7,
                  width: 14,
                  height: 7,
                  filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.7))',
                  transform: 'translateY(-50%) scaleX(-1)',
                }}
              />
              <CatWhiskersSvg
                className="absolute top-1/2 hidden dark:block"
                style={{
                  right: -7,
                  width: 14,
                  height: 7,
                  filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.7))',
                  transform: 'translateY(-50%)',
                }}
              />
            </>
          )}
          <CatEarSvg
            className="absolute origin-bottom rotate-[-52deg] transition-transform duration-300 group-hover:rotate-[-44deg]"
            style={{
              left: -5,
              top: -2,
              width: 24,
              height: 14,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
            }}
          />
          <CatEarSvg
            className="absolute origin-bottom rotate-[52deg] -scale-x-100 transition-transform duration-300 group-hover:rotate-[44deg]"
            style={{
              right: -5,
              top: -2,
              width: 24,
              height: 14,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
            }}
          />
        </div>
        <button
          onClick={cycleNext}
          className="text-ink-400 hover:text-ink-600 flex flex-1 items-center justify-end py-2 pr-1"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Row>
      <span className="text-ink-500 text-xs">
        {CAT_EARS_STYLE_LABELS[previewIndex]}
      </span>
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
      (previewIndex - 1 + CROWN_POSITION_OPTIONS.length) %
      CROWN_POSITION_OPTIONS.length
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
          <div
            className={clsx(
              getPositionClasses(),
              'transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110'
            )}
          >
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
      <span className="text-ink-500 text-xs">
        {CROWN_POSITION_OPTIONS[previewIndex]}
      </span>
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
            <HaloSvg width="3.3rem" height="0.85rem" />
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
            <WizardHatSvg
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 0 3px rgba(139, 92, 246, 0.5))' }}
            />
          </div>
        )
      case 'tinfoil-hat':
        return (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <TinfoilHatSvg
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}
            />
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
            <JesterHatSvg
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
          </div>
        )
      case 'fedora':
        return (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110">
            <FedoraSvg
              className="h-5 w-5"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
          </div>
        )
      case 'devil-horns':
        return (
          <>
            {/* Left horn */}
            <DevilHornSvg
              side="left"
              className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
              style={{
                left: -3,
                top: -4,
                width: 12,
                height: 12,
                filter: 'drop-shadow(0 0 2px rgba(220, 38, 38, 0.5))',
                transform: 'rotate(-45deg)',
              }}
            />
            {/* Right horn */}
            <DevilHornSvg
              side="right"
              className="absolute transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110"
              style={{
                right: -3,
                top: -4,
                width: 12,
                height: 12,
                filter: 'drop-shadow(0 0 2px rgba(220, 38, 38, 0.5))',
                transform: 'rotate(45deg)',
              }}
            />
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

function HovercardSpinningBorderPreview(props: {
  user: User | null | undefined
}) {
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

export type HovercardBgType =
  | 'royalty'
  | 'mana-printer'
  | 'oracle'
  | 'trading-floor'
  | 'champions-legacy'

export function HovercardBackgroundPreview(props: {
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
              <polygon
                points="8,0 16,10 12,10 12,18 4,18 4,10 0,10"
                fill="#22C55E"
              />
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
              <linearGradient
                id="coin-gradient-preview"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#C4B5FD" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
            <g opacity="0.35">
              {/* Stick figure turning crank */}
              <circle
                cx="55"
                cy="62"
                r="6"
                stroke="#C4B5FD"
                strokeWidth="1.5"
                fill="none"
              />
              <line
                x1="55"
                y1="68"
                x2="55"
                y2="88"
                stroke="#C4B5FD"
                strokeWidth="1.5"
              />
              <line
                x1="55"
                y1="88"
                x2="48"
                y2="102"
                stroke="#C4B5FD"
                strokeWidth="1.5"
              />
              <line
                x1="55"
                y1="88"
                x2="62"
                y2="102"
                stroke="#C4B5FD"
                strokeWidth="1.5"
              />
              <line
                x1="55"
                y1="75"
                x2="78"
                y2="70"
                stroke="#C4B5FD"
                strokeWidth="1.5"
              />
              <line
                x1="55"
                y1="75"
                x2="45"
                y2="85"
                stroke="#C4B5FD"
                strokeWidth="1.5"
              />

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
              <circle
                cx="90"
                cy="70"
                r="6"
                stroke="#A78BFA"
                strokeWidth="1.5"
                fill="none"
              />
              <line
                x1="90"
                y1="70"
                x2="78"
                y2="70"
                stroke="#A78BFA"
                strokeWidth="1.5"
              />
              {/* Output slot */}
              <rect
                x="116"
                y="66"
                width="4"
                height="14"
                fill="#A78BFA"
                fillOpacity="0.4"
                rx="1"
              />

              {/* Mana coins with gradient and white M */}
              <g transform="translate(126, 72)">
                <circle
                  r="7"
                  fill="url(#coin-gradient-preview)"
                  stroke="#7C3AED"
                  strokeWidth="1.5"
                />
                <text
                  x="0"
                  y="3"
                  fontSize="9"
                  fontWeight="bold"
                  fill="white"
                  textAnchor="middle"
                >
                  M
                </text>
              </g>
              <g transform="translate(138, 90)" opacity="0.9">
                <circle
                  r="6"
                  fill="url(#coin-gradient-preview)"
                  stroke="#7C3AED"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="2.5"
                  fontSize="8"
                  fontWeight="bold"
                  fill="white"
                  textAnchor="middle"
                >
                  M
                </text>
              </g>
              <g transform="translate(148, 106)" opacity="0.75">
                <circle
                  r="5"
                  fill="url(#coin-gradient-preview)"
                  stroke="#7C3AED"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="2"
                  fontSize="7"
                  fontWeight="bold"
                  fill="white"
                  textAnchor="middle"
                >
                  M
                </text>
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
              <radialGradient
                id="cl-glow-p"
                cx="50%"
                cy="100%"
                r="100%"
                fx="50%"
                fy="100%"
              >
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.15" />
                <stop offset="60%" stopColor="#B45309" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#B45309" stopOpacity="0" />
              </radialGradient>
              <symbol id="cl-trophy-p" viewBox="0 0 100 100">
                <path
                  d="M20 10h60l-5 30c0 20-15 25-25 25s-25-5-25-25l-5-30z M45 65v15h-10l-5 10h40l-5-10h-10v-15h-10z M80 15c15 0 15 25 0 25v-5c8 0 8-15 0-15v-5z M20 15c-15 0-15 25 0 25v-5c-8 0-8-15 0-15v-5z"
                  fill="currentColor"
                />
              </symbol>
              <symbol id="cl-star-p" viewBox="0 0 20 20">
                <path
                  d="M10 0l2.5 7.5h7.5l-6 4.5 2.5 7.5-6-4.5-6 4.5 2.5-7.5-6-4.5h7.5z"
                  fill="currentColor"
                />
              </symbol>
            </defs>
            <rect width="176" height="120" fill="url(#cl-glow-p)" />
            {/* Main trophy — centered */}
            <use
              href="#cl-trophy-p"
              x="48"
              y="20"
              width="80"
              height="80"
              transform="rotate(8 88 60)"
              fill="#B45309"
              fillOpacity="0.07"
            />
            {/* Small accent trophies — top corners */}
            <use
              href="#cl-trophy-p"
              x="125"
              y="2"
              width="40"
              height="40"
              transform="rotate(-10 145 22)"
              fill="#D97706"
              fillOpacity="0.05"
            />
            <use
              href="#cl-trophy-p"
              x="5"
              y="2"
              width="35"
              height="35"
              transform="rotate(12 22 20)"
              fill="#D97706"
              fillOpacity="0.04"
            />
            {/* Laurel stems — bottom corners */}
            <path
              d="M12 115 C22 100 28 85 32 70"
              stroke="#D97706"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              fill="none"
            />
            <path
              d="M164 115 C154 100 148 85 144 70"
              stroke="#D97706"
              strokeWidth="1.5"
              strokeOpacity="0.1"
              fill="none"
            />
            {/* Leaves */}
            <g fill="#F59E0B" fillOpacity="0.1">
              <path d="M28 88 Q18 91 15 82 Q23 79 28 88" />
              <path d="M30 75 Q20 78 17 69 Q25 66 30 75" />
              <path d="M148 88 Q158 91 161 82 Q153 79 148 88" />
              <path d="M146 75 Q156 78 159 69 Q151 66 146 75" />
            </g>
            {/* Stars */}
            <use
              href="#cl-star-p"
              x="80"
              y="8"
              width="9"
              height="9"
              fill="#FBBF24"
              fillOpacity="0.2"
            />
            <use
              href="#cl-star-p"
              x="25"
              y="45"
              width="6"
              height="6"
              fill="#F59E0B"
              fillOpacity="0.12"
            />
            <use
              href="#cl-star-p"
              x="148"
              y="50"
              width="5"
              height="5"
              fill="#F59E0B"
              fillOpacity="0.12"
            />
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
      return (
        <CatEarsStylePreview
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
      return (
        <HovercardBackgroundPreview user={user} background="mana-printer" />
      )
    case 'hovercard-oracle':
      return <HovercardBackgroundPreview user={user} background="oracle" />
    case 'hovercard-trading-floor':
      return (
        <HovercardBackgroundPreview user={user} background="trading-floor" />
      )
    case 'former-charity-champion':
      return (
        <HovercardBackgroundPreview user={user} background="champions-legacy" />
      )
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
  isNew?: boolean
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
  onMetadataChange: (
    itemId: string,
    updatedEntitlement: UserEntitlement
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
    isNew,
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
    (item.type === 'permanent-toggleable' ||
      item.type === 'time-limited' ||
      item.type === 'earned') &&
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
      <div className="group flex pb-2">
        <Card
          ref={cardRef}
          className={clsx(
            'relative flex w-full cursor-default flex-col gap-3 p-4 transition-all duration-200',
            justPurchased && 'ring-2 ring-indigo-500 ring-offset-2',
            !justPurchased &&
              'group-hover:-translate-y-1 group-hover:shadow-xl group-hover:ring-2',
            !justPurchased &&
              isPremiumItem &&
              'group-hover:shadow-amber-200/50 group-hover:ring-amber-500 dark:group-hover:shadow-amber-900/30',
            !justPurchased &&
              !isPremiumItem &&
              'group-hover:shadow-indigo-200/50 group-hover:ring-indigo-500 dark:group-hover:shadow-indigo-900/30',
            isPremiumItem &&
              'dark:to-yellow-900/15 bg-gradient-to-br from-amber-50/50 to-yellow-50/50 dark:from-amber-900/20'
          )}
        >
          {/* NEW sticker — overflows the card's clipping */}
          {isNew && <NewBadge variant="sticker" />}

          {/* Loading overlay during purchase */}
          {purchasing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 dark:bg-gray-900/80">
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                <span className="text-ink-600 text-xs">Purchasing...</span>
              </div>
            </div>
          )}

          {/* Card header — title takes remaining space; badges wrap when crowded */}
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <div
              className={clsx(
                'min-w-0 flex-1 text-base font-semibold sm:text-lg',
                isPremiumItem && 'text-amber-700 dark:text-amber-400'
              )}
            >
              {item.name}
            </div>
            <div className="flex flex-wrap items-start justify-end gap-1">
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
              {['avatar-halo', 'avatar-angel-wings', 'avatar-crown'].includes(
                item.id
              ) &&
                !owned && (
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
              {/* Hidden badge — inline so it doesn't overlap the others */}
              {item.hidden &&
                !(
                  item.seasonalAvailability && isSeasonalItemAvailable(item)
                ) && (
                  <Tooltip
                    text={
                      owned
                        ? 'This item is only visible because you already own it'
                        : 'Hidden from the public shop'
                    }
                  >
                    <div className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 sm:px-2 sm:text-xs">
                      Hidden
                    </div>
                  </Tooltip>
                )}
            </div>
          </div>

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
          {item.animationTypes &&
            item.animationTypes.length > 0 &&
            (() => {
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
                  Expires{' '}
                  {new Date(entitlement.expiresTime).toLocaleDateString()}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {hasDiscount || item.originalPrice ? (
                    <Col className="min-w-0 gap-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink-400 text-xs line-through">
                          {formatMoney(item.originalPrice ?? item.price)}
                        </span>
                        {item.originalPrice && !hasDiscount && (
                          <span className="rounded bg-rose-100 px-1 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                            SALE
                          </span>
                        )}
                        {(hasDiscount || item.originalPrice) && (
                          <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/50 dark:text-green-300">
                            -
                            {Math.round(
                              (1 -
                                discountedPrice /
                                  (item.originalPrice ?? item.price)) *
                                100
                            )}
                            %
                          </span>
                        )}
                      </div>
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
                </div>

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
                      <Button
                        size="sm"
                        color="gradient-pink"
                        className="w-full"
                      >
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
            {hasDiscount || item.originalPrice ? (
              <>
                <span className="text-ink-400 line-through">
                  {formatMoney(item.originalPrice ?? item.price)}
                </span>{' '}
                <span className="font-semibold text-teal-600">
                  {formatMoney(discountedPrice)}
                </span>
                <span className="ml-1 text-xs text-green-600">
                  (
                  {Math.round(
                    (1 - discountedPrice / (item.originalPrice ?? item.price)) *
                      100
                  )}
                  % off)
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
