import clsx from 'clsx'
import { useEffect, useState } from 'react'

// Threshold below which we tick by seconds and show them in the label —
// gives a sense of urgency in the final stretch without spamming re-renders
// for an offer that's still hours away.
const FAST_TICK_MS = 5 * 60_000

function formatRemaining(ms: number) {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours >= 1) return `${hours}h ${minutes}m`
  if (ms >= FAST_TICK_MS) return `${minutes}m`
  if (minutes >= 1) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function AddFundsOfferBadge(props: {
  pendingCount: number
  activeCount: number
  nextExpiresAt: number | null
}) {
  const { pendingCount, activeCount, nextExpiresAt } = props
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (activeCount === 0 || !nextExpiresAt) return
    setNow(Date.now())
    // Self-scheduling tick: 1s when < 5 minutes remain, 10s otherwise. This
    // adjusts dynamically as the timer counts down, so the badge doesn't sit
    // at "0m" for ten seconds in the final stretch.
    let id: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
      const remaining = nextExpiresAt - Date.now()
      setNow(Date.now())
      if (remaining <= 0) return
      id = setTimeout(tick, remaining < FAST_TICK_MS ? 1000 : 10_000)
    }
    tick()
    return () => {
      if (id) clearTimeout(id)
    }
  }, [activeCount, nextExpiresAt])

  const totalOffers = pendingCount + activeCount
  if (totalOffers === 0) return null

  // Diagonal corner sticker: sits in the upper-right quadrant of the button,
  // tilted ~12° so it spans from the top-center toward the right-center
  // without crowding the centered "Get mana" text. Outer span handles the
  // absolute positioning + rotation; inner span holds the visual pill so the
  // shimmer's `position: relative` doesn't conflict with positioning.
  const positionClasses =
    'pointer-events-none absolute -top-2 right-1 rotate-6 origin-center select-none whitespace-nowrap'
  const pillClasses =
    'inline-block rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide text-white shadow-md'

  if (activeCount === 0 && pendingCount > 0) {
    return (
      <span className={positionClasses}>
        <span
          className={clsx(
            pillClasses,
            'border border-orange-300 bg-gradient-to-r from-orange-500 to-amber-500',
            'shimmer-badge'
          )}
        >
          {pendingCount > 1 ? `+${pendingCount} offers` : 'New offer'}
        </span>
      </span>
    )
  }

  const remaining = nextExpiresAt != null ? nextExpiresAt - now : 0
  if (remaining <= 0) return null
  return (
    <span
      className={positionClasses}
      title={`${activeCount} mana sale offer${
        activeCount === 1 ? '' : 's'
      } available`}
    >
      <span
        className={clsx(
          pillClasses,
          'border border-amber-400/70 bg-gradient-to-r from-orange-500 to-amber-500'
        )}
      >
        {activeCount > 1 ? `${activeCount}× ` : ''}
        OFFER: {formatRemaining(remaining)}
      </span>
    </span>
  )
}
