import clsx from 'clsx'
import { sortBy } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import { formatOdds, labelInk } from 'web/components/usa-map/election-display'
import { partyProbsToColor } from 'web/components/usa-map/state-election-map'
import {
  AnswerOdds,
  ControlOdds,
  controlOdds,
  isBalanceOfPower,
  MARKET_LABELS,
} from 'web/lib/politics/election-glance'
import { LiveContracts } from './live-contracts'
import { OddsRows, oddsItems } from './odds-rows'
import { useQuickBet } from './quick-bet'

// The cycles after 2028 as one grid: a column per election, a row per
// office, each cell the party our markets favour to hold it after that
// election and how likely, in the map's blue–red scale. Read from each
// cycle's balance-of-power market (the sum of its combinations that give
// the office to each party). The cycles' other markets (nominees, the
// winner) follow as one line each.

const OFFICES: { key: keyof ControlOdds; label: string }[] = [
  { key: 'president', label: 'White House' },
  { key: 'senate', label: 'Senate' },
  { key: 'house', label: 'House' },
]

const answersOf = (c: Contract): AnswerOdds[] =>
  isMultiCpmm(c)
    ? c.answers.map((a) => ({
        id: a.id,
        text: a.text,
        p: getAnswerProbability(c, a.id),
      }))
    : []

const cycleOf = (c: Contract, key: string | undefined) =>
  Number(
    key?.match(/^(20\d\d)-/)?.[1] ??
      c.question.match(/after the (20\d\d)/i)?.[1] ??
      NaN
  )

export function FutureCycles(props: {
  contracts: Contract[]
  marketKeys: Record<string, string>
}) {
  return (
    <LiveContracts contracts={props.contracts}>
      {(contracts) => (
        <Cycles contracts={contracts} marketKeys={props.marketKeys} />
      )}
    </LiveContracts>
  )
}

// In a midterm year the White House isn't on the ballot: its cell is the
// party the last presidential winner's term leaves holding it.
const offBallot = (office: keyof ControlOdds, cycle: number) =>
  office === 'president' && cycle % 4 !== 0

function Cycles(props: {
  contracts: Contract[]
  marketKeys: Record<string, string>
}) {
  const { contracts, marketKeys } = props
  const cycles = sortBy(
    contracts.flatMap((c) => {
      const odds = isBalanceOfPower(answersOf(c))
        ? controlOdds(answersOf(c))
        : undefined
      const cycle = cycleOf(c, marketKeys[c.id])
      return odds && Number.isFinite(cycle) ? [{ c, odds, cycle }] : []
    }),
    (x) => x.cycle
  )
  const gridIds = new Set(cycles.map((x) => x.c.id))
  const rest = contracts.filter((c) => !gridIds.has(c.id))
  const { open, dialog } = useQuickBet('election later')

  return (
    <div className="flex flex-col gap-4">
      {cycles.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] table-fixed border-separate border-spacing-1 text-sm">
            <caption className="sr-only">
              Each party&apos;s chance of holding each office after each
              election
            </caption>
            <thead>
              <tr>
                <th className="w-20 sm:w-24" />
                {cycles.map(({ c, cycle }) => (
                  <th key={c.id} scope="col" className="text-left font-normal">
                    <span className="flex flex-col">
                      <span className="text-ink-1000 font-semibold">
                        {cycle}
                      </span>
                      <span className="text-ink-500 text-xs">
                        {cycle % 4 === 0 ? 'Presidential' : 'Midterms'}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OFFICES.map((office) => (
                <tr key={office.key}>
                  <th
                    scope="row"
                    className="text-ink-700 pr-2 text-left text-xs font-medium sm:text-sm"
                  >
                    {office.label}
                  </th>
                  {cycles.map(({ c, odds, cycle }) => {
                    const dem = odds[office.key]
                    const fill = partyProbsToColor(dem, 1 - dem)
                    const demLeads = dem >= 0.5
                    return (
                      <td key={c.id} className="p-0">
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          onClick={() => open({ contract: c })}
                          className={clsx(
                            'flex h-10 w-full items-center justify-center rounded-md text-xs font-semibold tabular-nums hover:brightness-95 sm:text-sm',
                            offBallot(office.key, cycle) && 'opacity-60'
                          )}
                          style={{
                            backgroundColor: fill,
                            color: labelInk(fill),
                          }}
                          aria-label={`${office.label} after ${cycle}${
                            offBallot(office.key, cycle)
                              ? ' (not on the ballot)'
                              : ''
                          }: ${
                            demLeads ? 'Democrats' : 'Republicans'
                          } ${formatOdds(demLeads ? dem : 1 - dem)}`}
                        >
                          {demLeads ? 'D' : 'R'}{' '}
                          {formatOdds(demLeads ? dem : 1 - dem)}
                          {offBallot(office.key, cycle) && (
                            <span aria-hidden>*</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {cycles.some(({ cycle }) => cycle % 4 !== 0) && (
            <p className="text-ink-500 mt-1 text-xs">
              * Not on the ballot in a midterm year: the party holding the White
              House then. Click a cell to bet on who controls Washington after
              that election.
            </p>
          )}
        </div>
      )}
      {rest.length > 0 && (
        <OddsRows
          items={oddsItems(rest, (c) => MARKET_LABELS[marketKeys[c.id] ?? ''])}
          trackingName="election later"
        />
      )}
      {dialog}
    </div>
  )
}
