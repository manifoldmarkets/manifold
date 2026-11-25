import { TrophyTier } from 'common/trophies'

// Tailwind classes per trophy tier. Kept in web/ so Tailwind's content scan
// sees them.
export const TROPHY_TIER_STYLES: Record<
  TrophyTier,
  {
    gradient: string
    textColor: string
    // Text on a button filled with `gradient`.
    buttonText: string
    ringWidth: string
    glow: string
  }
> = {
  green: {
    gradient: 'from-emerald-400 to-emerald-600',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    buttonText: 'text-white',
    ringWidth: 'p-[2px]',
    glow: '',
  },
  blue: {
    gradient: 'from-sky-400 to-blue-600',
    textColor: 'text-blue-600 dark:text-blue-400',
    buttonText: 'text-white',
    ringWidth: 'p-[2.5px]',
    glow: 'shadow-[0_0_8px_rgba(56,189,248,0.4)]',
  },
  purple: {
    gradient: 'from-violet-400 to-purple-600',
    textColor: 'text-violet-600 dark:text-violet-400',
    buttonText: 'text-white',
    ringWidth: 'p-[3px]',
    glow: 'shadow-[0_0_12px_rgba(139,92,246,0.5)]',
  },
  crimson: {
    gradient: 'from-red-500 to-rose-700',
    textColor: 'text-red-600 dark:text-red-400',
    buttonText: 'text-white',
    ringWidth: 'p-[3px]',
    glow: 'shadow-[0_0_16px_rgba(239,68,68,0.5)]',
  },
  gold: {
    gradient: 'from-amber-400 to-yellow-600',
    textColor: 'text-amber-600 dark:text-amber-400',
    buttonText: 'text-white',
    ringWidth: 'p-[3.5px]',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.5)]',
  },
  prismatic: {
    gradient: 'from-pink-400 via-cyan-400 to-yellow-400',
    textColor: 'text-purple-600 dark:text-purple-400',
    // White is hard to read on the light cyan middle.
    buttonText: 'text-gray-900',
    ringWidth: 'p-[4px]',
    glow: 'shadow-[0_0_24px_rgba(236,72,153,0.4),0_0_24px_rgba(34,211,238,0.4)]',
  },
}
