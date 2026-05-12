import clsx from 'clsx'
import { useEffect, useState } from 'react'

function formatRemaining(ms: number) {
  if (ms <= 0) return '0h'
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 1) return `${hours}h ${minutes}m`
  return `${minutes}m`
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
    // Reset `now` immediately on prop changes so an offer that becomes
    // active or expires (e.g. after a redemption refresh) is reflected
    // without waiting a full tick. 10s tick handles the typical case
    // without burning CPU at 1Hz.
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [activeCount, nextExpiresAt])

  const totalOffers = pendingCount + activeCount
  if (totalOffers === 0) return null

  // Pending (not yet activated) — pulsing, eye-catching badge
  if (activeCount === 0 && pendingCount > 0) {
    return (
      <span
        className={clsx(
          'pointer-events-none absolute -right-2 -top-2 -rotate-12 select-none',
          'rounded-full border border-amber-300 bg-gradient-to-r from-amber-400 to-yellow-400',
          'px-2 py-0.5 text-[10px] font-bold text-white shadow-md',
          'animate-pulse'
        )}
      >
        +{pendingCount} offer{pendingCount === 1 ? '' : 's'}
      </span>
    )
  }

  // Active — subtle countdown badge. Hide once the visible timer hits zero
  // so we don't show an "expired" badge with a working button (the offer
  // card hides itself for the same reason).
  const remaining = nextExpiresAt != null ? nextExpiresAt - now : 0
  if (remaining <= 0) return null
  return (
    <span
      className={clsx(
        'pointer-events-none absolute -right-2 -top-2 select-none',
        'rounded-full border border-indigo-300/60 bg-indigo-600/90',
        'px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm'
      )}
      title={`${activeCount} mana sale offer${activeCount === 1 ? '' : 's'} available`}
    >
      {activeCount > 1 ? `${activeCount}× ` : ''}
      {formatRemaining(remaining)}
    </span>
  )
}
