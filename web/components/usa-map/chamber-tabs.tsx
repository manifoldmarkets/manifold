import clsx from 'clsx'
import { ClipboardCheckIcon, LibraryIcon } from '@heroicons/react/outline'
import { Congress } from 'web/public/custom-components/congress'
import { Governor } from 'web/public/custom-components/governor'
import { EXPLORER_MODES, ExplorerMode } from './explorer-url'
import styles from './election-explorer.module.css'

export const modeName = (mode: ExplorerMode) =>
  mode === 'measures'
    ? 'Ballot measures'
    : mode[0].toUpperCase() + mode.slice(1)
const tabName = (mode: ExplorerMode) =>
  mode === 'measures' ? 'Measures' : modeName(mode)

// Each office has its own icon inside its own tab: House (the chamber's
// columns), Senate (the Capitol), Governor (a statehouse), Measures.
export function ChamberTabs(props: {
  mode: ExplorerMode
  onChange: (mode: ExplorerMode) => void
}) {
  const { mode, onChange } = props
  return (
    <>
      <label className={styles.mobileMode}>
        <ChamberIcon mode={mode} />
        <select
          aria-label="Election type"
          value={mode}
          onChange={(e) => onChange(e.target.value as ExplorerMode)}
        >
          {EXPLORER_MODES.map((m) => (
            <option key={m} value={m}>
              {tabName(m)}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.tabs} role="tablist" aria-label="Election type">
        {EXPLORER_MODES.map((m, index) => (
          <button
            key={m}
            role="tab"
            aria-label={modeName(m)}
            title={modeName(m)}
            aria-selected={mode === m}
            tabIndex={mode === m ? 0 : -1}
            onClick={() => onChange(m)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const next =
                (index +
                  (e.key === 'ArrowRight' ? 1 : EXPLORER_MODES.length - 1)) %
                EXPLORER_MODES.length
              onChange(EXPLORER_MODES[next])
              e.currentTarget
                .closest('[role="tablist"]')
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus()
            }}
          >
            <ChamberIcon mode={m} />
            <span>{tabName(m)}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export function ChamberIcon({ mode }: { mode: ExplorerMode }) {
  return (
    <span
      className={clsx(styles.tabIcon, mode === 'house' && styles.outlineIcon)}
      aria-hidden
    >
      {mode === 'house' ? (
        <LibraryIcon />
      ) : mode === 'senate' ? (
        <Congress height={6} />
      ) : mode === 'measures' ? (
        <ClipboardCheckIcon />
      ) : (
        <Governor height={6} />
      )}
    </span>
  )
}
