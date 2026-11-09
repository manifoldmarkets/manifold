import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { labelInk, plural } from 'web/components/usa-map/election-display'
import styles from 'web/components/usa-map/election-explorer.module.css'
import {
  hitTargets,
  layoutSegments,
  seatPosition,
} from 'web/components/usa-map/seat-bar-layout'
import {
  Party,
  Tracker,
  TrackerSegment,
  TrackerTone,
} from 'web/lib/politics/election-map'

// The bar above the map: every electoral vote, seat or contest in the view,
// grouped by how sure our markets are, with the line a party has to pass.
// Built on the 2026 seat bar's layout and styles. Hovering a group outlines
// its places on the map; clicking one (or more) lists them.

// The 2026 seat bar's tier colors: steps along the map's blue–red gradient.
export const TONE_COLOR: Record<Exclude<TrackerTone, 'leader'>, string> = {
  safeD: '#4a5fa8',
  likelyD: '#718ac4',
  leanD: '#a9bde0',
  tossup: '#d9d2dc',
  leanR: '#e0aaa5',
  likelyR: '#c87570',
  safeR: '#9d3336',
  wonD: '#4a5fa8',
  wonR: '#9d3336',
  wonO: '#318b83',
  notUpD: '#4a5fa8',
  notUpR: '#9d3336',
  // A party's Senate and governor primaries; recolored per party below.
  strength0: '#a9bde0',
  strength1: '#718ac4',
  strength2: '#4a5fa8',
  open: '#a99fbd',
}
const STRENGTH_R = {
  strength0: '#e0aaa5',
  strength1: '#c87570',
  strength2: '#9d3336',
}

export function segmentColor(segment: TrackerSegment, party: Party = 'D') {
  if (segment.tone === 'leader') return segment.color ?? '#8a8a8a'
  if (party === 'R' && segment.tone in STRENGTH_R)
    return STRENGTH_R[segment.tone as keyof typeof STRENGTH_R]
  return TONE_COLOR[segment.tone]
}

const MIN_SEGMENT_PX = 6
const GAP_PX = 2
const MIN_TARGET_PX = 24
// Crossing the bar on the way to the toolbar shouldn't flash the map.
const PREVIEW_DELAY_MS = 120

export function MapTracker(props: {
  tracker: Tracker
  party?: Party
  selection: string[]
  preview?: string
  onSelect: (keys: string[]) => void
  onPreview: (key: string | undefined) => void
}) {
  const { tracker, party, selection, preview, onSelect, onPreview } = props
  const { segments, threshold, unit } = tracker
  const trackRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => setWidth(track.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])
  const previewKey = (key: string | undefined) => {
    clearTimeout(timer.current)
    if (!key || preview) onPreview(key)
    else timer.current = setTimeout(() => onPreview(key), PREVIEW_DELAY_MS)
  }

  const counts = segments.map((s) => s.count)
  const total = counts.reduce((a, b) => a + b, 0)
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
            (counts.slice(0, i).reduce((a, b) => a + b, 0) / total) * 100
          }%`,
          width: `${(counts[i] / total) * 100}%`,
        }
  const thresholdX =
    threshold !== undefined && boxes.length
      ? seatPosition(counts, boxes, threshold)
      : undefined
  const selected = (key: string) => selection.includes(key)

  return (
    <div className={styles.balance}>
      <div className={styles.balanceLabels}>
        {tracker.dem !== undefined ? (
          <span data-tone="dem">
            <b>{tracker.dem}</b>{' '}
            <span className={styles.partyFull}>Democratic</span>
            <span className={styles.partyShort}>D</span>
          </span>
        ) : (
          <span />
        )}
        <span className={styles.threshold}>{tracker.middle}</span>
        {tracker.rep !== undefined ? (
          <span data-tone="rep">
            <span className={styles.partyFull}>Republican</span>
            <span className={styles.partyShort}>R</span> <b>{tracker.rep}</b>
          </span>
        ) : (
          <span />
        )}
      </div>
      <div
        ref={trackRef}
        className={styles.balanceTrack}
        role="group"
        aria-label={`${plural(
          total,
          unit[0],
          unit[1]
        )} by how sure our markets are. Select a group to list its places.`}
        data-filtered={selection.length > 0}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') previewKey(undefined)
        }}
      >
        <div className={styles.balanceBand} aria-hidden>
          {segments.map((segment, i) => {
            const color = segmentColor(segment, party)
            const w = boxes[i]?.w ?? 0
            return (
              <span
                key={segment.key}
                className={clsx(
                  styles.balanceSegment,
                  (segment.tone === 'notUpD' || segment.tone === 'notUpR') &&
                    styles.heldSeats
                )}
                data-selected={selected(segment.key)}
                data-preview={segment.key === preview}
                style={{
                  ...place(i),
                  backgroundColor: color,
                  color: labelInk(color),
                }}
              >
                {w > (segment.count >= 100 ? 28 : 22) && segment.count}
              </span>
            )
          })}
        </div>
        {segments.map((segment, i) =>
          selected(segment.key) || segment.key === preview ? (
            <span
              key={segment.key}
              className={clsx(
                styles.balanceCaret,
                !selected(segment.key) && styles.previewCaret
              )}
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
        {segments.map((segment, i) => {
          const tip = `${segment.label} · ${plural(
            segment.count,
            unit[0],
            unit[1]
          )}`
          const box = boxes[i]
          const target =
            box && targets[i]
              ? { ...targets[i], zIndex: box.w < MIN_TARGET_PX ? 2 : 1 }
              : place(i)
          const center = box ? box.x + box.w / 2 : undefined
          const align =
            center === undefined || !width
              ? 'middle'
              : center < width * 0.25
              ? 'start'
              : center > width * 0.75
              ? 'end'
              : 'middle'
          const listed = segment.places.length > 0
          return (
            <button
              key={segment.key}
              className={styles.balanceTarget}
              aria-label={tip}
              aria-pressed={listed ? selected(segment.key) : undefined}
              data-align={align}
              style={target}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse')
                  previewKey(listed ? segment.key : undefined)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && selection.length) {
                  e.preventDefault()
                  onSelect([])
                }
              }}
              onClick={() => {
                if (!listed) return
                onSelect(
                  selected(segment.key)
                    ? selection.filter((k) => k !== segment.key)
                    : [...selection, segment.key]
                )
              }}
            >
              <span className={styles.balanceTip} aria-hidden>
                {tip}
                {listed && (
                  <span className={styles.balanceTipAction}>
                    {selected(segment.key)
                      ? 'Click to remove'
                      : selection.length
                      ? 'Click to add'
                      : 'Click to list'}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
