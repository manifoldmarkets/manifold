import clsx from 'clsx'
import { ChevronDownIcon } from '@heroicons/react/outline'
import {
  KeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

// ---------------------------------------------------------------------------
// The stack of cards that sits under the chart on phones and beside it in the
// rail on xl: your positions, the watchlist, related markets, activity. Four
// full-height cards in a column means a long scroll to get from the first to
// the last, so this file holds the shipped layout plus four ways of shortening
// that trip. `?rail=<layout>` picks one; PERP_RAIL_LAYOUT sets the default.
//
//   stack     every card open, one after another (what ships today)
//   tabs      one card, a segmented control across the top
//   accordion four collapsed headers, one section open at a time
//   dock      side-buttons: an icon rail down the left, body to the right
//   jump      still stacked, but with a sticky scroll-spy nav to jump between

export const PERP_RAIL_LAYOUTS = [
  'stack',
  'tabs',
  'accordion',
  'dock',
  'jump',
] as const

export type PerpRailLayout = (typeof PERP_RAIL_LAYOUTS)[number]

/** The layouts this shell draws; the page lays out `stack` itself. */
export type PerpRailAltLayout = Exclude<PerpRailLayout, 'stack'>

export const isPerpRailLayout = (v: unknown): v is PerpRailLayout =>
  typeof v === 'string' && PERP_RAIL_LAYOUTS.includes(v as PerpRailLayout)

/** One-line description of each layout, for the switcher's tooltips. */
export const PERP_RAIL_BLURBS: Record<PerpRailLayout, string> = {
  stack: 'Today: every card open, one under the other.',
  tabs: 'One card, segmented control across the top.',
  accordion: 'Four headers always in view, one section open at a time.',
  dock: 'Side-buttons: an icon rail down the left edge.',
  jump: 'Still stacked, plus a sticky nav that jumps between sections.',
}

export type PerpRailSection = {
  key: string
  /** Tab, accordion and header label. */
  label: string
  /** Squeezed into the dock's icon rail and the jump pills. */
  shortLabel?: string
  icon: (props: { className?: string }) => JSX.Element
  /** A count or P&L — shown next to the label in every layout. */
  badge?: ReactNode
  /** The body, rendered with `chrome="bare"`: no border of its own, no title. */
  content: ReactNode
}

const CARD =
  'border-ink-200 dark:border-ink-300 bg-canvas-0 overflow-hidden rounded-xl border'

export const PerpRail = (props: {
  layout: PerpRailAltLayout
  sections: PerpRailSection[]
  className?: string
}) => {
  const { layout, sections, className } = props
  if (sections.length === 0) return null
  const shell =
    layout === 'tabs' ? (
      <TabsRail sections={sections} />
    ) : layout === 'accordion' ? (
      <AccordionRail sections={sections} />
    ) : layout === 'dock' ? (
      <DockRail sections={sections} />
    ) : (
      <JumpRail sections={sections} />
    )
  return <div className={clsx('min-w-0', className)}>{shell}</div>
}

// ---------------------------------------------------------------------------
// Shared pieces

// Every layout but `stack` hands the section its chrome, so the cards render
// bare and this is the one place a section title lives.
const SectionHeader = (props: {
  section: PerpRailSection
  className?: string
}) => {
  const { section, className } = props
  const Icon = section.icon
  return (
    <Row
      className={clsx(
        'border-ink-200 dark:border-ink-300 items-center gap-2 border-b px-3 py-2',
        className
      )}
    >
      <Icon className="text-ink-400 h-4 w-4 shrink-0" />
      <span className="text-ink-400 text-[11px] font-medium uppercase tracking-wider">
        {section.label}
      </span>
      {section.badge !== undefined && (
        <span className="ml-auto shrink-0">{section.badge}</span>
      )}
    </Row>
  )
}

// Arrow keys walk a tablist, as they do in web/components/layout/tabs.tsx.
const useTabKeys = (keys: string[], onSelect: (key: string) => void) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const setRef = (i: number) => (el: HTMLButtonElement | null) => {
    refs.current[i] = el
  }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, index: number) => {
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown'
    if (!back && !fwd && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
        ? keys.length - 1
        : fwd
        ? (index + 1) % keys.length
        : (index - 1 + keys.length) % keys.length
    onSelect(keys[next])
    requestAnimationFrame(() => refs.current[next]?.focus())
  }
  return { setRef, onKeyDown }
}

// One section at a time, remembered across selections. A section can come and
// go (positions appear on sign-in, related markets load late), so a key that
// is no longer on the list falls back to the first one.
const useActiveSection = (sections: PerpRailSection[]) => {
  const [key, setKey] = useState<string>()
  const active: PerpRailSection | undefined =
    sections.find((s) => s.key === key) ?? sections[0]
  return [active, setKey] as const
}

// ---------------------------------------------------------------------------
// tabs — one card, one body, a segmented control across the top.

const TabsRail = (props: { sections: PerpRailSection[] }) => {
  const { sections } = props
  const [active, setActive] = useActiveSection(sections)
  const { setRef, onKeyDown } = useTabKeys(
    sections.map((s) => s.key),
    setActive
  )
  if (!active) return null
  return (
    <Col className={CARD}>
      <Row
        role="tablist"
        aria-label="Market panels"
        className="border-ink-200 dark:border-ink-300 border-b"
      >
        {sections.map((s, i) => {
          const on = s.key === active.key
          return (
            <button
              key={s.key}
              ref={setRef(i)}
              role="tab"
              id={`perp-rail-tab-${s.key}`}
              aria-controls={`perp-rail-panel-${s.key}`}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(s.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                'min-w-0 flex-1 border-b-2 px-1.5 py-2 text-xs font-medium transition-colors',
                on
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'text-ink-500 hover:text-ink-700 hover:bg-canvas-50 border-transparent'
              )}
            >
              <span className="flex items-center justify-center gap-1">
                <span className="truncate">{s.shortLabel ?? s.label}</span>
                {s.badge !== undefined && (
                  <span className="shrink-0">{s.badge}</span>
                )}
              </span>
            </button>
          )
        })}
      </Row>
      <div
        role="tabpanel"
        id={`perp-rail-panel-${active.key}`}
        aria-labelledby={`perp-rail-tab-${active.key}`}
        className="min-w-0"
      >
        {active.content}
      </div>
    </Col>
  )
}

// ---------------------------------------------------------------------------
// accordion — every header stays in view; opening one closes the rest, so the
// four titles never scroll away and nothing is more than one click off screen.

const AccordionRail = (props: { sections: PerpRailSection[] }) => {
  const { sections } = props
  const [open, setOpen] = useState<string | undefined>(sections[0]?.key)
  const current = sections.some((s) => s.key === open) ? open : undefined
  return (
    <Col className={CARD}>
      {sections.map((s, i) => {
        const on = s.key === current
        const Icon = s.icon
        return (
          <Col
            key={s.key}
            className={clsx(
              i > 0 && 'border-ink-200 dark:border-ink-300 border-t'
            )}
          >
            <button
              onClick={() => setOpen(on ? undefined : s.key)}
              aria-expanded={on}
              aria-controls={`perp-rail-section-${s.key}`}
              className={clsx(
                'hover:bg-canvas-50 flex items-center gap-2 px-3 py-2.5 text-left transition-colors',
                on && 'bg-canvas-50/60'
              )}
            >
              <Icon
                className={clsx(
                  'h-4 w-4 shrink-0',
                  on ? 'text-primary-600 dark:text-primary-400' : 'text-ink-400'
                )}
              />
              <span
                className={clsx(
                  'truncate text-sm font-medium',
                  on ? 'text-ink-900' : 'text-ink-600'
                )}
              >
                {s.label}
              </span>
              {s.badge !== undefined && (
                <span className="ml-auto shrink-0">{s.badge}</span>
              )}
              <ChevronDownIcon
                className={clsx(
                  'text-ink-400 h-4 w-4 shrink-0 transition-transform duration-200',
                  s.badge === undefined && 'ml-auto',
                  on && 'rotate-180'
                )}
              />
            </button>
            {on && (
              <div
                id={`perp-rail-section-${s.key}`}
                className="border-ink-200 dark:border-ink-300 min-w-0 border-t"
              >
                {s.content}
              </div>
            )}
          </Col>
        )
      })}
    </Col>
  )
}

// ---------------------------------------------------------------------------
// dock — the side-buttons idea: an icon rail down the left edge, the chosen
// section filling the rest. The rail stays put while the body swaps, so the
// panel never changes height the way a set of top tabs does.

const DockRail = (props: { sections: PerpRailSection[] }) => {
  const { sections } = props
  const [active, setActive] = useActiveSection(sections)
  const { setRef, onKeyDown } = useTabKeys(
    sections.map((s) => s.key),
    setActive
  )
  if (!active) return null
  return (
    <Row className={CARD}>
      <Col
        role="tablist"
        aria-label="Market panels"
        aria-orientation="vertical"
        className="border-ink-200 dark:border-ink-300 shrink-0 border-r"
      >
        {sections.map((s, i) => {
          const on = s.key === active.key
          const Icon = s.icon
          return (
            <button
              key={s.key}
              ref={setRef(i)}
              role="tab"
              id={`perp-dock-tab-${s.key}`}
              aria-controls={`perp-dock-panel-${s.key}`}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              title={s.label}
              onClick={() => setActive(s.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={clsx(
                'relative flex w-14 flex-col items-center gap-1 px-1 py-3 text-[10px] font-medium leading-none transition-colors sm:w-16',
                on
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                  : 'text-ink-400 hover:bg-canvas-50 hover:text-ink-600'
              )}
            >
              {on && (
                <span className="bg-primary-500 absolute inset-y-0 left-0 w-0.5" />
              )}
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-center">
                {s.shortLabel ?? s.label}
              </span>
            </button>
          )
        })}
      </Col>
      <Col
        role="tabpanel"
        id={`perp-dock-panel-${active.key}`}
        aria-labelledby={`perp-dock-tab-${active.key}`}
        className="min-w-0 flex-1"
      >
        <SectionHeader section={active} />
        <div className="min-w-0">{active.content}</div>
      </Col>
    </Row>
  )
}

// ---------------------------------------------------------------------------
// jump — nothing hides: the cards stay stacked and scannable, and a sticky
// row of pills (lit by whatever is under it) jumps between them.

// Clears the pinned ticker tape (3rem) plus the pill row itself.
const JUMP_OFFSET = 96

const JumpRail = (props: { sections: PerpRailSection[] }) => {
  const { sections } = props
  // Memoized on contents, not identity: the page rebuilds the sections array
  // every render, and the effect below would resubscribe on each one.
  const keyList = sections.map((s) => s.key).join(',')
  const keys = useMemo(() => keyList.split(','), [keyList])
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const [active, setActive] = useState(keys[0])

  useEffect(() => {
    // A plain scroll listener, rAF-throttled: IntersectionObserver only fires
    // on threshold crossings, which leaves the wrong pill lit while a tall
    // card (the watchlist) scrolls past.
    let frame = 0
    const update = () => {
      frame = 0
      let current = keys[0]
      for (const key of keys) {
        const top = refs.current[key]?.getBoundingClientRect().top
        if (top !== undefined && top <= JUMP_OFFSET + 8) current = key
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [keys])

  return (
    <Col className="gap-3">
      <Row
        className={clsx(
          'border-ink-200 dark:border-ink-300 bg-canvas-0/95 sticky top-12 z-10',
          'gap-1 overflow-x-auto rounded-lg border p-1 backdrop-blur'
        )}
      >
        {sections.map((s) => {
          const on = s.key === active
          const Icon = s.icon
          return (
            <button
              key={s.key}
              onClick={() =>
                refs.current[s.key]?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
              aria-current={on}
              className={clsx(
                'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                on
                  ? 'bg-primary-50 text-primary-700 ring-primary-500/40 dark:bg-primary-900/30 dark:text-primary-200 ring-1'
                  : 'text-ink-500 hover:bg-canvas-50 hover:text-ink-700'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{s.shortLabel ?? s.label}</span>
              {s.badge !== undefined && (
                <span className="shrink-0">{s.badge}</span>
              )}
            </button>
          )
        })}
      </Row>
      {sections.map((s) => (
        <Col
          key={s.key}
          ref={(el) => {
            refs.current[s.key] = el
          }}
          className={clsx(CARD, 'scroll-mt-24')}
        >
          <SectionHeader section={s} />
          {s.content}
        </Col>
      ))}
    </Col>
  )
}
