import clsx from 'clsx'
import { createContext, ReactNode, useContext } from 'react'

import {
  isStatsCompareKey,
  isStatsRangeKey,
  STATS_COMPARES,
  STATS_RANGES,
  StatsCompareKey,
  StatsRangeKey,
} from 'common/stats-window'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Select } from 'web/components/widgets/select'

type StatsTime = {
  range: StatsRangeKey
  compare: StatsCompareKey
  setRange: (range: StatsRangeKey) => void
  setCompare: (compare: StatsCompareKey) => void
}

const DEFAULT_TIME: StatsTime = {
  range: '90d',
  compare: 'none',
  setRange: () => {},
  setCompare: () => {},
}

const StatsTimeContext = createContext<StatsTime>(DEFAULT_TIME)

// The time range and comparison every chart on /stats uses. Kept in memory,
// so they stick while you switch tabs, sections and metrics (and navigate
// away and back), and reset on a fresh page load.
export function StatsTimeProvider(props: { children: ReactNode }) {
  const [range, setRange] = usePersistentInMemoryState<StatsRangeKey>(
    DEFAULT_TIME.range,
    'stats-time-range'
  )
  const [compare, setCompare] = usePersistentInMemoryState<StatsCompareKey>(
    DEFAULT_TIME.compare,
    'stats-time-compare'
  )
  return (
    <StatsTimeContext.Provider value={{ range, compare, setRange, setCompare }}>
      {props.children}
    </StatsTimeContext.Provider>
  )
}

export const useStatsTime = () => useContext(StatsTimeContext)

export function StatsTimeControls(props: { className?: string }) {
  const { range, compare, setRange, setCompare } = useStatsTime()
  const canCompare = range !== 'all'

  return (
    <Row
      className={clsx(
        'flex-wrap items-center gap-x-4 gap-y-2',
        props.className
      )}
    >
      <ChoicesToggleGroup
        ariaLabel="Time range"
        currentChoice={range}
        choicesMap={Object.fromEntries(
          STATS_RANGES.map((r) => [r.label, r.key])
        )}
        setChoice={(key) => {
          if (isStatsRangeKey(key)) setRange(key)
        }}
        color="gray"
        toggleClassName="!px-3 !py-1 text-xs"
      />
      <label className="text-ink-600 flex items-center gap-2 text-sm">
        Compare
        <Select
          aria-label="Compare with"
          value={canCompare ? compare : 'none'}
          disabled={!canCompare}
          onChange={(e) => {
            if (isStatsCompareKey(e.target.value)) setCompare(e.target.value)
          }}
          className="!h-9 !pl-3 !pr-8"
        >
          {STATS_COMPARES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
      </label>
      {!canCompare && compare !== 'none' && (
        <span className="text-ink-400 text-xs">
          Pick a range to compare against
        </span>
      )}
    </Row>
  )
}
