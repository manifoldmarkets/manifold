import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { SparklesIcon } from '@heroicons/react/solid'
import { Row } from 'web/components/layout/row'

const FAST_TICK_MS = 5 * 60_000

function formatRemaining(ms: number) {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours >= 1) return `${hours}h ${minutes}m left`
  if (ms >= FAST_TICK_MS) return `${minutes}m left`
  if (minutes >= 1) return `${minutes}m ${seconds}s left`
  return `${seconds}s left`
}

// Subtle "your offer is hidden" affordance that appears above the standard
// buy area when the user has dismissed an active offer. Clicking it
// un-dismisses (hook calls dismiss-personalized-mana-offer with
// dismissed=false) so the card replaces the buy area again.
export function HiddenOfferChip(props: {
  count: number
  expiresAt: number | null
  onClick: () => void
  disabled?: boolean
}) {
  const { count, expiresAt, onClick, disabled } = props
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAt) return
    setNow(Date.now())
    // Same self-scheduling cadence as the Get-mana badge: 1s in the final
    // 5 minutes, 10s otherwise.
    let id: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
      const remaining = expiresAt - Date.now()
      setNow(Date.now())
      if (remaining <= 0) return
      id = setTimeout(tick, remaining < FAST_TICK_MS ? 1000 : 10_000)
    }
    tick()
    return () => {
      if (id) clearTimeout(id)
    }
  }, [expiresAt])

  const remaining = expiresAt != null ? expiresAt - now : 0
  if (count <= 0) return null
  if (remaining <= 0) return null

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'group w-full rounded-lg border border-orange-300/70 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-2.5 text-left shadow-sm transition-all hover:from-orange-100 hover:to-amber-100 dark:border-orange-700/50 dark:from-orange-950/30 dark:to-amber-950/30 dark:hover:from-orange-950/50 dark:hover:to-amber-950/50',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <Row className="items-center justify-between gap-2">
        <Row className="items-center gap-2">
          <SparklesIcon className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-sm font-semibold text-orange-700 dark:text-amber-300">
            {count === 1 ? '1 offer hidden' : `${count} offers hidden`}
            <span className="text-ink-600 ml-1.5 font-normal tabular-nums">
              · {formatRemaining(remaining)}
            </span>
          </span>
        </Row>
        <span className="text-xs font-semibold uppercase tracking-wide text-orange-600 group-hover:underline dark:text-amber-400">
          Show
        </span>
      </Row>
    </button>
  )
}
