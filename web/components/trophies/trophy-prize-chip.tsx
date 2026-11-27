import clsx from 'clsx'

import { SUPPORTER_TIERS } from 'common/supporter-config'
import {
  TrophyMembershipPrize,
  TrophyPrizeTotal,
  formatPrizeParts,
} from 'common/trophy-prizes'
import { formatMoney, formatMoneyPrecise } from 'common/util/format'

// What a milestone pays: mana, streak freezes and free membership days, e.g.
// "Ṁ50 · 1 🧊 · 3d Plus". Renders nothing for an empty prize.
export function TrophyPrizeChip(props: {
  prize: TrophyPrizeTotal
  className?: string
}) {
  const { prize, className } = props
  const parts = getPrizeChipParts(prize)
  if (!parts.length) return null
  return (
    <span
      className={clsx(
        'inline-flex w-fit max-w-full flex-wrap justify-center gap-x-1 rounded-xl bg-teal-100 px-2 py-0.5 text-center text-[11px] font-semibold text-teal-700',
        className
      )}
    >
      <span className="sr-only">
        Prize: {formatPrizeText(prize).join(', ')}
      </span>
      <span aria-hidden className="contents">
        <PrizeChipParts parts={parts} />
      </span>
    </span>
  )
}

/** The parts with dots between them, each kept on one line. */
export function PrizeChipParts(props: { parts: string[] }) {
  return (
    <>
      {props.parts.map((part, i) => (
        <span key={part} className="whitespace-nowrap">
          {i > 0 && '· '}
          {part}
        </span>
      ))}
    </>
  )
}

const TIER_SHORT_ORDER: TrophyMembershipPrize['tier'][] = [
  'premium',
  'plus',
  'basic',
  'paid-tier',
]

/** Compact parts for chips and buttons: ['Ṁ50', '1 🧊', '3d Plus']. */
export function getPrizeChipParts(prize: TrophyPrizeTotal): string[] {
  const parts: string[] = []
  if (prize.mana > 0) parts.push(formatTrophyMana(prize.mana))
  if (prize.freezes > 0) parts.push(`${prize.freezes} \u{1F9CA}`)
  for (const tier of TIER_SHORT_ORDER) {
    const days = prize.membership
      .filter((m) => m.tier === tier)
      .reduce((sum, m) => sum + (Number.isFinite(m.days) ? m.days : 0), 0)
    if (days > 0) {
      const name =
        tier === 'paid-tier' ? 'membership' : SUPPORTER_TIERS[tier].name
      parts.push(`${days}d ${name}`)
    }
  }
  return parts
}

/** The prize in words: ['Ṁ50', '1 freeze', '3 days of Plus']. */
export function formatPrizeText(prize: TrophyPrizeTotal): string[] {
  return [
    ...(prize.mana > 0 ? [formatTrophyMana(prize.mana)] : []),
    ...formatPrizeParts({ ...prize, mana: 0 }),
  ]
}

export const formatTrophyMana = (amount: number) =>
  Number.isInteger(amount) ? formatMoney(amount) : formatMoneyPrecise(amount)
