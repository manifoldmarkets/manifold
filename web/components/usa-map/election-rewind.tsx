import { useEffect, useState } from 'react'
import { chunk } from 'lodash'
import { ClockIcon, PauseIcon, PlayIcon } from '@heroicons/react/outline'
import { MarketProbsHistory } from 'common/market-probs-history'
import { MINUTE_MS } from 'common/util/time'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import {
  formatRewindTime,
  frameAt,
  mergeHistories,
  playbackInterval,
  REWIND_STEP_MS,
  rewindPresets,
  rewindStart,
} from './election-rewind-model'
import styles from './election-explorer.module.css'

const currentStep = () => Math.floor(Date.now() / REWIND_STEP_MS)

// The map's past odds while the rewind is open, refetched when a new frame is
// due; the previous history stays up meanwhile, and through a failed refetch.
// market-probs-history takes 100 markets per request.
export function useRewindHistory(ids: string[], open: boolean) {
  const [history, setHistory] = useState<MarketProbsHistory>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState(currentStep)
  const key = ids.join(',')
  useEffect(() => {
    if (!open) {
      setHistory(undefined)
      setError(false)
      return
    }
    const timer = setInterval(() => setStep(currentStep()), MINUTE_MS)
    return () => clearInterval(timer)
  }, [open])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const start = rewindStart(Date.now())
    Promise.all(
      chunk(ids, 100).map((batch) =>
        api('market-probs-history', {
          ids: batch,
          start,
          step: REWIND_STEP_MS,
        })
      )
    )
      .then((parts) => {
        if (cancelled) return
        setHistory(mergeHistories(parts))
        setError(false)
      })
      .catch((e) => {
        console.error('Election map history unavailable', e)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, key, attempt, step])
  return { history, error, retry: () => setAttempt((a) => a + 1) }
}

export function RewindButton(props: { open: boolean; onToggle: () => void }) {
  const { open, onToggle } = props
  return (
    <button
      className={styles.rewindToggle}
      aria-label="Rewind the map"
      title="Rewind: the odds at earlier times"
      aria-pressed={open}
      onClick={onToggle}
    >
      <ClockIcon aria-hidden />
      <span>Rewind</span>
    </button>
  )
}

// Jumps, a play button and a scrubber over the history's frames. The
// selection is a frame time, so it survives a refetch that slides the window;
// undefined is live. Playback runs to the latest frame, then returns to live.
export function RewindBar(props: {
  history: MarketProbsHistory | undefined
  error: boolean
  onRetry: () => void
  asOf: number | undefined
  setAsOf: (time: number | undefined) => void
}) {
  const { history, error, onRetry, asOf, setAsOf } = props
  const [playing, setPlaying] = useState(false)
  const times = history?.times ?? []
  const last = times.length - 1
  const frame = asOf === undefined ? undefined : frameAt(times, asOf)
  const setFrame = (to: number | undefined) =>
    setAsOf(to === undefined ? undefined : times[to])

  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => {
      if (frame === undefined || frame >= last) {
        setPlaying(false)
        setFrame(undefined)
      } else setFrame(frame + 1)
    }, playbackInterval(times.length))
    return () => clearTimeout(timer)
  }, [playing, frame, last])

  const jump = (to: number | undefined) => {
    setPlaying(false)
    setFrame(to)
  }

  if (!history)
    return (
      <div className={styles.rewind}>
        {error ? (
          <p className={styles.rewindStatus}>
            Couldn’t load past odds.{' '}
            <button className={styles.chartLink} onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : (
          <p className={styles.rewindStatus}>Loading past odds…</p>
        )}
      </div>
    )
  if (last < 1)
    return (
      <div className={styles.rewind}>
        <p className={styles.rewindStatus}>No past odds yet.</p>
      </div>
    )

  const shownTime = frame === undefined ? undefined : times[frame]
  return (
    <div className={styles.rewind}>
      <div className={styles.rewindControls}>
        <div
          className={styles.rewindJumps}
          role="group"
          aria-label="Jump to a time"
        >
          {rewindPresets(times).map((p) => (
            <button
              key={p.label}
              title={p.title}
              aria-pressed={frame === p.frame}
              onClick={() => {
                track('election map rewind', { action: 'jump', to: p.label })
                jump(p.frame)
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            aria-pressed={frame === undefined}
            onClick={() => jump(undefined)}
          >
            Live
          </button>
        </div>
        <button
          className={styles.rewindPlay}
          aria-label={playing ? 'Pause the timelapse' : 'Play the timelapse'}
          onClick={() => {
            if (playing) return setPlaying(false)
            track('election map rewind', { action: 'play' })
            if (frame === undefined || frame >= last) setFrame(0)
            setPlaying(true)
          }}
        >
          {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>
      </div>
      <input
        type="range"
        className={styles.rewindSlider}
        min={0}
        max={last}
        step={1}
        value={frame ?? last}
        aria-label="Time"
        aria-valuetext={
          shownTime === undefined ? 'Live' : formatRewindTime(shownTime)
        }
        onChange={(e) => jump(Number(e.target.value))}
      />
      <div className={styles.rewindScale} aria-hidden>
        <span>{formatRewindTime(times[0])}</span>
        <span>Now</span>
      </div>
      {/* Quiet while playing, so screen readers aren't read every frame. */}
      <p className={styles.rewindStatus} aria-live={playing ? 'off' : 'polite'}>
        {shownTime === undefined ? (
          'Live odds. Pick a time or press play to watch them change.'
        ) : (
          <>
            Odds as of <strong>{formatRewindTime(shownTime)}</strong>. Betting
            is off while the map is rewound.
          </>
        )}
      </p>
    </div>
  )
}
