import { contractPathWithoutContract } from 'common/contract'
import type {
  CollegeBracket,
  CollegeBracketSlot,
} from 'common/bdl/college-bracket'
import { canBetOnScheduledGame } from 'common/sports-game-feed'
import { formatSportsPrice } from 'common/sports-price'
import type { ScheduleGame } from 'common/sports-schedule'
import Link from 'next/link'
import { useRef } from 'react'

/** AP rankings are supplied per matchup and poll issue, independently of NCAA tournament seeds. */
export type CollegeMarket = ScheduleGame & {
  homeApRank?: number | null
  awayApRank?: number | null
}

export function CollegeRankBadge({ rank }: { rank?: number | null }) {
  if (
    typeof rank !== 'number' ||
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > 25
  )
    return null
  return (
    <span
      title={'Associated Press rank ' + rank}
      className="bg-canvas-100 text-ink-700 inline-block whitespace-nowrap rounded px-1 text-xs font-medium"
    >
      AP #{rank}
    </span>
  )
}

const statusLabel = {
  scheduled: 'Scheduled',
  in_progress: 'Live',
  final: 'Final',
  postponed: 'Postponed',
  canceled: 'Canceled',
  delayed: 'Delayed',
  suspended: 'Suspended',
  abandoned: 'Abandoned',
  unknown: 'Status unavailable',
} as const
const hasPrice = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= 1

/** Callers supply only public, viewer-visible official games and prices from their Manifold pools. */
export function BracketView({
  bracket,
  markets = [],
  now,
  preview = false,
}: {
  bracket: CollegeBracket
  markets?: readonly CollegeMarket[]
  now: number
  preview?: boolean
}) {
  const roundList = useRef<HTMLDivElement>(null)
  const byId = new Map<string, CollegeMarket | null>()
  for (const market of markets) {
    if (market.sportsLeagueKey !== bracket.league) continue
    const id = market.sportsEventId
    byId.set(id, byId.has(id) ? null : market)
  }
  return (
    <section aria-label="March Madness bracket" className="min-w-0">
      <h2 className="text-ink-900 mb-3 text-xl font-semibold">
        {bracket.season + 1} {bracket.league === 'ncaab' ? 'Men’s' : 'Women’s'}{' '}
        March Madness
      </h2>
      {bracket.rounds.length > 0 && (
        <label className="text-ink-700 mb-3 inline-flex items-center gap-2 text-sm">
          Jump to round
          <select
            defaultValue=""
            onChange={(e) => {
              const list = roundList.current,
                target = list?.children.item(Number(e.currentTarget.value))
              if (list && target)
                list.scrollBy({
                  left:
                    target.getBoundingClientRect().left -
                    list.getBoundingClientRect().left,
                })
              e.currentTarget.value = ''
            }}
            className="bg-canvas-0 border-ink-300 min-h-[44px] rounded border py-2 pl-2 pr-9"
          >
            <option value="" disabled>
              Choose round
            </option>
            {bracket.rounds.map((round, i) => (
              <option key={round.label} value={i}>
                {round.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!bracket.rounds.length ? (
        <p className="text-ink-600 text-sm">Tournament bracket unavailable.</p>
      ) : (
        <div
          role="region"
          aria-label="Tournament rounds"
          ref={roundList}
          className="relative flex max-w-full snap-x gap-3 overflow-x-auto pb-3"
        >
          {bracket.rounds.map((round) => (
            <section
              key={round.label}
              aria-label={round.label}
              className="w-60 flex-none snap-start"
            >
              <h3 className="text-ink-900 mb-2 font-semibold">{round.label}</h3>
              <ol className="flex flex-col gap-2">
                {round.slots.map((slot) => (
                  <li key={slot.slotKey}>
                    <BracketGame
                      slot={slot}
                      market={slot.eventId ? byId.get(slot.eventId) : null}
                      now={now}
                      preview={preview}
                    />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function BracketGame({
  slot,
  market,
  now,
  preview,
}: {
  slot: CollegeBracketSlot
  market?: CollegeMarket | null
  now: number
  preview: boolean
}) {
  const matched =
    market &&
    slot.home.team &&
    slot.away.team &&
    market.home.entrantId === String(slot.home.team.id) &&
    market.away.entrantId === String(slot.away.team.id) &&
    market.home.answerId &&
    market.away.answerId &&
    market.home.answerId !== market.away.answerId
      ? market
      : null
  const open =
    matched &&
    (slot.status === 'scheduled' || slot.status === 'in_progress') &&
    canBetOnScheduledGame(matched, now)
  const scoreKnown = slot.status !== 'final' || slot.winnerId !== null
  const content = (
    <>
      <div className="text-ink-600 mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span>
          Game {slot.position}
          {slot.region ? ' · ' + slot.region : ''}
        </span>
        {slot.sourcePresent && (
          <span
            className={
              slot.status === 'in_progress'
                ? 'text-primary-700 font-medium'
                : ''
            }
          >
            {statusLabel[slot.status]}
          </span>
        )}
      </div>
      {(['home', 'away'] as const).map((key) => {
        const side = slot[key],
          team = side.team,
          price = matched?.[key].prob
        return (
          <div
            key={key}
            className={
              'text-ink-900 flex min-w-0 items-baseline gap-2 py-1 text-sm ' +
              (team && team.id === slot.winnerId ? 'font-semibold' : '')
            }
          >
            <span
              aria-label={side.seed ? 'Seed ' + side.seed : undefined}
              className="text-ink-500 w-5 flex-none text-right text-xs tabular-nums"
            >
              {side.seed ?? ''}
            </span>
            <span className="min-w-0 flex-1 break-words">
              {team?.name ?? 'TBD'}{' '}
              <CollegeRankBadge
                rank={
                  key === 'home' ? matched?.homeApRank : matched?.awayApRank
                }
              />
              {team && team.id === slot.winnerId && (
                <span className="sr-only">, winner</span>
              )}
            </span>
            {team && scoreKnown && side.score !== null && (
              <span aria-label={'Score ' + side.score} className="tabular-nums">
                {side.score}
              </span>
            )}
            {open && price !== undefined && hasPrice(price) && (
              <span
                aria-label={'Market price ' + formatSportsPrice(price)}
                className="bg-primary-100 text-primary-700 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
              >
                {formatSportsPrice(price)}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
  const style = 'border-ink-200 bg-canvas-0 block rounded-lg border px-2.5 py-2'
  return matched && !preview ? (
    <Link
      href={contractPathWithoutContract(matched.creatorUsername, matched.slug)}
      className={
        style +
        ' hover:bg-canvas-50 focus-visible:ring-primary-600 focus-visible:ring-2'
      }
    >
      {content}
    </Link>
  ) : (
    <div className={style}>{content}</div>
  )
}
