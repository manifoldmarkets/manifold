import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { formatOdds } from 'web/components/usa-map/election-display'
import {
  TimelineEntry,
  upcomingTimeline,
} from 'web/lib/politics/elections-2028-config'
import { placeName } from 'web/lib/politics/official-markets'
import {
  EARLY_STATES,
  PrimaryCell,
  PrimaryRow,
} from 'web/lib/politics/primaries'
import { track } from 'web/lib/service/analytics'

const DAY = 24 * 60 * 60 * 1000

// The calendar ahead, down the right margin on desktop. The page runs in
// the same order (election-phase.ts), so scrolling it moves down the
// timeline: the entries about the section in view light up, and each entry
// jumps to its section. Fixed dates count down; dates the parties haven't
// set show as a season. While the early contests are next, their leaders
// show underneath. `now` comes from the server render so the days agree on
// hydration. Phones don't show it.
export function TimelineRail(props: { now: number; primaries: PrimaryRow[] }) {
  const { now, primaries } = props
  const upcoming = useMemo(() => upcomingTimeline(now), [now])
  const next = upcoming[0]
  const targets = useSectionTargets(upcoming)
  const inView = useSectionInView(
    useMemo(() => [...new Set(Object.values(targets))], [targets])
  )
  const early =
    next?.key === 'early'
      ? EARLY_STATES.map((st) =>
          primaries.find((r) => r.o === 'P' && r.st === st)
        ).filter((r): r is PrimaryRow => !!r && !!(r.D || r.R))
      : []

  return (
    <nav aria-label="Election timeline" className="flex flex-col gap-3 py-4">
      <span className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
        Timeline
      </span>
      <ol className="flex flex-col">
        {upcoming.map((e, i) => {
          const target = targets[e.key]
          const active = !!target && target === inView
          return (
            <li key={e.key} className="relative flex gap-3 pb-4">
              {i < upcoming.length - 1 && (
                <span
                  aria-hidden
                  className="bg-ink-200 absolute bottom-0 left-[5px] top-4 w-px"
                />
              )}
              <span
                aria-hidden
                className={clsx(
                  'relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full',
                  active
                    ? 'bg-primary-600 ring-primary-200 ring-4'
                    : e.key === next?.key
                    ? 'bg-primary-400'
                    : 'bg-ink-300'
                )}
              />
              <Entry
                entry={e}
                now={now}
                isNext={e.key === next?.key}
                active={active}
                target={target}
              >
                {e.key === 'early' && early.length > 0 && (
                  <EarlyLeaders rows={early} />
                )}
              </Entry>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Entry(props: {
  entry: TimelineEntry
  now: number
  isNext: boolean
  active: boolean
  target: string | undefined
  children?: React.ReactNode
}) {
  const { entry: e, now, isNext, active, target } = props
  const started = e.time === undefined && e.sortAt <= now
  const when = e.time
    ? new Date(e.time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : e.season
  const days = e.time ? Math.ceil((e.time - now) / DAY) : undefined
  const countdown =
    days !== undefined
      ? `${days.toLocaleString('en-US')} ${days === 1 ? 'day' : 'days'}`
      : started
      ? 'Under way'
      : undefined
  const body = (
    <>
      <span
        className={clsx(
          'text-sm font-semibold leading-snug',
          active ? 'text-primary-700' : 'text-ink-1000',
          target && 'group-hover:underline'
        )}
      >
        {e.label}
      </span>
      <span className="text-ink-600 text-xs leading-snug">
        {when} · {e.detail}
      </span>
      {countdown && (
        <span
          className={clsx(
            'text-xs font-semibold tabular-nums',
            isNext ? 'text-primary-700' : 'text-ink-500'
          )}
        >
          {countdown}
        </span>
      )}
    </>
  )
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {target ? (
        <a
          href={`#${target}`}
          className="group flex flex-col gap-0.5"
          onClick={(ev) => {
            const el = document.getElementById(target)
            if (!el) return
            ev.preventDefault()
            track('election timeline jump', { entry: e.key })
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            history.replaceState(null, '', `#${target}`)
          }}
        >
          {body}
        </a>
      ) : (
        body
      )}
      {props.children}
    </div>
  )
}

function EarlyLeaders(props: { rows: PrimaryRow[] }) {
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-xs">
      {props.rows.map((r) => (
        <span key={r.k} className="text-ink-800 flex flex-wrap gap-x-1.5">
          <span className="font-semibold">{placeName(r.st)}</span>
          {r.D && <Leader party="D" cell={r.D} />}
          {r.R && <Leader party="R" cell={r.R} />}
        </span>
      ))}
    </div>
  )
}

function Leader(props: { party: 'D' | 'R'; cell: PrimaryCell }) {
  const { party, cell } = props
  if (!cell.l) return null
  return (
    <Link
      href={`/${cell.u ?? 'ManifoldPolitics'}/${cell.s}`}
      className="hover:underline"
    >
      {party}: {cell.won ? `✓ ${cell.l}` : cell.l}
      {!cell.won && cell.p !== undefined ? ` ${formatOdds(cell.p)}` : ''}
    </Link>
  )
}

// Each entry's section: the first of its sections that is on the page (a
// section with nothing to show isn't rendered). Read after mount; the
// server render links nothing.
function useSectionTargets(entries: TimelineEntry[]) {
  const [targets, setTargets] = useState<Record<string, string>>({})
  useEffect(() => {
    const found: Record<string, string> = {}
    for (const e of entries) {
      const id = e.sections.find((s) => document.getElementById(s))
      if (id) found[e.key] = id
    }
    setTargets(found)
  }, [entries])
  return targets
}

// The section the reader is in: of the given ids, the last one whose
// heading has passed the top third of the screen.
function useSectionInView(ids: string[]) {
  const [current, setCurrent] = useState<string | undefined>()
  useEffect(() => {
    if (ids.length === 0) return
    const update = () => {
      const line = window.innerHeight / 3
      let best: { id: string; top: number } | undefined
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top <= line && (!best || top > best.top)) best = { id, top }
      }
      setCurrent(best?.id)
    }
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])
  return current
}
