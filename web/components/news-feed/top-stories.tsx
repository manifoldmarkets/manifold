import clsx from 'clsx'
import { ComponentProps, forwardRef, useEffect, useRef, useState } from 'react'
import { Contract } from 'common/contract'
import { NewsSpotlight, NewsStory } from 'common/news-feed'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { trackNews } from './news-events'
import { Price } from './news-market-row'
import { CategoryChip, StoryCard } from './story-card'

type CardProps = Omit<ComponentProps<typeof StoryCard>, 'hero' | 'className'>

/** How long a story holds the hero slot before the next takes over. */
const ROTATE_MS = 8_000
/** After a touch anywhere in the block, it holds still this long. */
const TOUCH_HOLD_MS = 12_000
/** A horizontal swipe on the hero at least this long turns the page. */
const SWIPE_PX = 48

/**
 * The day's top stories as a rotator: one in the wide hero slot, all of
 * them as tiles under it. The active tile fills a progress bar and, when it
 * fills, the next story slides into the hero. Hovering, focusing, touching
 * or opening the hero's forecasts holds the rotation, so it never moves
 * while someone is looking at it; picking a tile shows that story and
 * opens its forecasts in the wide slot.
 */
export function TopStories(props: {
  /** Best first. */
  top: NewsSpotlight[]
  cardProps: (story: NewsStory, position: number) => CardProps
  contractsById: Record<string, Contract>
  /** A story took the hero slot: the reader chose it (open its forecasts)
   * or the rotation brought it (fold them). */
  onSelect: (story: NewsStory, open: boolean) => void
}) {
  const { top, cardProps, contractsById, onSelect } = props
  const [index, setIndex] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [held, setHeld] = useState(false)
  /** On a touch screen the first pick ends the rotation: there is no hover
   * to say when the reader has finished. */
  const [stopped, setStopped] = useState(false)
  const visible = useIsPageVisible()
  const motion = useMotionAllowed()

  // A new set of top stories starts again from the first, folded, so the
  // rotation is running when the block appears.
  const topKey = top.map((t) => t.story.id).join()
  useEffect(() => {
    setIndex(0)
    if (top[0]) onSelect(top[0].story, false)
  }, [topKey])

  const count = top.length
  const active = top[Math.min(index, count - 1)]
  const activeProps = active ? cardProps(active.story, index) : undefined
  const paused =
    !active ||
    count < 2 ||
    stopped ||
    hovering ||
    focusWithin ||
    held ||
    !!activeProps?.open ||
    !visible ||
    !motion

  // --- the progress bar under the active tile -------------------------
  // One timeout, and the bar's own CSS transition for the fill: no work per
  // frame. Pausing freezes the bar where it is; resuming finishes the rest.
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const elapsedRef = useRef(0)
  const startedRef = useRef<number>()
  useEffect(() => {
    elapsedRef.current = 0
    startedRef.current = undefined
    for (const bar of barRefs.current) {
      if (!bar) continue
      bar.style.transition = 'none'
      bar.style.width = '0%'
    }
  }, [index, topKey])
  useEffect(() => {
    const bar = barRefs.current[index]
    if (!bar || !active) return
    if (paused) {
      if (startedRef.current != null) {
        elapsedRef.current += performance.now() - startedRef.current
        startedRef.current = undefined
      }
      const pct = stopped
        ? 100
        : Math.min(100, (elapsedRef.current / ROTATE_MS) * 100)
      bar.style.transition = 'none'
      bar.style.width = `${pct}%`
      return
    }
    const remaining = Math.max(0, ROTATE_MS - elapsedRef.current)
    startedRef.current = performance.now()
    const frame = requestAnimationFrame(() => {
      bar.style.transition = `width ${remaining}ms linear`
      bar.style.width = '100%'
    })
    const timer = setTimeout(() => {
      const next = (index + 1) % count
      setIndex(next)
      onSelect(top[next].story, false)
    }, remaining)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [paused, index, topKey, stopped])

  // --- the hero slot: animated height, so a swap never jumps -----------
  const heroInner = useRef<HTMLDivElement>(null)
  const [heroHeight, setHeroHeight] = useState<number>()
  useEffect(() => {
    const el = heroInner.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) =>
      setHeroHeight(entry.contentRect.height)
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- the tile strip: keep the active tile in view on phones ----------
  const stripRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    const strip = stripRef.current
    const tile = tileRefs.current[index]
    if (!strip || !tile || strip.scrollWidth <= strip.clientWidth) return
    strip.scrollTo({
      left: tile.offsetLeft - strip.offsetLeft - 8,
      behavior: motion ? 'smooth' : 'auto',
    })
  }, [index, motion])

  const pick = (i: number, how: 'tile' | 'swipe') => {
    if (!top[i]) return
    trackNews('news top story select', {
      storyId: top[i].story.id,
      position: i,
      how,
    })
    setIndex(i)
    onSelect(top[i].story, how === 'tile')
  }

  // Touch: hold the rotation for a while, and a pick ends it.
  const holdTimer = useRef<ReturnType<typeof setTimeout>>()
  const touched = () => {
    setHeld(true)
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => setHeld(false), TOUCH_HOLD_MS)
  }
  useEffect(
    () => () => holdTimer.current && clearTimeout(holdTimer.current),
    []
  )
  const swipeStart = useRef<{ x: number; y: number }>()

  if (!active || !activeProps) return null

  return (
    <Col
      className="gap-2"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocusWithin(false)
      }}
      onTouchStart={touched}
    >
      <Label hero={active} index={index} count={count} />

      <div
        className="overflow-hidden"
        style={{
          height: heroHeight,
          transition: motion
            ? 'height 320ms cubic-bezier(0.2, 0.8, 0.2, 1)'
            : undefined,
        }}
        onTouchStart={(e) => {
          const t = e.touches[0]
          swipeStart.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(e) => {
          const start = swipeStart.current
          swipeStart.current = undefined
          const t = e.changedTouches[0]
          if (!start || !t) return
          const dx = t.clientX - start.x
          const dy = t.clientY - start.y
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5)
            return
          setStopped(true)
          pick((index + (dx < 0 ? 1 : count - 1)) % count, 'swipe')
        }}
      >
        <div ref={heroInner} className="pb-px">
          <div
            key={active.story.id}
            className={clsx(motion && 'animate-news-fade-in')}
          >
            <StoryCard {...activeProps} hero />
          </div>
        </div>
      </div>

      {count > 1 && (
        <div
          ref={stripRef}
          role="group"
          aria-label="Top stories"
          className="scrollbar-hide -mx-2 flex snap-x gap-2 overflow-x-auto px-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0"
        >
          {top.map((t, i) => (
            <Tile
              key={t.story.id}
              ref={(el) => (tileRefs.current[i] = el)}
              barRef={(el) => (barRefs.current[i] = el)}
              pick={t}
              active={i === index}
              contractsById={contractsById}
              onPick={() => {
                if (held) setStopped(true)
                pick(i, 'tile')
              }}
            />
          ))}
        </div>
      )}
    </Col>
  )
}

/** The heading, which story is up, and why it ranks. */
function Label(props: { hero: NewsSpotlight; index: number; count: number }) {
  const { reason, value } = props.hero
  const { index, count } = props
  const why =
    reason === 'likes'
      ? `${value} ${value === 1 ? 'like' : 'likes'}`
      : `Ṁ${shortFormatNumber(value)} traded on its markets today`
  const whyShort =
    reason === 'likes'
      ? `${value} ${value === 1 ? 'like' : 'likes'}`
      : `Ṁ${shortFormatNumber(value)} today`
  return (
    <Row className="items-baseline justify-between gap-2 px-1">
      <h2 className="text-primary-700 text-[11px] font-semibold uppercase tracking-wide">
        Top stories today
        {count > 1 && (
          <span className="text-ink-400 ml-2 font-medium normal-case tracking-normal">
            {index + 1} of {count}
          </span>
        )}
      </h2>
      <span className="text-ink-400 truncate text-xs">
        <span className="hidden sm:inline">{why}</span>
        <span className="sm:hidden">{whyShort}</span>
      </span>
    </Row>
  )
}

/** One story's place in the rotation: enough to decide whether it is the
 * one you came for, its top forecast's price, and the bar that fills while
 * it holds the hero slot. */
const Tile = forwardRef(function Tile(
  props: {
    pick: NewsSpotlight
    active: boolean
    contractsById: Record<string, Contract>
    barRef: (el: HTMLDivElement | null) => void
    onPick: () => void
  },
  ref: React.Ref<HTMLButtonElement>
) {
  const { pick, active, contractsById, barRef, onPick } = props
  const { story } = pick
  const headline = story.article?.title ?? story.headline
  const outlet = story.article?.publisher ?? story.sources[0]?.name ?? 'News'
  const featured = story.featuredId
    ? contractsById[story.featuredId]
    : undefined
  const n = story.contractIds.length
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={clsx(
        'relative flex w-[76%] max-w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border px-3 pb-3.5 pt-2 text-left transition-colors sm:w-auto sm:max-w-none',
        'focus-visible:ring-primary-300 focus-visible:outline-none focus-visible:ring-2',
        active
          ? 'border-primary-400 bg-primary-50'
          : 'bg-canvas-0 border-ink-200 hover:border-primary-300 hover:bg-canvas-50'
      )}
    >
      <Row className="text-ink-500 w-full items-center gap-2 text-[11px]">
        <CategoryChip category={story.category} />
        <RelativeTimestamp
          time={story.updatedTime}
          shortened
          className="text-ink-400 ml-auto"
        />
      </Row>
      <span
        className={clsx(
          'mt-1.5 line-clamp-2 text-sm font-semibold leading-snug',
          active ? 'text-primary-900' : 'text-ink-900'
        )}
        title={headline}
      >
        {headline}
      </span>
      <Row className="text-ink-500 mt-auto w-full items-center justify-between gap-2 pt-1.5 text-xs">
        <span className="truncate">{outlet}</span>
        {featured ? (
          <Price contract={featured} size="sm" />
        ) : (
          <span className="shrink-0">
            {n} {n === 1 ? 'forecast' : 'forecasts'}
          </span>
        )}
      </Row>
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 h-1',
          active ? 'bg-primary-100' : 'bg-ink-100'
        )}
        aria-hidden
      >
        <div ref={barRef} className="bg-primary-500 h-full w-0" />
      </div>
    </button>
  )
})

/** False when the reader asked the OS for less motion: then nothing
 * rotates or animates, and the tiles are a plain picker. */
function useMotionAllowed() {
  const [allowed, setAllowed] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setAllowed(!mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return allowed
}
