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

  // One row at every width, and no hint text that appears and pushes the
  // page down: the explanations are tooltips.
  return (
    <Row className={clsx('items-center gap-2 sm:gap-4', props.className)}>
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
        className="shrink-0"
        toggleClassName="!px-2.5 sm:!px-3 !py-1 text-xs"
      />
      <Select
        aria-label="Compare with"
        title={
          canCompare
            ? 'Compare with an earlier period. Last year means 52 weeks back, so weekdays line up.'
            : 'Pick a range other than All to compare'
        }
        value={canCompare ? compare : 'none'}
        disabled={!canCompare}
        onChange={(e) => {
          if (isStatsCompareKey(e.target.value)) setCompare(e.target.value)
        }}
        className="!h-8 min-w-0 flex-1 !pl-3 !pr-8 !text-xs disabled:opacity-50 sm:flex-none sm:!text-sm"
      >
        {STATS_COMPARES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
    </Row>
  )
}
