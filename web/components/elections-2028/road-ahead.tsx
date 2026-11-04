import clsx from 'clsx'

import { KEY_DATES } from 'web/lib/politics/elections-2028-config'

const DAY = 24 * 60 * 60 * 1000

// The fixed dates ahead as a timeline, with a countdown on each. `now` comes
// from the server render so the days agree on hydration.
export function RoadAhead(props: { now: number }) {
  const { now } = props
  const upcoming = KEY_DATES.filter((d) => d.time > now)
  const next = upcoming[0]
  return (
    <div className="bg-canvas-0 border-ink-200 rounded-xl border px-3 py-3 sm:px-4">
      <div className="flex snap-x gap-0 overflow-x-auto pb-1">
        {upcoming.map((d, i) => {
          const days = Math.ceil((d.time - now) / DAY)
          const isNext = d.key === next?.key
          return (
            <div
              key={d.key}
              className="relative flex min-w-[9.5rem] flex-1 snap-start flex-col pr-3"
            >
              <div className="mb-2 flex items-center">
                <span
                  className={clsx(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    isNext
                      ? 'bg-primary-600 ring-primary-200 ring-4'
                      : 'bg-ink-400'
                  )}
                />
                {i < upcoming.length - 1 && (
                  <span className="bg-ink-200 ml-1 h-px flex-1" />
                )}
              </div>
              <span className="text-ink-1000 text-sm font-semibold">
                {d.label}
              </span>
              <span className="text-ink-600 text-xs">
                {new Date(d.time).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}{' '}
                · {d.detail}
              </span>
              <span
                className={clsx(
                  'mt-1 text-xs font-semibold tabular-nums',
                  isNext ? 'text-primary-700' : 'text-ink-500'
                )}
              >
                {days.toLocaleString('en-US')} {days === 1 ? 'day' : 'days'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
