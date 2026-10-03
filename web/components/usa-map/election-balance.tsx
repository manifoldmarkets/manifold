import {
  balanceSegments,
  ElectionMode,
  seatSummary,
  Tier,
} from './election-map-model'
import { DEM_COLOR, REP_COLOR } from './state-election-map'
import styles from './election-explorer.module.css'

export function ElectionBalance({
  summary,
  mode,
  filter,
  onFilter,
}: {
  summary: ReturnType<typeof seatSummary>
  mode: ElectionMode
  filter?: Tier
  onFilter: (tier: Tier) => void
}) {
  return (
    <div className={styles.balance}>
      <div className={styles.balanceLabels}>
        <span style={{ color: DEM_COLOR }}>
          <b>{summary.leaders.dem}</b>{' '}
          <span className={styles.partyFull}>Democratic</span>
          <span className={styles.partyShort}>D</span>
        </span>
        <span className={styles.threshold}>
          {mode === 'house'
            ? '218 for a majority · 435 seats'
            : mode === 'senate'
            ? '51 D / 50 R · hatched seats not up'
            : `${summary.total} governorships up`}
        </span>
        <span style={{ color: REP_COLOR }}>
          <span className={styles.partyFull}>Republican</span>
          <span className={styles.partyShort}>R</span>{' '}
          <b>{summary.leaders.rep}</b>
        </span>
      </div>
      <div
        className={styles.balanceTrack}
        data-majority={mode !== 'governor'}
        aria-label="Seats by market likelihood"
      >
        {balanceSegments(summary).map((segment) => {
          const title = `${segment.count} ${segment.label}`
          const style = {
            width: `${(segment.count / summary.total) * 100}%`,
            backgroundColor: segment.color,
          }
          return segment.tier ? (
            <button
              key={segment.id}
              title={title}
              aria-label={`Filter ${title}`}
              aria-pressed={filter === segment.tier}
              className={
                segment.tier === 'fixed-d' || segment.tier === 'fixed-r'
                  ? styles.heldSeats
                  : undefined
              }
              style={style}
              onClick={() => onFilter(segment.tier!)}
            >
              {segment.count / summary.total > 0.055 && segment.count}
            </button>
          ) : (
            <span
              key={segment.id}
              className={styles.heldSeats}
              title={title}
              aria-label={title}
              style={style}
            >
              {segment.count} held
            </span>
          )
        })}
        {mode !== 'governor' && (
          <span
            className={styles.majorityLine}
            style={{ left: `${(mode === 'house' ? 218 / 435 : 0.5) * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}
