/** Console table + number formatting. No math that matters lives here. */

export const fmtNum = (v: number, dp = 2): string => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : Number.isNaN(v) ? 'n/a' : '-∞'
  return v.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

/** Compact mana: 1.23k / 45.6k / 1.23M. */
export const fmtMana = (v: number): string => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : Number.isNaN(v) ? 'n/a' : '-∞'
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return v.toFixed(abs < 10 ? 2 : 1)
}

/** A per-period rate in basis points, signed. */
export const fmtBps = (rate: number, dp = 4): string =>
  `${(rate * 10_000).toFixed(dp)}`

export const fmtPct = (v: number, dp = 3): string =>
  Number.isFinite(v) ? `${(v * 100).toFixed(dp)}%` : 'n/a'

export const fmtRatio = (r: number): string =>
  Number.isFinite(r) ? `${r.toFixed(3)}x` : '∞'

export const fmtSign = (rate: number): string =>
  rate > 0 ? 'L→S' : rate < 0 ? 'S→L' : '—'

export type Column = {
  header: string
  /** Right-align numeric columns (the default). */
  align?: 'left' | 'right'
}

export const table = (columns: Column[], rows: string[][]): string => {
  const widths = columns.map((c, i) =>
    Math.max(c.header.length, ...rows.map((r) => (r[i] ?? '').length))
  )
  const pad = (s: string, w: number, align: 'left' | 'right') =>
    align === 'left' ? s.padEnd(w) : s.padStart(w)

  const head = columns
    .map((c, i) => pad(c.header, widths[i], c.align ?? 'right'))
    .join('  ')
  const sep = widths.map((w) => '─'.repeat(w)).join('──')
  const body = rows
    .map((r) =>
      r
        .map((cell, i) =>
          pad(cell ?? '', widths[i], columns[i].align ?? 'right')
        )
        .join('  ')
    )
    .join('\n')
  return `${head}\n${sep}\n${body}`
}

export const heading = (text: string): string => {
  const bar = '═'.repeat(Math.max(text.length, 8))
  return `\n${bar}\n${text}\n${bar}`
}

export const subheading = (text: string): string =>
  `\n${text}\n${'─'.repeat(text.length)}`

/**
 * Single-row sparkline over a series, scaled to its own min/max.
 * Used only where the shape matters more than the values (capacity drift).
 */
export const sparkline = (values: number[], maxWidth = 60): string => {
  const chars = '▁▂▃▄▅▆▇█'
  if (values.length > maxWidth) {
    const stride = values.length / maxWidth
    values = Array.from(
      { length: maxWidth },
      (_, i) => values[Math.min(values.length - 1, Math.floor(i * stride))]
    )
  }
  const finite = values.filter((v) => Number.isFinite(v))
  if (!finite.length) return ''
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const span = max - min
  return values
    .map((v) => {
      if (!Number.isFinite(v)) return '?'
      const idx = span === 0 ? 0 : Math.round(((v - min) / span) * 7)
      return chars[Math.max(0, Math.min(7, idx))]
    })
    .join('')
}
