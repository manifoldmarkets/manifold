import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { ContentsEntry } from 'web/lib/politics/election-contents'
import { track } from 'web/lib/service/analytics'

// The page's contents: every section on it, in page order (pageContents
// builds the list from the same checks the page renders by), with the date
// of the ones tied to the calendar. The section being read is highlighted;
// each entry jumps to its section. On desktop it's the right margin; on
// phones a strip of links that stays at the top while you scroll.

export function ContentsRail(props: { entries: ContentsEntry[] }) {
  const { entries } = props
  const current = useSectionInView(
    useMemo(() => entries.map((e) => e.id), [entries])
  )
  if (entries.length === 0) return null
  return (
    <nav aria-label="On this page" className="flex flex-col gap-2 py-4">
      <span className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
        On this page
      </span>
      <ol className="border-ink-200 flex flex-col border-l">
        {entries.map((e) => {
          const active = e.id === current
          return (
            <li key={e.key}>
              <a
                href={`#${e.id}`}
                aria-current={active ? 'location' : undefined}
                onClick={(ev) => jump(ev, e)}
                className={clsx(
                  '-ml-px flex flex-col gap-0.5 border-l-2 py-1.5 pl-3 pr-1 transition-colors',
                  active
                    ? 'border-primary-600'
                    : 'hover:border-ink-400 border-transparent'
                )}
              >
                <span
                  className={clsx(
                    'text-sm leading-snug',
                    active
                      ? 'text-primary-700 font-semibold'
                      : 'text-ink-900 hover:text-ink-1000'
                  )}
                >
                  {e.label}
                </span>
                {e.when && (
                  <span className="text-ink-500 text-xs tabular-nums leading-snug">
                    {e.when}
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function ContentsStrip(props: { entries: ContentsEntry[] }) {
  const { entries } = props
  const current = useSectionInView(
    useMemo(() => entries.map((e) => e.id), [entries])
  )
  const strip = useRef<HTMLOListElement>(null)
  // Keep the highlighted link in view as the reader scrolls past sections.
  useEffect(() => {
    const list = strip.current
    const link = current
      ? list?.querySelector<HTMLElement>(`[data-id="${current}"]`)
      : undefined
    if (!list || !link) return
    const left = link.offsetLeft - 16
    if (
      link.offsetLeft < list.scrollLeft ||
      link.offsetLeft + link.offsetWidth > list.scrollLeft + list.clientWidth
    )
      list.scrollTo({ left, behavior: 'smooth' })
  }, [current])
  if (entries.length === 0) return null
  return (
    <nav
      aria-label="On this page"
      className="bg-canvas-0/95 border-ink-200 sticky top-0 z-20 -mx-1 border-b backdrop-blur sm:-mx-2 lg:hidden"
    >
      <ol
        ref={strip}
        className="flex gap-1 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] sm:px-2"
      >
        {entries.map((e) => {
          const active = e.id === current
          return (
            <li key={e.key} className="shrink-0">
              <a
                href={`#${e.id}`}
                data-id={e.id}
                aria-current={active ? 'location' : undefined}
                onClick={(ev) => jump(ev, e)}
                className={clsx(
                  'block whitespace-nowrap rounded-full px-3 py-1 text-sm',
                  active
                    ? 'bg-primary-100 text-primary-800 font-semibold'
                    : 'text-ink-700 hover:bg-canvas-50'
                )}
              >
                {e.label}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function jump(ev: React.MouseEvent, e: ContentsEntry) {
  const el = document.getElementById(e.id)
  if (!el) return
  ev.preventDefault()
  track('election contents jump', { section: e.key })
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // Keep Next's router state (history.state): replacing it with null breaks
  // Back after leaving the page.
  history.replaceState(history.state, '', `#${e.id}`)
}

// The section being read: of the given ids, the last whose heading has
// passed a line near the top (a third of the screen, at most 160px, so a
// short section that a jump lands on is the one lit). Above the first
// heading, the first; at the bottom of the page, the last, whose heading a
// short last section never lifts that high. On iOS phones the page scrolls
// inside .page-scroll-container, not the window (layout/page.tsx), and
// scroll events don't bubble, so the listener captures them on the
// document.
function useSectionInView(ids: string[]) {
  const [current, setCurrent] = useState<string | undefined>()
  useEffect(() => {
    if (ids.length === 0) return
    const update = () => {
      const box = document.querySelector<HTMLElement>('.page-scroll-container')
      const scroller =
        box && box.scrollHeight > box.clientHeight
          ? box
          : document.scrollingElement ?? document.documentElement
      if (
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      ) {
        const last = [...ids]
          .reverse()
          .find((id) => document.getElementById(id))
        if (last) return setCurrent(last)
      }
      const line = Math.min(window.innerHeight / 3, 160)
      let best: { id: string; top: number } | undefined
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top <= line && (!best || top > best.top)) best = { id, top }
      }
      setCurrent(best?.id ?? ids[0])
    }
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])
  return current
}
