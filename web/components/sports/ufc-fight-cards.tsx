import Link from 'next/link'
import { CheckIcon } from '@heroicons/react/solid'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatSportsPrice } from 'common/sports-price'
import {
  freshUfcObservation,
  ufcObservationEnd,
  ufcTicketBinding,
  ufcCanBet,
  ufcCardDisplay,
  type UfcMarketCard,
  type UfcMarketBout,
} from 'common/bdl/ufc-card'
import { UFC_SEGMENTS } from 'common/bdl/ufc'
import { sportsViewNow, sportsTimerDelay } from 'common/sports-view-clock'
import { StakeLine } from './sports-outcome-stake'
import { hasOutcomeStake, type GameStake } from './game-positions'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { UfcWinnerBetDialog } from './sports-bet-panel'

const segments = {
  early_prelims: 'Early prelims',
  prelims: 'Prelims',
  main_card: 'Main card',
}
const states = {
  scheduled: 'Scheduled',
  in_progress: 'Live',
  final: 'Final',
  postponed: 'Postponed',
  canceled: 'Canceled',
  delayed: 'Delayed',
  suspended: 'Suspended',
  abandoned: 'Abandoned',
  unknown: 'Awaiting update',
}
const href = (b: UfcMarketBout) => `/${b.creatorUsername}/${b.slug}`

function CardDate({ date, local }: { date: string; local: boolean }) {
  // The provider publishes a card date without a timezone. Keep its calendar day everywhere.
  const ms = Date.parse(date + 'T00:00:00Z')
  if (!Number.isFinite(ms)) return null
  return (
    <time dateTime={date}>
      {new Intl.DateTimeFormat(local ? undefined : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(ms)}
    </time>
  )
}

function SegmentLabel({
  segment,
  bouts,
  local,
}: {
  segment: (typeof UFC_SEGMENTS)[number]
  bouts: UfcMarketBout[]
  local: boolean
}) {
  const starts = new Set(
    bouts
      .filter((b) => b.segment === segment && b.segmentStart != null)
      .map((b) => b.segmentStart)
  )
  const [at] = starts
  return (
    <>
      {segments[segment]}
      {starts.size === 1 && at != null && (
        <>
          {' '}
          · Segment start{' '}
          <time dateTime={new Date(at).toISOString()}>
            {new Intl.DateTimeFormat(local ? undefined : 'en-US', {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short',
              timeZone: local ? undefined : 'UTC',
            }).format(at)}
          </time>
        </>
      )}
    </>
  )
}

function finalText(b: UfcMarketBout) {
  const pick = b.answers.find((a) => a.answerId === b.winnerAnswerId)
  return [
    !pick ? 'Result unconfirmed' : pick.fighterId === null ? pick.name : null,
    b.method,
    b.round != null ? 'R' + b.round : null,
    b.roundTime,
  ]
    .filter(Boolean)
    .join(' · ')
}
function ResultLine({
  bout,
  last,
  stake,
}: {
  bout: UfcMarketBout
  last: boolean
  stake?: GameStake
}) {
  return (
    <Link
      href={href(bout)}
      className="border-ink-200 text-ink-700 hover:bg-canvas-50 flex min-h-[44px] flex-wrap items-center gap-x-2 border-b px-3 py-2 text-sm"
    >
      <span className="text-ink-500 text-xs font-semibold">
        {last ? 'Latest published result' : 'Final'}
      </span>
      {bout.answers.slice(0, 2).map((a, i) => (
        <span key={a.answerId} className="inline-flex items-center gap-1">
          {i === 1 && <span className="text-ink-500 mr-1">vs</span>}
          <span
            className={
              a.answerId === bout.winnerAnswerId
                ? 'text-ink-900 font-semibold'
                : undefined
            }
          >
            {a.name}
          </span>
          {a.answerId === bout.winnerAnswerId && (
            <>
              <CheckIcon aria-hidden className="h-4 w-4 text-teal-600" />
              <span className="sr-only">Winner</span>
            </>
          )}
        </span>
      ))}
      <span>{finalText(bout)}</span>
      {stake &&
        bout.answers
          .filter((a) => hasOutcomeStake(stake.byAnswer[a.answerId]))
          .map((a) => (
            <span
              key={a.answerId}
              className="inline-flex flex-wrap items-center gap-1 text-xs"
            >
              <span>{a.name}</span>
              <StakeLine stake={stake.byAnswer[a.answerId]} />
            </span>
          ))}
    </Link>
  )
}
function BoutRow({
  b,
  now,
  featured,
  stake,
  rejected,
  onPick,
}: {
  b: UfcMarketBout
  now: number
  featured?: string
  stake?: GameStake
  rejected?: 'selection' | 'order'
  onPick: (b: UfcMarketBout, id: string) => void
}) {
  const tradable = !rejected && ufcCanBet(b, now)
  const stale =
    (b.status === 'scheduled' || b.status === 'in_progress') &&
    !freshUfcObservation(b, now)
  const matchup = b.answers
    .slice(0, 2)
    .map((a) => a.name)
    .join(' vs ')
  return (
    <article className="border-ink-200 border-b px-3 py-3 last:border-0">
      <div className="text-ink-600 mb-2 flex flex-wrap items-center gap-x-2 text-xs">
        <Link
          href={href(b)}
          aria-label={`Open ${matchup} market, ${
            stale ? states.unknown : featured ?? states[b.status]
          }`}
          className="text-ink-900 inline-flex min-h-[44px] items-center font-semibold hover:underline"
        >
          {!stale && b.status === 'in_progress' ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse"
              />
              Live
            </span>
          ) : stale ? (
            states.unknown
          ) : (
            featured ?? states[b.status]
          )}
        </Link>
        {rejected && (
          <span role="alert">
            {rejected === 'selection'
              ? 'Selection changed. Updating market.'
              : 'Order not placed. Market changed.'}
          </span>
        )}
        {!tradable &&
          (b.status === 'scheduled' || b.status === 'in_progress') && (
            <span>
              {b.isResolved || b.closeTime == null || b.closeTime <= now
                ? 'Betting closed'
                : 'Prices unavailable'}
            </span>
          )}
        {b.headline && <span>Listed main event</span>}
        {b.titleFight && <span>Title fight</span>}
        {b.weightClass && <span>{b.weightClass}</span>}
        {b.scheduledRounds && <span>{b.scheduledRounds} rounds</span>}
        <Link
          href={href(b)}
          aria-label={`Open ${matchup} market`}
          className="ml-auto inline-flex min-h-[44px] items-center font-semibold hover:underline"
        >
          Market <span aria-hidden> ›</span>
        </Link>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(8rem,.7fr)]">
        {b.answers.map((a) => {
          const cls =
            'border-ink-200 flex flex-1 min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left last:col-span-2 sm:last:col-span-1'
          const content = (
            <>
              <span className="min-w-0 break-words text-sm font-medium">
                {a.name}
              </span>
              {tradable && (
                <span className="text-ink-900 shrink-0 font-bold tabular-nums">
                  {formatSportsPrice(a.prob)}
                </span>
              )}
            </>
          )
          return (
            <div
              key={a.answerId}
              className="flex min-w-0 flex-col last:col-span-2 sm:row-span-2 sm:grid sm:grid-rows-[subgrid] sm:gap-y-0 sm:last:col-span-1"
            >
              {tradable ? (
                <button
                  key={a.answerId}
                  type="button"
                  className={
                    cls +
                    ' bg-primary-50 hover:border-primary-500 focus-visible:ring-primary-500 focus-visible:ring-2'
                  }
                  aria-label={`Bet on ${
                    a.name
                  } in ${matchup}, ${formatSportsPrice(a.prob)}`}
                  onClick={() => onPick(b, a.answerId)}
                >
                  {content}
                </button>
              ) : (
                <div key={a.answerId} className={cls}>
                  {content}
                </div>
              )}
              <StakeLine stake={stake?.byAnswer[a.answerId]} />
            </div>
          )
        })}
      </div>
    </article>
  )
}
export function UfcFightCards({
  cards,
  allMatches,
  stakes,
  children,
  promoteCard,
  onBetPlaced,
  onScheduleRefresh,
}: {
  cards: UfcMarketCard[]
  children?: ReactNode
  promoteCard?: (card: UfcMarketCard) => boolean
  stakes?: Record<string, GameStake>
  onScheduleRefresh?: () => void
  allMatches?: boolean
  onBetPlaced?: (id: string) => void
}) {
  const user = useUser()
  const [tick, setNow] = useState(0)
  const now = tick ? sportsViewNow() : 0
  const [rejectedAt, setRejectedAt] = useState<
    Record<string, { at: number; reason: 'selection' | 'order' }>
  >({})
  const isRejected = (b: UfcMarketBout) =>
    b.observedAt <= (rejectedAt[b.id]?.at ?? -1)
      ? rejectedAt[b.id]?.reason
      : undefined
  const [choice, setChoice] = useState<{
    binding: string
    userId: string
    answer: string
    closeTime: number
  }>()
  const bouts = cards.flatMap((c) => c.bouts)
  const currentBouts = useRef(bouts)
  currentBouts.current = bouts
  const deadlines = bouts.flatMap((b) => [
    ufcObservationEnd(b),
    b.closeTime ?? 0,
  ])
  if (choice) deadlines.push(choice.closeTime)
  const next = deadlines.reduce(
    (at, t) => (t > now ? Math.min(at, t) : at),
    Infinity
  )
  useEffect(() => {
    const update = () => setNow(sportsViewNow())
    const delay = sportsTimerDelay([next], now, sportsViewNow())
    const timer = delay == null ? undefined : setTimeout(update, delay)
    if (!now) update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [tick, next])
  const active =
    choice && bouts.find((b) => ufcTicketBinding(b) === choice.binding)
  if (
    choice &&
    (choice.userId !== user?.id ||
      !active ||
      !ufcCanBet(active, sportsViewNow()) ||
      sportsViewNow() >= choice.closeTime)
  )
    setChoice(undefined)
  const pick = (b: UfcMarketBout, answer: string) => {
    if (isRejected(b) || b.closeTime == null || !ufcCanBet(b, sportsViewNow()))
      return
    if (!user) {
      firebaseLogin()
      return
    }
    const selected = b.answers.find((a) => a.answerId === answer)
    if (selected)
      setChoice({
        binding: ufcTicketBinding(b),
        answer,
        userId: user.id,
        closeTime: b.closeTime,
      })
  }
  const sections = cards.map((c) => {
    const { recent, confirmedLast, live, next, remaining } = ufcCardDisplay(
      c.bouts,
      now
    )
    const archive = !remaining.length
    const earlier =
      !archive && !allMatches
        ? c.bouts.filter((b) => b.status === 'final' && b !== recent)
        : []
    const featured = live ?? next
    const listed = archive
      ? c.bouts.filter((b) => b !== recent)
      : c.bouts.filter(
          (b) =>
            b !== featured &&
            (b.status !== 'final' || (allMatches && b !== recent))
        )
    const headliners = c.bouts.filter((b) => b.headline)
    const headline = headliners.length === 1 ? headliners[0] : undefined
    return (
      <section
        key={c.id}
        aria-label={c.name}
        className="border-ink-200 bg-canvas-0 mb-4 min-w-0 overflow-hidden rounded-xl border"
      >
        <header className="bg-canvas-50 border-ink-200 border-b px-3 py-3">
          <div className="text-ink-600 text-xs font-semibold">
            UFC · <CardDate date={c.date} local={now !== 0} />
          </div>
          <h2 className="text-ink-900 mt-1 break-words text-lg font-semibold">
            {c.name}
          </h2>
          {c.venue && <div className="text-ink-600 text-sm">{c.venue}</div>}
          {headline && (
            <Link
              href={href(headline)}
              className="text-primary-700 inline-flex min-h-[44px] items-center text-sm font-semibold hover:underline"
            >
              Provider-listed main event ·{' '}
              {headline.answers
                .slice(0, 2)
                .map((a) => a.name)
                .join(' vs ')}
            </Link>
          )}
        </header>
        {recent && (
          <ResultLine
            bout={recent}
            stake={stakes?.[recent.id]}
            last={confirmedLast && !c.partial}
          />
        )}
        {featured?.segment && (
          <h3 className="bg-canvas-50 text-ink-600 px-3 py-1.5 text-xs font-semibold">
            <SegmentLabel
              segment={featured.segment}
              bouts={c.bouts}
              local={now !== 0}
            />
          </h3>
        )}
        {featured && (
          <BoutRow
            b={featured}
            stake={stakes?.[featured.id]}
            rejected={isRejected(featured)}
            now={now}
            featured={featured === live ? 'Live' : 'Up next'}
            onPick={pick}
          />
        )}
        {UFC_SEGMENTS.map((segment) => {
          const rows = listed.filter((b) => b.segment === segment)
          if (!rows.length) return null
          return (
            <div key={segment}>
              <h3 className="bg-canvas-50 text-ink-600 px-3 py-1.5 text-xs font-semibold">
                <SegmentLabel
                  segment={segment}
                  bouts={c.bouts}
                  local={now !== 0}
                />
              </h3>
              {rows.map((b) =>
                b.status === 'final' ? (
                  <ResultLine
                    key={b.id}
                    bout={b}
                    last={false}
                    stake={stakes?.[b.id]}
                  />
                ) : (
                  <BoutRow
                    key={b.id}
                    b={b}
                    stake={stakes?.[b.id]}
                    rejected={isRejected(b)}
                    now={now}
                    onPick={pick}
                  />
                )
              )}
            </div>
          )
        })}
        {listed
          .filter((b) => !b.segment)
          .map((b) =>
            b.status === 'final' ? (
              <ResultLine
                key={b.id}
                bout={b}
                last={false}
                stake={stakes?.[b.id]}
              />
            ) : (
              <BoutRow
                key={b.id}
                b={b}
                stake={stakes?.[b.id]}
                rejected={isRejected(b)}
                now={now}
                onPick={pick}
              />
            )
          )}
        {earlier.length > 0 && (
          <details className="border-ink-200 border-t">
            <summary className="text-ink-700 min-h-[44px] cursor-pointer px-3 py-3 text-sm font-semibold">
              Earlier published results ({earlier.length})
            </summary>
            {earlier.map((b) => (
              <ResultLine
                key={b.id}
                bout={b}
                last={false}
                stake={stakes?.[b.id]}
              />
            ))}
          </details>
        )}
      </section>
    )
  })
  const leading = sections.filter((_, i) => promoteCard?.(cards[i]))
  const trailing = sections.filter((_, i) => !promoteCard?.(cards[i]))
  return (
    <>
      {[
        ...leading,
        <Fragment key="team-feed">{children}</Fragment>,
        ...trailing,
      ]}
      {choice && active && (
        <UfcWinnerBetDialog
          key={JSON.stringify([choice.binding, choice.answer, choice.userId])}
          bout={active}
          selected={choice.answer}
          initialClose={choice.closeTime}
          onInvalid={(reason) => {
            const latest = currentBouts.current.find((b) => b.id === active.id)
            const floor = Math.max(
              active.observedAt,
              latest?.observedAt ?? 0,
              sportsViewNow()
            )
            setRejectedAt((old) => ({
              ...old,
              [active.id]: {
                at: Math.max(old[active.id]?.at ?? 0, floor),
                reason: reason ?? 'order',
              },
            }))
            setChoice(undefined)
            onScheduleRefresh?.()
          }}
          onBetPlaced={() => onBetPlaced?.(active.id)}
          onClose={() => setChoice(undefined)}
        />
      )}
    </>
  )
}
