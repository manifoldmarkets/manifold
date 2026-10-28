import clsx from 'clsx'
import { max, min } from 'lodash'

// A small trend line for a stat tile. Draws in currentColor. With slots, the
// line spans that many positions and fewer values sit at the right end, so a
// short history isn't stretched to look like a full one.
export function Sparkline(props: {
  values: number[]
  slots?: number
  className?: string
}) {
  const { className } = props
  const values = props.values.filter((v) => Number.isFinite(v))
  if (values.length < 2) return <div className={className} />

  const slots = Math.max(props.slots ?? 0, values.length)
  const offset = slots - values.length
  const lo = min(values)!
  const hi = max(values)!
  const span = hi - lo || 1
  const points = values
    .map((v, i) => {
      const x = ((i + offset) / (slots - 1)) * 100
      const y = 22 - ((v - lo) / span) * 20
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={clsx('overflow-visible', className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
