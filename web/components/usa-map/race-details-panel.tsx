import {
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshIcon,
  XIcon,
} from '@heroicons/react/outline'
import styles from './election-explorer.module.css'

export function RaceDetailsPanel(props: {
  title: string
  eyebrow: string
  label: string
  closeRef: Ref<HTMLButtonElement>
  onClose: () => void
  children: ReactNode
}) {
  const { title, eyebrow, label, closeRef, onClose, children } = props
  const panelRef = useRef<HTMLElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const offsetRef = useRef(offset)
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number }>()
  const contentId = useId()
  const helpId = useId()

  const move = useCallback((x: number, y: number) => {
    const bounds = panelRef.current?.getBoundingClientRect()
    if (!bounds) return
    const baseX = bounds.left - offsetRef.current.x
    const baseY = bounds.top - offsetRef.current.y
    const viewportWidth = document.documentElement.clientWidth
    const mobile = window.innerWidth <= 850
    const container = panelRef.current?.parentElement?.getBoundingClientRect()
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
    offsetRef.current = next
    setOffset(next)
  }, [])
  const reset = useCallback(() => {
    offsetRef.current = { x: 0, y: 0 }
    setOffset(offsetRef.current)
  }, [])

  useEffect(() => {
    setCollapsed(false)
    panelRef.current?.querySelector('[data-details-content]')?.scrollTo(0, 0)
  }, [title])

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
      if (x || y) move(x, y)
    })
    observer.observe(panel)
    return () => observer.disconnect()
  }, [move])

  return (
    <section
      ref={panelRef}
      className={styles.details}
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
              if (start)
                move(
                  start.px + e.clientX - start.x,
                  start.py + e.clientY - start.y
                )
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
          <button
            aria-label="Reset popup position"
            title="Reset position"
            disabled={offset.x === 0 && offset.y === 0}
            onClick={reset}
          >
            <RefreshIcon aria-hidden />
          </button>
          <button
            aria-label={
              collapsed ? 'Expand race details' : 'Collapse race details'
            }
            aria-expanded={!collapsed}
            aria-controls={contentId}
            title={collapsed ? 'Expand details' : 'Collapse details'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronDownIcon aria-hidden />
            ) : (
              <ChevronUpIcon aria-hidden />
            )}
          </button>
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
      <div
        id={contentId}
        data-details-content
        hidden={collapsed}
        className={styles.detailContent}
      >
        {children}
      </div>
    </section>
  )
}
