import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  balanceSegments,
  BarGroup,
  ElectionMode,
  seatSummary,
} from './election-map-model'
import { plural } from './election-display'
import {
  hitTargets,
  layoutSegments,
  seatPosition,
  segmentAt,
} from './seat-bar-layout'
import {
  dragSelection,
  GroupSelection,
  toggleGroup,
} from './seat-bar-selection'
import styles from './election-explorer.module.css'

// Every segment is at least this wide, with a surface-colored gap between.
const MIN_SEGMENT_PX = 6
const GAP_PX = 2
// Click/tap targets are at least this wide, centered on thin segments.
const MIN_TARGET_PX = 24
// A press turns into a range drag once it moves this far sideways; a finger
// gets more slack than a mouse.
const DRAG_SLOP_PX = { mouse: 5, other: 10 }
// The click that ends a drag is part of the drag, not a toggle.
const DRAG_CLICK_MS = 250
// The map preview waits this long when the mouse arrives on the bar, so
// crossing it on the way to the toolbar does not flash the map. Moving from
// segment to segment after that previews at once.
const PREVIEW_DELAY_MS = 120

type Drag = {
  pointerId: number
  x: number
  y: number
  slop: number
  anchor: BarGroup
  // The selection when the press began; every move applies its range to this.
  base: GroupSelection
  active: boolean
  over?: BarGroup
}

const groupOf = (target: EventTarget) =>
  (target instanceof Element
    ? target.closest('[data-group]')?.getAttribute('data-group') ?? undefined
    : undefined) as BarGroup | undefined

export function ElectionBalance({
  summary,
  mode,
  selection,
  preview,
  onSelect,
  onPreview,
}: {
  summary: ReturnType<typeof seatSummary>
  mode: ElectionMode
  // Selected groups, in bar order; empty when nothing is selected.
  selection: GroupSelection
  // The group under the mouse, previewed on the map.
  preview?: BarGroup
  onSelect: (next: BarGroup[]) => void
  onPreview: (group: BarGroup | undefined) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  const drag = useRef<Drag>()
  const dragEndedAt = useRef(-Infinity)
  const [dragging, setDragging] = useState(false)
  const previewTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(previewTimer.current), [])
  const previewGroup = (group: BarGroup | undefined) => {
    clearTimeout(previewTimer.current)
    if (!group || preview) onPreview(group)
    else
      previewTimer.current = setTimeout(
        () => onPreview(group),
        PREVIEW_DELAY_MS
      )
  }
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => setWidth(track.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  const segments = balanceSegments(summary)
  const order = segments.map((s) => s.group)
  const counts = segments.map((s) => s.count)
  const boxes = width
    ? layoutSegments(counts, width, { min: MIN_SEGMENT_PX, gap: GAP_PX })
    : []
  const targets = width ? hitTargets(boxes, width, MIN_TARGET_PX) : []
  // Before the bar is measured (server render), plain proportional widths.
  const place = (i: number) =>
    boxes[i]
      ? { left: boxes[i].x, width: boxes[i].w }
      : {
          left: `${
            (counts.slice(0, i).reduce((a, b) => a + b, 0) / summary.total) *
            100
          }%`,
          width: `${(counts[i] / summary.total) * 100}%`,
        }
  const threshold = mode === 'house' ? 218 : mode === 'senate' ? 50 : undefined
  const thresholdX =
    threshold !== undefined && boxes.length
      ? seatPosition(counts, boxes, threshold)
      : undefined
  const unit = mode === 'governor' ? 'governorship' : 'seat'
  const isSelected = (group: BarGroup) => selection.includes(group)
  const showPreview = !dragging && !!preview

  // The group under a dragging pointer; past either end, the end group.
  const groupAtX = (clientX: number) => {
    const track = trackRef.current
    if (!track || !targets.length) return undefined
    const i = segmentAt(targets, clientX - track.getBoundingClientRect().left)
    return i === undefined ? undefined : segments[i].group
  }
  const endDrag = (pointerId: number, revert: boolean) => {
    const d = drag.current
    if (!d || d.pointerId !== pointerId) return
    drag.current = undefined
    if (!d.active) return
    dragEndedAt.current = performance.now()
    setDragging(false)
    if (revert) onSelect([...d.base])
  }
  // Escape on a segment cancels a drag in progress, else clears the
  // selection (and only that: an open race panel stays open).
  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    const d = drag.current
    if (d?.active) endDrag(d.pointerId, true)
    else if (selection.length) onSelect([])
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className={styles.balance}>
      <div className={styles.balanceLabels}>
        <span data-tone="dem">
          <b>{summary.leaders.dem}</b>{' '}
          <span className={styles.partyFull}>Democratic</span>
          <span className={styles.partyShort}>D</span>
        </span>
        <span className={styles.threshold}>
          {mode === 'house'
            ? '218 for a majority · 435 seats'
            : mode === 'senate'
            ? 'D needs 51 · R needs 50 (VP breaks ties)'
            : `of ${summary.total} governorships up in 2026`}
        </span>
        <span data-tone="rep">
          <span className={styles.partyFull}>Republican</span>
          <span className={styles.partyShort}>R</span>{' '}
          <b>{summary.leaders.rep}</b>
        </span>
      </div>
      <div
        ref={trackRef}
        className={styles.balanceTrack}
        role="group"
        aria-label="Seats by market likelihood. Select one or more groups to list their races; Escape clears."
        data-filtered={selection.length > 0}
        data-dragging={dragging}
        // Hover previews a group on the map (mouse only; never selects).
        onPointerOver={(e) => {
          if (e.pointerType !== 'mouse' || drag.current?.active) return
          // Gaps between segments keep the current preview.
          const group = groupOf(e.target)
          if (group) previewGroup(group)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') previewGroup(undefined)
        }}
        // Press on a group and move sideways to select the groups between.
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          const anchor = groupOf(e.target)
          drag.current = anchor
            ? {
                pointerId: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                slop:
                  e.pointerType === 'mouse'
                    ? DRAG_SLOP_PX.mouse
                    : DRAG_SLOP_PX.other,
                anchor,
                base: selection,
                active: false,
              }
            : undefined
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.pointerId !== e.pointerId) return
          if (!d.active) {
            const dx = Math.abs(e.clientX - d.x)
            const dy = Math.abs(e.clientY - d.y)
            if (dx < d.slop) {
              // A finger moving up or down first is scrolling the page.
              if (e.pointerType !== 'mouse' && dy >= d.slop)
                drag.current = undefined
              return
            }
            d.active = true
            setDragging(true)
            previewGroup(undefined)
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // The pointer is already gone; pointerup/cancel will end it.
            }
          }
          const over = groupAtX(e.clientX)
          if (!over || over === d.over) return
          d.over = over
          onSelect(dragSelection(d.base, order, d.anchor, over))
        }}
        onPointerUp={(e) => endDrag(e.pointerId, false)}
        // The browser took over (a scroll): undo the partial drag.
        onPointerCancel={(e) => endDrag(e.pointerId, true)}
      >
        {/* The visible bar; its rounded ends come from this clipping band. */}
        <div className={styles.balanceBand} aria-hidden>
          {segments.map((segment, i) => (
            <span
              key={segment.id}
              className={clsx(
                styles.balanceSegment,
                (!segment.tier ||
                  segment.tier === 'fixed-d' ||
                  segment.tier === 'fixed-r') &&
                  styles.heldSeats
              )}
              data-selected={isSelected(segment.group)}
              data-preview={showPreview && segment.group === preview}
              style={{ ...place(i), backgroundColor: segment.color }}
            >
              {!segment.tier
                ? (boxes[i]?.w ?? 0) > 46 && `${segment.count} held`
                : (boxes[i]?.w ?? 0) > 22 && segment.count}
            </span>
          ))}
        </div>
        {/* Underlines mark the selected groups, and the one under the mouse
            in the map's hover color. */}
        {segments.map((segment, i) =>
          isSelected(segment.group) ? (
            <span
              key={segment.id}
              className={styles.balanceCaret}
              style={place(i)}
              aria-hidden
            />
          ) : null
        )}
        {segments.map((segment, i) =>
          showPreview && segment.group === preview ? (
            <span
              key={`preview-${segment.id}`}
              className={clsx(styles.balanceCaret, styles.previewCaret)}
              style={place(i)}
              aria-hidden
            />
          ) : null
        )}
        {thresholdX !== undefined && (
          <span
            className={styles.majorityLine}
            style={{ left: thresholdX - 1 }}
          />
        )}
        {/* Transparent targets, at least 24px wide, in reading order for
            the keyboard; thinner ones stack above their neighbors. */}
        {segments.map((segment, i) => {
          const tip = `${segment.label} · ${plural(segment.count, unit)}`
          const box = boxes[i]
          const target =
            box && targets[i]
              ? { ...targets[i], zIndex: box.w < MIN_TARGET_PX ? 2 : 1 }
              : place(i)
          // Tooltips near the ends open inward so they stay on screen.
          const center = box ? box.x + box.w / 2 : undefined
          const align =
            center === undefined || !width
              ? 'middle'
              : center < width * 0.25
              ? 'start'
              : center > width * 0.75
              ? 'end'
              : 'middle'
          const group = segment.group
          const selected = isSelected(group)
          return (
            <button
              key={segment.id}
              className={styles.balanceTarget}
              aria-label={tip}
              aria-pressed={selected}
              data-align={align}
              data-group={group}
              style={target}
              onKeyDown={onEscape}
              onClick={(e) => {
                // detail is 0 for Enter/Space, which always toggle.
                if (
                  e.detail > 0 &&
                  performance.now() - dragEndedAt.current < DRAG_CLICK_MS
                )
                  return
                onSelect(toggleGroup(selection, group, order))
              }}
            >
              <span className={styles.balanceTip} aria-hidden>
                {tip}
                <span className={styles.balanceTipAction}>
                  {selected
                    ? 'Click to remove'
                    : selection.length
                    ? 'Click to add'
                    : 'Click to list · drag across for a range'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
