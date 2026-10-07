import { useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  balanceSegments,
  ElectionMode,
  seatSummary,
  Tier,
} from './election-map-model'
import { plural } from './election-display'
import { hitTargets, layoutSegments, seatPosition } from './seat-bar-layout'
import styles from './election-explorer.module.css'

// Every segment is at least this wide, with a surface-colored gap between.
const MIN_SEGMENT_PX = 6
const GAP_PX = 2
// Click/tap targets are at least this wide, centered on thin segments.
const MIN_TARGET_PX = 24

export function ElectionBalance({
  summary,
  mode,
  filter,
  onFilter,
}: {
  summary: ReturnType<typeof seatSummary>
  mode: ElectionMode
  filter?: Tier
  onFilter: (tier: Tier) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
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
        aria-label="Seats by market likelihood. Select a group to list its races."
        data-filtered={!!filter}
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
              data-selected={!!filter && filter === segment.tier}
              style={{ ...place(i), backgroundColor: segment.color }}
            >
              {!segment.tier
                ? (boxes[i]?.w ?? 0) > 46 && `${segment.count} held`
                : (boxes[i]?.w ?? 0) > 22 && segment.count}
            </span>
          ))}
        </div>
        {/* An underline marks the selected group. */}
        {segments.map((segment, i) =>
          filter && segment.tier === filter ? (
            <span
              key={segment.id}
              className={styles.balanceCaret}
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
          return segment.tier ? (
            <button
              key={segment.id}
              className={styles.balanceTarget}
              aria-label={`${tip}. ${
                filter === segment.tier ? 'Listed below' : 'List these races'
              }`}
              aria-pressed={filter === segment.tier}
              data-align={align}
              style={target}
              onClick={() => onFilter(segment.tier!)}
            >
              <span className={styles.balanceTip} aria-hidden>
                {tip}
              </span>
            </button>
          ) : (
            <span
              key={segment.id}
              className={styles.balanceTarget}
              data-align={align}
              style={target}
              role="img"
              aria-label={tip}
            >
              <span className={styles.balanceTip} aria-hidden>
                {tip}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
