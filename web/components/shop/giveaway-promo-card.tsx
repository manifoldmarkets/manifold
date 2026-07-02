import clsx from 'clsx'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { Button, ColorType } from '../buttons/button'

export type GiveawayPromoStat = {
  value: ReactNode
  label: string
  /** Full className for the value div — includes size (text-2xl / conditional
   *  shrink) and color (text-<theme>-600). Kept explicit so each card reads
   *  top-to-bottom without hidden sizing logic. */
  valueClassName: string
  /** Extra classes applied alongside valueClassName — e.g. `whitespace-nowrap`
   *  on a Time Left cell. */
  extraClassName?: string
}

export type GiveawayPromoCardProps = {
  href: string
  /** Outer gradient, e.g. 'from-teal-400 via-cyan-400 to-blue-500'. */
  gradientClassName: string
  /** Hover-shadow classes, e.g. 'group-hover:shadow-teal-200/50 dark:group-hover:shadow-teal-900/30'. */
  hoverShadowClassName: string
  icon: ReactNode
  title: string
  pill?: { text: string; className: string }
  /** Standard stats row. Omit for cards that use a custom body (e.g. the
   *  winner-announcement state which shows a charity + donated amount). */
  stats?: GiveawayPromoStat[]
  /** Custom content rendered between the stats row and the CTA. Used when the
   *  shell is the right shape but the middle content doesn't fit the stats
   *  pattern (e.g. winner announcement with charity name + donated amount). */
  body?: ReactNode
  /** Optional body line above the CTA (used by the "awaiting draw" states). */
  message?: ReactNode
  ctaText: string
  ctaColor: ColorType
  /** Applied to the outer Link so callers can opt into grid/layout tweaks. */
  className?: string
}

/** Shrink a stat's font when the number hits 7 figures so it doesn't
 *  overlap the card border. Use for any stat that can blow past a million. */
export function promoStatSizeClass(
  value: number,
  shrinkAtMillion: boolean
): string {
  return shrinkAtMillion && value >= 1_000_000
    ? 'text-lg sm:text-xl'
    : 'text-2xl'
}

/** Shared neutral pill used across every card in the ended/winner-selected
 *  state. Kept theme-agnostic so ENDED reads consistently regardless of
 *  which card's gradient it sits on. */
export const ENDED_PILL = {
  text: 'ENDED',
  className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

/** Shared shell for the Prize Drawing / Charity Giveaway promo tiles.
 *  Handles the gradient border, header, stats row, optional message, and CTA.
 *  Per-card state (live vs ended) is expressed purely through the props. */
export function GiveawayPromoCard(props: GiveawayPromoCardProps) {
  const {
    href,
    gradientClassName,
    hoverShadowClassName,
    icon,
    title,
    pill,
    stats,
    body,
    message,
    ctaText,
    ctaColor,
    className,
  } = props

  return (
    <Link href={href} className={clsx('group block h-full pb-2', className)}>
      <div
        className={clsx(
          'relative flex h-full flex-col overflow-hidden rounded-xl p-1 transition-all duration-200',
          'bg-gradient-to-br',
          gradientClassName,
          'group-hover:shadow-lg',
          hoverShadowClassName,
          'group-hover:-translate-y-1'
        )}
      >
        <div className="flex h-full flex-col rounded-lg bg-white p-4 dark:bg-gray-900">
          {/* Header */}
          <Row className="mb-3 items-center gap-2">
            {icon}
            <span className="text-lg font-semibold">{title}</span>
            {pill && (
              <span
                className={clsx(
                  'ml-auto rounded px-2 py-0.5 text-xs font-semibold',
                  pill.className
                )}
              >
                {pill.text}
              </span>
            )}
          </Row>

          {/* Stats row */}
          {stats && stats.length > 0 && (
            <Row className="mb-3 gap-4 text-center">
              {stats.map((stat) => (
                <Col key={stat.label} className="flex-1">
                  <div
                    className={clsx(stat.valueClassName, stat.extraClassName)}
                  >
                    {stat.value}
                  </div>
                  <div className="text-ink-500 text-xs">{stat.label}</div>
                </Col>
              ))}
            </Row>
          )}

          {body}

          {message && <p className="text-ink-500 mb-3 text-xs">{message}</p>}

          {/* CTA */}
          <Button
            color={ctaColor}
            size="sm"
            className="mt-auto w-full group-hover:shadow-md"
          >
            {ctaText}
          </Button>
        </div>
      </div>
    </Link>
  )
}
