import { MapIcon, ViewGridIcon } from '@heroicons/react/outline'
import styles from './election-explorer.module.css'

export type MapView = 'map' | 'cartogram'

// Both options are always visible; the active one is highlighted. The
// geographic map stays the default.
export function MapViewToggle(props: {
  view: MapView
  measures: boolean
  house: boolean
  onChange: (view: MapView) => void
}) {
  const { view, measures, house, onChange } = props
  const cartogramName = measures ? 'Tiles' : 'Cartogram'
  const cartogramHint = house
    ? 'Every House district at equal size'
    : 'Every state at equal size'
  return (
    <div className={styles.viewToggle} role="group" aria-label="Map style">
      <button
        aria-pressed={view === 'map'}
        title="Geographic map"
        onClick={() => onChange('map')}
      >
        <MapIcon aria-hidden />
        <span>Map</span>
      </button>
      <button
        aria-pressed={view === 'cartogram'}
        aria-label={`${cartogramName}: ${cartogramHint.toLowerCase()}`}
        title={cartogramHint}
        onClick={() => onChange('cartogram')}
      >
        <ViewGridIcon aria-hidden />
        <span>{cartogramName}</span>
      </button>
    </div>
  )
}
