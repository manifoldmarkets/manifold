import {
  CSSProperties,
  ReactNode,
  Ref,
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

export function RaceDetailsPanel(props: {
  title: string
  eyebrow: string
  label: string
  closeRef: Ref<HTMLButtonElement>
  onClose: () => void
  chartLink?: ReactNode
  children: ReactNode
}) {
  const { title, eyebrow, label, closeRef, onClose, chartLink, children } =
    props
  const panelRef = useRef<HTMLElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [layer, setLayer] = useState<CSSProperties>()
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const offsetRef = useRef(offset)
  const [dragging, setDragging] = useState(false)
  const [moved, setMoved] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number }>()
  const helpId = useId()
  const hasLayer = !!layer

  useLayoutEffect(() => {
    const container = anchorRef.current?.parentElement
    if (!container) return
    let frame = 0
    const position = () => {
      const bounds = container.getBoundingClientRect()
      // Keep the desktop popup anchored to the map while rendering outside
      // the page's stacking contexts. The mobile sheet remains viewport-fixed.
      setLayer({
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
        '--map-height':
          getComputedStyle(container).getPropertyValue('--map-height'),
      } as CSSProperties)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(position)
    }
    position()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  const move = useCallback((x: number, y: number) => {
    const bounds = panelRef.current?.getBoundingClientRect()
    if (!bounds) return
    const baseX = bounds.left - offsetRef.current.x
    const baseY = bounds.top - offsetRef.current.y
    const viewportWidth = document.documentElement.clientWidth
    const mobile = window.innerWidth <= 850
    const container = anchorRef.current?.parentElement?.getBoundingClientRect()
    const leftEdge = !mobile && container ? Math.max(8, container.left + 8) : 8
    const rightEdge =
      !mobile && container
        ? Math.min(viewportWidth - 8, container.right - 8)
        : viewportWidth - 8
    const bottomGap = mobile ? 68 : 8
    const next = {
      x: Math.max(
        leftEdge - baseX,
        Math.min(rightEdge - bounds.width - baseX, x)
      ),
      y: Math.max(
        8 - baseY,
        Math.min(window.innerHeight - bounds.height - bottomGap - baseY, y)
      ),
    }
    setOffset((previous) =>
      previous.x === next.x && previous.y === next.y ? previous : next
    )
  }, [])
  const reset = useCallback(() => {
    move(0, 0)
    setMoved(false)
  }, [move])

  useLayoutEffect(() => {
    // Geometry must be compared with the transform already committed to the DOM.
    offsetRef.current = offset
  }, [offset])

  useLayoutEffect(() => {
    panelRef.current?.querySelector('[data-details-content]')?.scrollTo(0, 0)
    move(offsetRef.current.x, offsetRef.current.y)
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[aria-label="Close race details"]')
      ?.focus({ preventScroll: true })
  }, [title, move, hasLayer])

  useEffect(() => {
    // A resize can switch between the desktop card and mobile bottom sheet.
    window.addEventListener('resize', reset)
    return () => window.removeEventListener('resize', reset)
  }, [reset])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const observer = new ResizeObserver(() => {
      const { x, y } = offsetRef.current
      move(x, y)
    })
    observer.observe(panel)
    if (panel.parentElement) observer.observe(panel.parentElement)
    return () => observer.disconnect()
  }, [move, hasLayer])

  const panel = (
    <section
      ref={panelRef}
      className={clsx(styles.details, interactions.scope)}
      aria-label={label}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <div className={styles.detailHeading}>
        <h3 className={styles.detailMoveHeading}>
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
                px: offsetRef.current.x,
                py: offsetRef.current.y,
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
              const { x, y } = offsetRef.current
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
            <span className={styles.eyebrow}>{eyebrow}</span>
            <span className={styles.detailTitle}>{title}</span>
            <span className={styles.dragHint} aria-hidden>
              ⠿ Drag to move
            </span>
          </button>
        </h3>
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
      </div>
      <span id={helpId} className="sr-only">
        Drag to move this popup, or use arrow keys. Press Home to reset its
        position.
      </span>
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
