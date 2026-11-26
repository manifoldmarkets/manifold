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
  teal: {
    gradient: 'from-teal-400 to-teal-600',
    textColor: 'text-teal-600 dark:text-teal-400',
    buttonText: 'text-white',
    ringWidth: 'p-[2.25px]',
    glow: 'shadow-[0_0_4px_rgba(45,212,191,0.4)]',
  },
  blue: {
    gradient: 'from-sky-400 to-blue-600',
    textColor: 'text-blue-600 dark:text-blue-400',
    buttonText: 'text-white',
    ringWidth: 'p-[2.5px]',
    glow: 'shadow-[0_0_6px_rgba(56,189,248,0.4)]',
  },
  indigo: {
    gradient: 'from-indigo-400 to-indigo-600',
    textColor: 'text-indigo-600 dark:text-indigo-400',
    buttonText: 'text-white',
    ringWidth: 'p-[2.75px]',
    glow: 'shadow-[0_0_8px_rgba(129,140,248,0.4)]',
  },
  purple: {
    gradient: 'from-violet-400 to-purple-600',
    textColor: 'text-violet-600 dark:text-violet-400',
    buttonText: 'text-white',
    ringWidth: 'p-[3px]',
    glow: 'shadow-[0_0_10px_rgba(139,92,246,0.5)]',
  },
  pink: {
    gradient: 'from-pink-400 to-pink-600',
    textColor: 'text-pink-600 dark:text-pink-400',
    buttonText: 'text-white',
    ringWidth: 'p-[3.25px]',
    glow: 'shadow-[0_0_12px_rgba(244,114,182,0.4)]',
  },
  crimson: {
    gradient: 'from-red-500 to-rose-700',
    textColor: 'text-red-600 dark:text-red-400',
    buttonText: 'text-white',
    ringWidth: 'p-[3.5px]',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]',
  },
  orange: {
    gradient: 'from-orange-400 to-orange-600',
    textColor: 'text-orange-600 dark:text-orange-400',
    buttonText: 'text-white',
    ringWidth: 'p-[3.75px]',
    glow: 'shadow-[0_0_18px_rgba(251,146,60,0.4)]',
  },
  gold: {
    gradient: 'from-amber-400 to-yellow-600',
    textColor: 'text-amber-600 dark:text-amber-400',
    buttonText: 'text-white',
    ringWidth: 'p-[4px]',
    glow: 'shadow-[0_0_21px_rgba(245,158,11,0.5)]',
  },
  prismatic: {
    gradient: 'from-pink-400 via-cyan-400 to-yellow-400',
    textColor: 'text-purple-600 dark:text-purple-400',
    // White is hard to read on the light cyan middle.
    buttonText: 'text-gray-900',
    ringWidth: 'p-[4.25px]',
    glow: 'shadow-[0_0_24px_rgba(236,72,153,0.4),0_0_24px_rgba(34,211,238,0.4)]',
  },
}
