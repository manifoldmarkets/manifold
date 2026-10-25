import { useEffect, useState } from 'react'
import { InformationCircleIcon } from '@heroicons/react/outline'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { scoreAgeLabel } from 'common/sports-score-freshness'

/** Portalled disclosure works with touch and keyboard and escapes card clipping. */
export function ScoreFreshness({
  updatedTime,
}: {
  updatedTime?: number | null
}) {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  const label =
    now === undefined ? 'Scores are delayed' : scoreAgeLabel(updatedTime, now)
  const validTime =
    updatedTime != null &&
    Number.isFinite(updatedTime) &&
    updatedTime > 0 &&
    now !== undefined &&
    updatedTime <= now + 60_000
  return (
    <Popover className="text-ink-500 relative text-[11px] font-normal">
      <PopoverButton
        onClick={(e) => e.stopPropagation()}
        className="hover:text-ink-800 flex items-center gap-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span>{label}</span>
        <InformationCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </PopoverButton>
      <PopoverPanel
        portal
        anchor={{ to: 'bottom start', gap: 8, padding: 8 }}
        className="bg-canvas-0 border-ink-200 text-ink-700 z-[70] w-56 rounded-lg border p-3 text-xs shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        Scores are delayed snapshots, not a real-time feed. The game may have
        moved on.
        {validTime && (
          <p className="mt-2">
            Provider update:{' '}
            <time dateTime={new Date(updatedTime).toISOString()}>
              {new Date(updatedTime).toLocaleString(undefined, {
                timeZoneName: 'short',
              })}
            </time>
            .
          </p>
        )}
      </PopoverPanel>
    </Popover>
  )
}
