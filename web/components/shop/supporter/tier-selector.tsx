import clsx from 'clsx'
import { FaStar } from 'react-icons/fa'
import { formatMoney } from 'common/util/format'
import {
  SUPPORTER_TIERS,
  TIER_ORDER,
  SupporterTier,
  canUpgradeTo,
} from 'common/supporter-config'
import { TierBadge } from './tier-badge'
import { TIER_ITEMS } from './tier-items'

export type TierSelectorVariant = 'modal' | 'page'

export function TierSelector({
  currentTier,
  selectedTier,
  hoveredTier,
  onSelect,
  onHover,
  onHoverEnd,
  effectiveBalance,
  variant = 'page',
}: {
  currentTier: SupporterTier | null
  selectedTier: SupporterTier
  hoveredTier: SupporterTier | null
  onSelect: (tier: SupporterTier) => void
  onHover: (tier: SupporterTier) => void
  onHoverEnd: () => void
  effectiveBalance: number
  variant?: TierSelectorVariant
}) {
  const activeTier = hoveredTier ?? selectedTier

  return (
    <div className="grid grid-cols-3 gap-3">
      {TIER_ORDER.map((tier) => {
        const tierConfig = SUPPORTER_TIERS[tier]
        const item = TIER_ITEMS[tier]
        const isCurrentTier = currentTier === tier
        const canUpgrade = canUpgradeTo(currentTier, tier)
        const isLowerTier = !!currentTier && !canUpgrade && !isCurrentTier
        const isActive = activeTier === tier
        const isSelected = selectedTier === tier
        const isHoveredOnly = hoveredTier === tier && !isSelected

        return (
          <button
            key={tier}
            onClick={() => !isLowerTier && onSelect(tier)}
            onMouseEnter={() => onHover(tier)}
            onMouseLeave={onHoverEnd}
            style={{ outline: 'none' }}
            className={clsx(
              'relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200',
              'outline-none focus:outline-none focus-visible:outline-none',
              isLowerTier && 'opacity-60',
              // Selected state - animated glowing border
              isSelected && tier === 'basic' && 'border-gray-500 bg-gray-100 shadow-[0_0_8px_rgba(107,114,128,0.5),0_0_16px_rgba(107,114,128,0.3)] dark:bg-gray-800/50 dark:shadow-[0_0_12px_rgba(156,163,175,0.4),0_0_20px_rgba(156,163,175,0.2)]',
              isSelected && tier === 'plus' && 'border-indigo-500 bg-indigo-100 shadow-[0_0_12px_rgba(99,102,241,0.6),0_0_24px_rgba(99,102,241,0.4)] animate-glow-indigo dark:bg-indigo-900/40 dark:shadow-[0_0_16px_rgba(129,140,248,0.5),0_0_32px_rgba(129,140,248,0.3)]',
              isSelected && tier === 'premium' && 'border-amber-500 bg-amber-100/80 shadow-[0_0_16px_rgba(245,158,11,0.6),0_0_32px_rgba(245,158,11,0.4)] animate-glow-amber dark:bg-amber-900/30 dark:shadow-[0_0_20px_rgba(251,191,36,0.5),0_0_40px_rgba(251,191,36,0.25)]',
              // Hover only state - lighter glow
              isHoveredOnly && tier === 'basic' && 'border-gray-400 bg-gray-50 shadow-[0_0_0_2px_rgba(156,163,175,0.25)] dark:bg-gray-900/30',
              isHoveredOnly && tier === 'plus' && 'border-indigo-400 bg-indigo-50 shadow-[0_0_0_2px_rgba(129,140,248,0.3),0_2px_8px_rgba(99,102,241,0.15)] dark:bg-indigo-950/30',
              isHoveredOnly && tier === 'premium' && 'border-amber-400 bg-amber-50 shadow-[0_0_0_2px_rgba(251,191,36,0.3),0_2px_12px_rgba(245,158,11,0.2)] dark:bg-amber-950/30',
              // Default state
              !isActive && 'border-ink-200 bg-canvas-0 hover:border-ink-300'
            )}
          >
            {/* Top badge - differs by variant */}
            {variant === 'page' ? (
              <>
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
              </>
            ) : (
              isCurrentTier && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  OWNED
                </div>
              )
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
  )
}
