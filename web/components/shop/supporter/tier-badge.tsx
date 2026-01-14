import clsx from 'clsx'
import { FaStar } from 'react-icons/fa'
import { SupporterTier } from 'common/supporter-config'

export function TierBadge({
  tier,
  size = 'md',
  animate = false,
}: {
  tier: SupporterTier
  size?: 'sm' | 'md' | 'lg'
  animate?: boolean
}) {
  const sizeClass =
    size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
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

// Utility function to get tier star classes (for inline usage where component isn't suitable)
export function getTierStarClasses(tier: SupporterTier): string {
  return clsx(
    tier === 'basic' && 'text-gray-400',
    tier === 'plus' && 'text-indigo-500',
    tier === 'premium' && 'text-amber-500'
  )
}
