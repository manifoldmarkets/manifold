import clsx from 'clsx'
import { max, min } from 'lodash'

// A small trend line for a stat tile. Draws in currentColor. With slots, the
// line spans that many positions and fewer values sit at the right end, so a
// short history isn't stretched to look like a full one. With gaps, a
// non-finite value keeps its position and breaks the line there, rather than
// being dropped.
export function Sparkline(props: {
  values: number[]
  slots?: number
  gaps?: boolean
  className?: string
}) {
  const { className, gaps } = props
  const values = gaps
    ? props.values
    : props.values.filter((v) => Number.isFinite(v))
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length < 2) return <div className={className} />

  const slots = Math.max(props.slots ?? 0, values.length)
  const offset = slots - values.length
  const lo = min(finite)!
  const hi = max(finite)!
  const span = hi - lo || 1
  const runs: string[][] = []
  let run: string[] | undefined
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      run = undefined
      return
    }
    if (!run) runs.push((run = []))
    const x = ((i + offset) / (slots - 1)) * 100
    const y = 22 - ((v - lo) / span) * 20
    run.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  })

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={clsx('overflow-visible', className)}
      aria-hidden
    >
      {runs
        .filter((r) => r.length > 1)
        .map((r, i) => (
          <polyline
            key={i}
            points={r.join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  )
}
