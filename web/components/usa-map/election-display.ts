// Display helpers shared by every number, label and swatch in the election
// explorer, so the map, the seat bar and the race panels never disagree.

// Whole percentages, with one decimal only where rounding would hide the
// tails: 0.4%, 7%, 50%, 93%, 99.4%. Probabilities are clamped to [0, 1].
export function formatOdds(p: number): string {
  if (!Number.isFinite(p)) return '—'
  if (p <= 0) return '0%'
  if (p >= 1) return '100%'
  const tenths = Math.round(p * 1000) / 10
  if (tenths < 0.1) return '<0.1%'
  if (tenths > 99.9) return '>99.9%'
  if (tenths < 1 || tenths > 99) return `${tenths.toFixed(1)}%`
  return `${Math.round(p * 100)}%`
}

// The whole-number percentage a reader sees, for tier thresholds (60/75/90),
// so "75%" is never "Lean" in one race and "Likely" in another.
export const shownPercent = (p: number) =>
  Number.isFinite(p) ? Math.round(p * 100) : NaN

// Two outcomes that read the same are a tie for display: "Even", never
// "R 50%" over a 50% Democratic row.
export const looksTied = (a: number, b: number) =>
  formatOdds(a) === formatOdds(b)

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`

const channel = (value: number) => {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

// WCAG relative luminance of a #rrggbb color; undefined for anything else.
export function luminance(hex: string): number | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return undefined
  const n = parseInt(match[1], 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

export const contrastRatio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

export const DARK_LABEL = '#1e293b'
export const LIGHT_LABEL = '#ffffff'

// Dark or white label text, whichever contrasts more with the fill. Light
// and mid-tone fills (Texas, Kansas, Alaska, Michigan) get dark text.
export function labelInk(fill: string): string | undefined {
  const background = luminance(fill)
  if (background === undefined) return undefined
  const dark = contrastRatio(background, luminance(DARK_LABEL)!)
  const light = contrastRatio(background, 1)
  return light > dark ? LIGHT_LABEL : DARK_LABEL
}
