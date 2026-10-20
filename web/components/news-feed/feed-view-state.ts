import { useEffect, useMemo, useRef, useState } from 'react'
import { safeJsonParse } from 'common/util/json'
import { useEvent } from 'client-common/hooks/use-event'
import { safeSessionStorage } from 'web/lib/util/local'

/**
 * Keeping the reader's place. A headline opens the publisher in a new tab,
 * so usually the feed is just where it was. When it is not (a phone that
 * discarded the tab, the app, a same-tab click), the feed comes back from
 * session storage: filters, how far it was paged, which stories were open,
 * the order the reader saw, and the story at the top of the screen. New
 * stories wait behind a "new stories" button instead of pushing the page
 * down.
 */

const PREFIX = 'news-feed:'

const read = <T>(key: string): T | undefined =>
  safeJsonParse(safeSessionStorage?.getItem(PREFIX + key) ?? null) ?? undefined

const write = <T>(key: string, value: T) =>
  safeSessionStorage?.setItem(PREFIX + key, JSON.stringify(value))

/**
 * State kept for the browser tab. Reads storage on mount, so the first
 * render matches the server's; `ready` says when the stored value is in.
 */
export function useSessionState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const stored = read<T>(key)
    if (stored !== undefined) setState(stored)
    setReady(true)
  }, [key])
  const save = useEvent((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const value =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      write(key, value)
      return value
    })
  })
  return [state, save, ready] as const
}

type Ordered = { id: string }

/**
 * The order the reader saw, held still. Stories already shown keep their
 * places when a poll reorders them; arrivals wait in `pending` until the
 * reader asks for them; stories that only appear further down (a longer
 * page) join at the bottom.
 */
export function useStableOrder<T extends Ordered>(
  items: T[] | undefined,
  /** The filters: each set of filters keeps its own order. */
  viewKey: string
) {
  const [orders, setOrders, ready] = useSessionState<Record<string, string[]>>(
    'order',
    {}
  )
  const snapshot = orders[viewKey]
  const lastSeen = useRef(new Map<string, T>())
  for (const it of items ?? []) lastSeen.current.set(it.id, it)

  const { visible, pending } = useMemo(() => {
    if (!items) return { visible: [] as T[], pending: [] as T[] }
    if (!snapshot) return { visible: items, pending: [] as T[] }
    const known = new Set(snapshot)
    const lastKnownIndex = items.reduce(
      (last, it, i) => (known.has(it.id) ? i : last),
      -1
    )
    const pending: T[] = []
    const appended: T[] = []
    items.forEach((it, i) => {
      if (known.has(it.id)) return
      if (i < lastKnownIndex) pending.push(it)
      else appended.push(it)
    })
    const byId = new Map(items.map((it) => [it.id, it]))
    // A story that left the response (dropped off the feed) keeps its slot
    // with the last copy we had, so nothing below it moves.
    const kept = snapshot
      .map((id) => byId.get(id) ?? lastSeen.current.get(id))
      .filter((it): it is T => !!it)
    return { visible: [...kept, ...appended], pending }
  }, [items, snapshot])

  // Record the order once there is one, and whenever stories join below.
  const visibleIds = visible.map((v) => v.id).join(',')
  useEffect(() => {
    if (!ready || !items || items.length === 0) return
    const ids = visible.map((v) => v.id)
    if (!snapshot || ids.length !== snapshot.length)
      setOrders((o) => ({ ...trimOrders(o, viewKey), [viewKey]: ids }))
  }, [ready, visibleIds, viewKey])

  /** Take the arrivals: the order becomes the response's, or the ids
   * given when the caller knows better (a new top story leaves the list). */
  const showPending = useEvent((ids?: string[]) => {
    if (!items && !ids) return
    setOrders((o) => ({
      ...trimOrders(o, viewKey),
      [viewKey]: ids ?? (items ?? []).map((i) => i.id),
    }))
  })

  return { visible, pending, showPending, ready }
}

/** Keep a few views' orders, not every filter combination ever tried. */
const trimOrders = (o: Record<string, string[]>, keep: string) => {
  const keys = Object.keys(o).filter((k) => k !== keep)
  const next: Record<string, string[]> = {}
  for (const k of keys.slice(-4)) next[k] = o[k]
  return next
}

type Anchor = { id: string; offset: number; time: number }

/** What scrolls the page: Manifold's iOS layout scrolls a fixed container
 * (see web/lib/util/scroll.ts); everywhere else the window. */
const scroller = () =>
  document.querySelector<HTMLElement>('.page-scroll-container') ?? undefined

const scrollTopOf = (el: HTMLElement | undefined) =>
  el ? el.scrollTop : window.scrollY

const scrollToTop = (el: HTMLElement | undefined, top: number) =>
  el
    ? el.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
    : window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })

/** The story at the top of the screen and how far down it sat, measured
 * from the top of whatever scrolls. */
function currentAnchor(stickyOffset: number): Anchor | undefined {
  const box = scroller()
  const origin = box ? box.getBoundingClientRect().top : 0
  const cards = document.querySelectorAll<HTMLElement>('[data-story-id]')
  for (const el of Array.from(cards)) {
    const r = el.getBoundingClientRect()
    if (r.bottom - origin > stickyOffset) {
      return {
        id: el.dataset.storyId ?? '',
        offset: r.top - origin,
        time: Date.now(),
      }
    }
  }
  return undefined
}

const ANCHOR_MAX_AGE_MS = 6 * 60 * 60 * 1000

/**
 * Remember the reader's place as they leave, and put them back on return
 * when the page was reloaded rather than kept in memory. `rendered` is the
 * set of story ids on the page; restoration waits until the anchor is in it.
 */
export function useScrollAnchor(rendered: string[], stickyOffset = 112) {
  const save = useEvent(() => {
    const a = currentAnchor(stickyOffset)
    if (a?.id) write('anchor', a)
  })

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // Only a fresh load needs help: a page kept in memory, or a client-side
  // return, is already where the reader left it.
  const restoring = useRef<Anchor | undefined | null>(null)
  if (restoring.current === null && typeof window !== 'undefined') {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    const anchor = read<Anchor>('anchor')
    restoring.current =
      nav &&
      (nav.type === 'back_forward' || nav.type === 'reload') &&
      anchor &&
      Date.now() - anchor.time < ANCHOR_MAX_AGE_MS
        ? anchor
        : undefined
  }
  const key = rendered.join(',')
  useEffect(() => {
    const anchor = restoring.current
    if (!anchor || !rendered.includes(anchor.id)) return
    restoring.current = undefined
    const el = document.querySelector<HTMLElement>(
      `[data-story-id="${CSS.escape(anchor.id)}"]`
    )
    if (!el) return
    const box = scroller()
    const top =
      el.getBoundingClientRect().top +
      scrollTopOf(box) -
      (box ? box.getBoundingClientRect().top : 0) -
      anchor.offset
    scrollToTop(box, top)
  }, [key])

  return save
}
