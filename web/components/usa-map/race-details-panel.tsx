import {
  CSSProperties,
  ReactNode,
  Ref,
  RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { RefreshIcon, XIcon } from '@heroicons/react/outline'
import styles from './election-explorer.module.css'
import interactions from '../us-elections/election-interactions.module.css'
import { Point } from './map-camera'
import { clampRaceCard, placeRaceCard } from './race-card-position'

export function RaceDetailsPanel(props: {
  title: string
  eyebrow: string
  label: string
  closeRef: Ref<HTMLButtonElement>
  pinned: boolean
  pointer: RefObject<Point | undefined>
  onClose: () => void
  chartLink?: ReactNode
  children: ReactNode
}) {
  const {
    title,
    eyebrow,
    label,
    closeRef,
    pinned,
    pointer,
    onClose,
    chartLink,
    children,
  } = props
  const panelRef = useRef<HTMLElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [layer, setLayer] = useState<CSSProperties>()
  const [mobile, setMobile] = useState(false)
  const [position, setPosition] = useState<Point>()
  const positionRef = useRef<Point>()
  const pinOrigin = useRef<Point>()
  const wasPinned = useRef(false)
  const pinnedRef = useRef(pinned)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const offsetRef = useRef(offset)
  const [dragging, setDragging] = useState(false)
  const [moved, setMoved] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number }>()
  const helpId = useId()
  const hasLayer = !!layer
  const hasPosition = !!position

  useLayoutEffect(() => {
    const container = anchorRef.current?.parentElement
    if (!container) return
    const resize = () => {
      setMobile(window.innerWidth <= 850)
      setLayer({
        '--map-height':
          getComputedStyle(container).getPropertyValue('--map-height'),
      } as CSSProperties)
      setOffset({ x: 0, y: 0 })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  const cardBounds = useCallback(() => {
    const container = anchorRef.current?.parentElement?.getBoundingClientRect()
    return {
      left: Math.max(8, (container?.left ?? 0) + 8),
      right: Math.min(
        document.documentElement.clientWidth - 8,
        (container?.right ?? window.innerWidth) - 8
      ),
      top: 8,
      bottom: window.innerHeight - 8,
    }
  }, [])
  const positionCard = useCallback((next: Point) => {
    positionRef.current = next
    setPosition((previous) =>
      previous?.x === next.x && previous?.y === next.y ? previous : next
    )
  }, [])
  const follow = useCallback(
    (cursor: Point) => {
      const panel = panelRef.current
      if (panel)
        positionCard(
          placeRaceCard(cursor, panel.getBoundingClientRect(), cardBounds())
        )
    },
    [cardBounds, positionCard]
  )
  const move = useCallback(
    (x: number, y: number) => {
      const bounds = panelRef.current?.getBoundingClientRect()
      if (!bounds) return
      if (window.innerWidth > 850) {
        positionCard(clampRaceCard({ x, y }, bounds, cardBounds()))
        return
      }
      const baseX = bounds.left - offsetRef.current.x
      const baseY = bounds.top - offsetRef.current.y
      const viewportWidth = document.documentElement.clientWidth
      const next = {
        x: Math.max(
          8 - baseX,
          Math.min(viewportWidth - 8 - bounds.width - baseX, x)
        ),
        y: Math.max(
          8 - baseY,
          Math.min(window.innerHeight - bounds.height - 68 - baseY, y)
        ),
      }
      setOffset((previous) =>
        previous.x === next.x && previous.y === next.y ? previous : next
      )
    },
    [cardBounds, positionCard]
  )
  const reset = useCallback(() => {
    const origin = window.innerWidth <= 850 ? { x: 0, y: 0 } : pinOrigin.current
    if (origin) move(origin.x, origin.y)
    setMoved(false)
  }, [move])

  useLayoutEffect(() => {
    // Geometry must be compared with the transform already committed to the DOM.
    offsetRef.current = offset
    pinnedRef.current = pinned
  }, [offset, pinned])

  useLayoutEffect(() => {
    if (!hasLayer) return
    if (!mobile) {
      if (!pinned || !positionRef.current) {
        const bounds = cardBounds()
        follow(
          pointer.current ?? {
            x: bounds.right,
            y: Math.max(
              8,
              (anchorRef.current?.parentElement?.getBoundingClientRect().top ??
                0) + 80
            ),
          }
        )
      }
      if (pinned && (!wasPinned.current || !pinOrigin.current))
        pinOrigin.current = positionRef.current
    }
    if (!pinned) setMoved(false)
    wasPinned.current = pinned
    if (!pinned) return
    panelRef.current?.querySelector('[data-details-content]')?.scrollTo(0, 0)
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[aria-label="Close race details"]')
      ?.focus({ preventScroll: true })
  }, [
    title,
    pinned,
    mobile,
    hasLayer,
    hasPosition,
    cardBounds,
    follow,
    pointer,
  ])

  useLayoutEffect(() => {
    if (pinned || mobile || !hasLayer) return
    let frame = 0
    const track = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!pinnedRef.current) follow({ x: e.clientX, y: e.clientY })
      })
    }
    window.addEventListener('pointermove', track)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', track)
    }
  }, [pinned, mobile, hasLayer, follow])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const observer = new ResizeObserver(() => {
      if (mobile) move(offsetRef.current.x, offsetRef.current.y)
      else if (!pinned && pointer.current) follow(pointer.current)
      else if (positionRef.current)
        move(positionRef.current.x, positionRef.current.y)
    })
    observer.observe(panel)
    if (panel.parentElement) observer.observe(panel.parentElement)
    return () => observer.disconnect()
  }, [move, hasLayer, mobile, pinned, pointer, follow])

  const heading = (
    <>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <span className={styles.detailTitle}>{title}</span>
      <span className={styles.dragHint} aria-hidden>
        {pinned ? '⠿ Drag to move' : 'Click to pin and explore'}
      </span>
    </>
  )

  const panel = (
    <section
      ref={panelRef}
      className={clsx(styles.details, interactions.scope)}
      aria-label={label}
      role={pinned ? 'region' : 'tooltip'}
      data-pinned={pinned}
      style={
        mobile
          ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
          : ({
              left: position?.x,
              top: position?.y,
              '--popup-top': `${position?.y ?? 8}px`,
              visibility: position ? undefined : 'hidden',
            } as CSSProperties)
      }
    >
      <div className={styles.detailHeading}>
        <h3 className={styles.detailMoveHeading}>
          {pinned ? (
            <button
              className={styles.detailDragHandle}
              aria-label={`Move ${title} details`}
              aria-describedby={helpId}
              title="Drag to move · arrow keys to reposition · Home to reset"
              data-dragging={dragging}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.preventDefault()
                e.currentTarget.focus({ preventScroll: true })
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  px: mobile ? offsetRef.current.x : positionRef.current!.x,
                  py: mobile ? offsetRef.current.y : positionRef.current!.y,
                }
                setDragging(true)
              }}
              onPointerMove={(e) => {
                const start = drag.current
                if (start) {
                  move(
                    start.px + e.clientX - start.x,
                    start.py + e.clientY - start.y
                  )
                  setMoved(true)
                }
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId)
                drag.current = undefined
                setDragging(false)
              }}
              onLostPointerCapture={() => {
                drag.current = undefined
                setDragging(false)
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 40 : 16
                const { x, y } = mobile
                  ? offsetRef.current
                  : positionRef.current!
                if (e.key === 'Home') reset()
                else if (e.key === 'ArrowLeft') move(x - step, y)
                else if (e.key === 'ArrowRight') move(x + step, y)
                else if (e.key === 'ArrowUp') move(x, y - step)
                else if (e.key === 'ArrowDown') move(x, y + step)
                else return
                if (e.key !== 'Home') setMoved(true)
                e.preventDefault()
              }}
            >
              {heading}
            </button>
          ) : (
            <div>{heading}</div>
          )}
        </h3>
        {pinned && (
          <div className={styles.detailActions}>
            {chartLink}
            {moved && (
              <button
                aria-label="Reset popup position"
                title="Reset position"
                onClick={reset}
              >
                <RefreshIcon aria-hidden />
              </button>
            )}
            <button
              ref={closeRef}
              aria-label="Close race details"
              title="Close details"
              onClick={onClose}
            >
              <XIcon aria-hidden />
            </button>
          </div>
        )}
      </div>
      {pinned && (
        <span id={helpId} className="sr-only">
          Drag to move this popup, or use arrow keys. Press Home to reset its
          position.
        </span>
      )}
      <div data-details-content className={styles.detailContent}>
        {children}
      </div>
    </section>
  )
  return (
    <>
      <span ref={anchorRef} hidden aria-hidden />
      {layer &&
        createPortal(
          <div className={styles.detailsLayer} style={layer}>
            {panel}
          </div>,
          document.body
        )}
    </>
  )
}
