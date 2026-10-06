import {
  balanceSegments,
  ElectionMode,
  seatSummary,
  Tier,
} from './election-map-model'
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
        <span data-tone="dem">
          <b>{summary.leaders.dem}</b>{' '}
          <span className={styles.partyFull}>Democratic</span>
          <span className={styles.partyShort}>D</span>
        </span>
        <span className={styles.threshold}>
          {mode === 'house'
            ? '218 for a majority · 435 seats'
            : mode === 'senate'
            ? 'D needs 51 · R needs 50 (VP breaks ties)'
            : `of ${summary.total} governorships up in 2026`}
        </span>
        <span data-tone="rep">
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
          const title = `${segment.count} · ${segment.label}`
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
