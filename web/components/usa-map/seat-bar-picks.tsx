import { Tier } from './election-map-model'
import {
  activePreset,
  PRESETS,
  presetTiers,
  TierSelection,
} from './seat-bar-selection'
import styles from './election-explorer.module.css'

// One-tap selections of common seat-bar groups. Each replaces the selection
// (and shows on the bar); pressing the active one again clears it.
export function SeatBarPicks(props: {
  // The groups on the current bar, left to right.
  order: Tier[]
  selection: TierSelection
  onSelect: (next: Tier[]) => void
  // Until the first selection, say that segments combine.
  hint: boolean
}) {
  const { order, selection, onSelect, hint } = props
  const presets = PRESETS.filter((p) => presetTiers(p, order).length > 0)
  if (!presets.length) return null
  const active = activePreset(selection, order)
  return (
    <div className={styles.picks} role="group" aria-label="Quick selections">
      {presets.map((p) => (
        <button
          key={p.id}
          aria-pressed={active?.id === p.id}
          aria-label={`${p.label}: ${p.description}`}
          title={p.description}
          onClick={() =>
            onSelect(active?.id === p.id ? [] : presetTiers(p, order))
          }
        >
          {p.label}
        </button>
      ))}
      {hint && (
        <span className={styles.picksHint}>
          or select several segments of the bar
        </span>
      )}
    </div>
  )
}
