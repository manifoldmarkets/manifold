import { ReactNode, useEffect, useId, useState } from 'react'
import styles from './election-explorer.module.css'

// Results shown while a search or seat-bar group narrows the map: six
// entries on desktop and three on phones until "Show all", and a "Hide list"
// toggle so the map stays in view while people click between groups.
const COLLAPSED = 6

export function FilterResults(props: {
  summary: ReactNode
  clearLabel: string
  onClear: () => void
  label: string
  items: ReactNode[]
  empty: ReactNode
  // The list collapses again whenever this changes (new group or search).
  resetKey: string
}) {
  const { summary, clearLabel, onClear, label, items, empty, resetKey } = props
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState(false)
  const listId = useId()
  useEffect(() => setExpanded(false), [resetKey])
  const visible = expanded ? items : items.slice(0, COLLAPSED)
  return (
    <>
      <div className={styles.filterNotice} role="status">
        <span>{summary}</span>
        <span className={styles.filterActions}>
          {items.length > 0 && (
            <button
              aria-expanded={!hidden}
              aria-controls={listId}
              onClick={() => setHidden(!hidden)}
            >
              {hidden ? 'Show list' : 'Hide list'}
            </button>
          )}
          <button onClick={onClear}>{clearLabel} ×</button>
        </span>
      </div>
      {!hidden && (
        <>
          <div
            id={listId}
            className={styles.results}
            role="region"
            aria-label={label}
            data-expanded={expanded}
          >
            {items.length ? visible : empty}
          </div>
          {items.length > 3 && (
            <button
              className={styles.resultsMore}
              data-desktop-fits={items.length <= COLLAPSED}
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </>
  )
}
