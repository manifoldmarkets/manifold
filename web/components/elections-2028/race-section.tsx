import clsx from 'clsx'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { contractPath, MultiContract } from 'common/contract'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { formatOdds } from 'web/components/usa-map/election-display'
import { useLiveContractWithStatus } from 'web/hooks/use-contract'
import type { RaceChart as RaceChartData } from 'web/lib/politics/elections-2028'
import { CHART_SERIES } from 'web/lib/politics/elections-2028-config'
import { track } from 'web/lib/service/analytics'
import { AnswerBetModal } from './answer-bet-modal'
import { PhotoCredits } from './candidate-avatar'
import { RaceChart } from './race-chart'
import styles from './race-chart.module.css'
import { RaceLeaderboard } from './race-leaderboard'
import { buildChartSeries, ChartSeries } from './race-series'

const DAY = 24 * 60 * 60 * 1000

export const RANGES = {
  '1M': 30 * DAY,
  '3M': 91 * DAY,
  '6M': 182 * DAY,
  '1Y': 365 * DAY,
  All: Infinity,
} as const
export type RangeKey = keyof typeof RANGES

export function RangePicker(props: {
  value: RangeKey
  onChange: (value: RangeKey) => void
}) {
  return (
    <ChoicesToggleGroup
      currentChoice={props.value}
      choicesMap={Object.fromEntries(Object.keys(RANGES).map((k) => [k, k]))}
      setChoice={(v) => {
        track('election 2028 chart range', { range: v })
        props.onChange(v as RangeKey)
      }}
      color="gray"
      ariaLabel="Time range for the charts"
      toggleClassName="!px-2.5 !py-1 text-xs"
    />
  )
}

export function useRange() {
  return usePersistentInMemoryState<RangeKey>('1Y', 'election-2028-range')
}

const startOf = (range: RangeKey, contract: MultiContract, now: number) =>
  Math.max(contract.createdTime, now - RANGES[range])

function paletteClass(colorBy: RaceChartData['colorBy']) {
  return colorBy === 'dem'
    ? styles.dem
    : colorBy === 'gop'
    ? styles.gop
    : undefined
}

function describe(title: string, series: ChartSeries[]) {
  return `${title}: ${series
    .slice(0, 4)
    .map((s) => `${s.candidate.name} ${formatOdds(s.prob)}`)
    .join(', ')}`
}

// One race: chart and leaderboard sharing a highlight, and in-place betting.
export function RaceCard(props: {
  chart: RaceChartData
  now: number
  range: RangeKey
  variant: 'hero' | 'compact'
  className?: string
}) {
  const { chart, now, range, variant, className } = props
  // The page ships only the listed answers; the full market arrives on
  // mount, and the bet modal waits for it so a bet is priced on every answer.
  const { contract: live, hasLoaded } = useLiveContractWithStatus(
    chart.contract
  )
  const contract = live as MultiContract
  const series = useMemo(
    () => buildChartSeries(chart, contract, now),
    [chart, contract, now]
  )
  const charted = series
    .slice(0, CHART_SERIES)
    .filter((s) => s.points.length > 0)
  const chartedIds = useMemo(() => new Set(charted.map((s) => s.id)), [charted])
  const [highlightId, setHighlightId] = useState<string | undefined>()
  const [betId, setBetId] = useState<string | undefined>()
  const betAnswer = hasLoaded
    ? contract.answers.find((a) => a.id === betId)
    : undefined
  const start = startOf(range, contract, now)
  const hero = variant === 'hero'

  // Bets open once the full market has loaded (the page ships only the
  // listed answers); until then the Bet buttons are disabled.
  const openBet = (id: string) => {
    if (!hasLoaded) return
    track('bet intent', { location: `election 2028 ${chart.key} chart` })
    setBetId(id)
  }

  return (
    <div
      className={clsx(
        'bg-canvas-0 border-ink-200 rounded-xl border p-3 sm:p-4',
        paletteClass(chart.colorBy),
        className
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-ink-900 text-base font-semibold sm:text-lg">
          {chart.title}
        </h3>
        <Link
          href={`${contractPath(contract)}?graph=true`}
          className="text-ink-500 hover:text-primary-700 shrink-0 text-xs hover:underline"
        >
          Market →
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        <RaceChart
          series={charted}
          start={start}
          end={now}
          height={hero ? 340 : 250}
          ariaLabel={describe(chart.title, series)}
          highlightId={highlightId}
          onHighlight={setHighlightId}
          onSelect={openBet}
          animationKey={`${chart.key}-${range}`}
        />
        <RaceLeaderboard
          contract={contract}
          series={series}
          chartedIds={chartedIds}
          highlightId={highlightId}
          onHighlight={setHighlightId}
          onBet={openBet}
          maxRows={hero ? 8 : 5}
          columns={hero ? 2 : 1}
          answerCount={hasLoaded ? contract.answers.length : chart.answerCount}
          betDisabled={!hasLoaded}
        />
      </div>
      <PhotoCredits
        candidates={series.slice(0, hero ? 8 : 5).map((s) => s.candidate)}
        className="mt-2"
      />
      <AnswerBetModal
        contract={contract}
        answer={betAnswer}
        onClose={() => setBetId(undefined)}
      />
    </div>
  )
}
