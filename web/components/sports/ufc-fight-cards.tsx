import Link from 'next/link'
import { CheckIcon } from '@heroicons/react/solid'
import { useEffect, useState } from 'react'
import { formatSportsPrice } from 'common/sports-price'
import {
  ufcCanBet,
  ufcCardDisplay,
  type UfcMarketCard,
  type UfcMarketBout,
} from 'common/bdl/ufc-card'
import { UFC_SEGMENTS } from 'common/bdl/ufc'
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
function ResultLine({ bout, last }: { bout: UfcMarketBout; last: boolean }) {
  return (
    <Link
      href={href(bout)}
      className="border-ink-200 text-ink-700 hover:bg-canvas-50 flex min-h-[44px] flex-wrap items-center gap-x-2 border-b px-3 py-2 text-sm"
    >
      <span className="text-ink-500 text-xs font-semibold">
        {last ? 'Last result' : 'Final'}
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
    </Link>
  )
}
function BoutRow({
  b,
  now,
  featured,
  onPick,
}: {
  b: UfcMarketBout
  now: number
  featured?: string
  onPick: (b: UfcMarketBout, id: string) => void
}) {
  const tradable = ufcCanBet(b, now)
  return (
    <article className="border-ink-200 border-b px-3 py-3 last:border-0">
      <div className="text-ink-600 mb-2 flex flex-wrap items-center gap-x-2 text-xs">
        <Link
          href={href(b)}
          className="text-ink-900 font-semibold hover:underline"
        >
          {featured ?? states[b.status]}
        </Link>
        {b.headline && <span>Main event</span>}
        {b.titleFight && <span>Title fight</span>}
        {b.weightClass && <span>{b.weightClass}</span>}
        {b.scheduledRounds && <span>{b.scheduledRounds} rounds</span>}
        <Link
          href={href(b)}
          className="ml-auto inline-flex min-h-[32px] items-center font-semibold hover:underline"
        >
          Market <span aria-hidden> ›</span>
        </Link>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(8rem,.7fr)]">
        {b.answers.map((a) => {
          const cls =
            'border-ink-200 flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left last:col-span-2 sm:last:col-span-1'
          const content = (
            <>
              <span className="min-w-0 break-words text-sm font-medium">
                {a.name}
              </span>
              <span className="text-ink-900 shrink-0 font-bold tabular-nums">
                {formatSportsPrice(a.prob)}
              </span>
            </>
          )
          return tradable ? (
            <button
              key={a.answerId}
              type="button"
              className={
                cls +
                ' bg-primary-50 hover:border-primary-500 focus-visible:ring-primary-500 focus-visible:ring-2'
              }
              aria-label={`Bet on ${a.name}, ${formatSportsPrice(a.prob)}`}
              onClick={() => onPick(b, a.answerId)}
            >
              {content}
            </button>
          ) : (
            <div key={a.answerId} className={cls}>
              {content}
            </div>
          )
        })}
      </div>
    </article>
  )
}
export function UfcFightCards({ cards }: { cards: UfcMarketCard[] }) {
  const user = useUser()
  const [now, setNow] = useState(0)
  const [choice, setChoice] = useState<{
    contract: string
    event: string
    answer: string
    fighterId: number | null
  }>()
  const nearest = cards
    .flatMap((c) => c.bouts)
    .reduce(
      (n, b) =>
        b.closeTime != null && b.closeTime > now ? Math.min(n, b.closeTime) : n,
      Infinity
    )
  useEffect(() => {
    let timer: number | undefined
    const update = () => {
      const time = Date.now()
      setNow(time)
      if (Number.isFinite(nearest) && time < nearest)
        timer = window.setTimeout(update, Math.min(nearest - time, 2 ** 31 - 1))
    }
    update()
    return () => window.clearTimeout(timer)
  }, [nearest])
  const active =
    choice &&
    cards
      .flatMap((c) => c.bouts)
      .find(
        (b) =>
          b.id === choice.contract &&
          b.eventId === choice.event &&
          b.answers.some(
            (a) =>
              a.answerId === choice.answer && a.fighterId === choice.fighterId
          )
      )
  if (choice && (!active || !ufcCanBet(active, Date.now())))
    setChoice(undefined)
  const pick = (b: UfcMarketBout, answer: string) => {
    if (!ufcCanBet(b, Date.now())) return
    if (!user) {
      firebaseLogin()
      return
    }
    const selected = b.answers.find((a) => a.answerId === answer)
    if (selected)
      setChoice({
        contract: b.id,
        event: b.eventId,
        answer,
        fighterId: selected.fighterId,
      })
  }
  return (
    <>
      {cards.map((c) => {
        const { recent, confirmedLast, live, next, remaining } = ufcCardDisplay(
          c.bouts
        )
        const archive = !remaining.length
        const featured = live ?? next
        const listed = archive
          ? c.bouts
          : c.bouts.filter((b) => b.status !== 'final' && b !== featured)
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
                UFC · <time dateTime={c.date}>{c.date}</time>
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
                  Main event ·{' '}
                  {headline.answers
                    .slice(0, 2)
                    .map((a) => a.name)
                    .join(' vs ')}
                </Link>
              )}
            </header>
            {!archive && recent && (
              <ResultLine bout={recent} last={confirmedLast && !c.partial} />
            )}
            {featured && (
              <BoutRow
                b={featured}
                now={now || Infinity}
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
                    {segments[segment]}
                  </h3>
                  {rows.map((b) =>
                    b.status === 'final' ? (
                      <ResultLine key={b.id} bout={b} last={false} />
                    ) : (
                      <BoutRow
                        key={b.id}
                        b={b}
                        now={now || Number.POSITIVE_INFINITY}
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
                  <ResultLine key={b.id} bout={b} last={false} />
                ) : (
                  <BoutRow
                    key={b.id}
                    b={b}
                    now={now || Number.POSITIVE_INFINITY}
                    onPick={pick}
                  />
                )
              )}
          </section>
        )
      })}
      {choice && active && (
        <UfcWinnerBetDialog
          key={active.eventId}
          bout={active}
          selected={choice.answer}
          onClose={() => setChoice(undefined)}
        />
      )}
    </>
  )
}
