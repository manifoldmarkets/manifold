import clsx from 'clsx'
import { ReactNode, useId, useState } from 'react'

import { BinaryContract, Contract } from 'common/contract'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { Col } from 'web/components/layout/col'
import { useLiveContract } from 'web/hooks/use-contract'
import {
  ConditionalMatrixColumn,
  ConditionalMatrixRow,
  gapPoints,
  isMatrixCollapsible,
  MatrixColumns,
  MatrixParty,
  matrixProb,
  visibleMatrixRows,
  wholePercent,
} from 'web/lib/politics/conditional-matrix'
import { track } from 'web/lib/service/analytics'

// A conditional-market matrix: each row is one question asked under each of
// two outcomes, with both chances side by side and a slim dumbbell showing the
// gap. Every chance opens the bet dialog for its own market. Rows come from
// buildConditionalMatrixRows (web/lib/politics/conditional-matrix.ts).
//
// Party colors are the map's: azure-600 and sienna-600 are DEM_COLOR and
// REP_COLOR (usa-map/state-election-map.ts). Small text uses the darker and
// lighter tints the page already uses for party labels, so it stays readable
// in both themes.

const PARTY_STYLE: Record<
  MatrixParty,
  { dot: string; from: string; to: string; percent: string; label: string }
> = {
  dem: {
    dot: 'bg-azure-600',
    from: 'from-azure-600',
    to: 'to-azure-600',
    percent: 'text-azure-600',
    label: 'text-azure-700 dark:text-azure-300',
  },
  rep: {
    dot: 'bg-sienna-600',
    from: 'from-sienna-600',
    to: 'to-sienna-600',
    percent: 'text-sienna-600',
    label: 'text-sienna-700 dark:text-sienna-300',
  },
}

// One grid template for the header and every row, so the columns line up.
// Phones and small tablets: the label spans both columns, then the two
// chances, then the gap. From md up: label, chance, chance, gap.
const ROW_GRID =
  'grid grid-cols-2 gap-x-2 md:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_minmax(10rem,16rem)] md:gap-x-4'

// Two chances this close (in displayed points) would hide one dot under the
// other, so the dumbbell draws one dot split between the two colors.
const SPLIT_DOT_MAX_GAP = 2

// The gap label's width, which the header axis leaves clear so its ticks sit
// over the dumbbell track.
const GAP_LABEL_WIDTH = 'w-14'

// A keyboard-only ring. The page scope (election-interactions.module.css) also
// draws a focus outline, which would double it, so this one suppresses it.
const FOCUS_RING =
  'focus-visible:ring-primary-500 focus-visible:!outline-none focus-visible:ring-2'

export function ConditionalMatrix(props: {
  columns: MatrixColumns
  rows: ConditionalMatrixRow[]
  // What the table is, for screen readers.
  caption: string
  // Analytics location, also keys the "Show all" state.
  trackingName: string
  footnote?: ReactNode
}) {
  const { columns, rows, caption, trackingName, footnote } = props
  const [showAll, setShowAll] = usePersistentInMemoryState(
    false,
    `election-matrix-show-all-${trackingName}`
  )
  const bodyId = useId()
  if (rows.length === 0) return null

  const shown = visibleMatrixRows(rows, showAll)
  const collapsible = isMatrixCollapsible(rows.length)

  return (
    <Col className="gap-2">
      <div
        role="table"
        aria-label={caption}
        className="bg-canvas-0 border-ink-200 overflow-hidden rounded-xl border"
      >
        <div role="rowgroup">
          <div
            role="row"
            className={clsx(
              ROW_GRID,
              'border-ink-200 items-end border-b px-3 py-2.5 md:px-4'
            )}
          >
            <div
              role="columnheader"
              className="text-ink-600 sr-only text-xs md:not-sr-only"
            >
              Chance of…
            </div>
            {columns.map((column) => (
              <ColumnHeader key={column.party} column={column} />
            ))}
            <div role="columnheader" className="sr-only md:not-sr-only">
              <span className="sr-only">Gap</span>
              <GapAxis />
            </div>
          </div>
        </div>
        <div role="rowgroup" id={bodyId}>
          {shown.map((row) => (
            <MatrixRow
              key={`${row.dem.id}-${row.rep.id}`}
              row={row}
              columns={columns}
              trackingName={trackingName}
            />
          ))}
        </div>
        {collapsible && (
          <button
            type="button"
            aria-expanded={showAll}
            aria-controls={bodyId}
            onClick={() => {
              track('toggle election conditional matrix', {
                matrix: trackingName,
                showAll: !showAll,
              })
              setShowAll(!showAll)
            }}
            className={clsx(
              'border-ink-200 text-primary-700 hover:bg-canvas-50 w-full border-t px-4 py-2 text-sm font-medium transition-colors',
              FOCUS_RING,
              'focus-visible:ring-inset'
            )}
          >
            {showAll ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </div>
      {footnote && <p className="text-ink-600 text-xs">{footnote}</p>}
    </Col>
  )
}

function ColumnHeader(props: { column: ConditionalMatrixColumn }) {
  const { column } = props
  const style = PARTY_STYLE[column.party]
  return (
    <div
      role="columnheader"
      className="flex min-w-0 items-start gap-1.5 text-xs font-semibold leading-snug md:text-[13px]"
    >
      {/* Doubles as the legend for the dumbbell's dots. */}
      <span
        aria-hidden
        className={clsx('mt-[0.3rem] h-2 w-2 shrink-0 rounded-full', style.dot)}
      />
      <span className={style.label}>
        {column.label}
        {column.prob != null && (
          <span className="text-ink-600 whitespace-nowrap font-normal tabular-nums">
            {' · '}
            {wholePercent(column.prob)}
          </span>
        )}
      </span>
    </div>
  )
}

function MatrixRow(props: {
  row: ConditionalMatrixRow
  columns: MatrixColumns
  trackingName: string
}) {
  const { row, columns, trackingName } = props
  const contracts: Record<MatrixParty, BinaryContract> = {
    dem: useLiveContract(row.dem),
    rep: useLiveContract(row.rep),
  }
  const probs: Record<MatrixParty, number | undefined> = {
    dem: matrixProb(contracts.dem),
    rep: matrixProb(contracts.rep),
  }
  return (
    <div
      role="row"
      className={clsx(
        ROW_GRID,
        'border-ink-100 items-center gap-y-2 border-t px-3 py-2.5 first:border-t-0 md:px-4'
      )}
    >
      <div
        role="rowheader"
        className="text-ink-900 col-span-2 text-sm font-medium leading-snug md:col-span-1"
      >
        {row.label}
      </div>
      {columns.map((column) => (
        <div role="cell" key={column.party}>
          <MatrixCell
            contract={contracts[column.party]}
            prob={probs[column.party]}
            column={column}
            trackingName={trackingName}
          />
        </div>
      ))}
      <div role="cell" className="col-span-2 md:col-span-1">
        <GapDumbbell columns={columns} probs={probs} />
      </div>
    </div>
  )
}

function MatrixCell(props: {
  contract: BinaryContract
  prob: number | undefined
  column: ConditionalMatrixColumn
  trackingName: string
}) {
  const { contract, prob, column, trackingName } = props
  const [open, setOpen] = useState(false)
  const percent = wholePercent(prob)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${percent}. Bet on: ${contract.question}`}
        title={contract.question}
        onClick={() => {
          track('bet intent', {
            location: trackingName,
            contractId: contract.id,
            party: column.party,
          })
          setOpen(true)
        }}
        className={clsx(
          'border-ink-200 bg-canvas-0 hover:border-ink-400 hover:bg-canvas-50 flex w-full flex-col items-center rounded-lg border px-2 py-1 transition-colors',
          FOCUS_RING,
          'focus-visible:ring-offset-canvas-0 focus-visible:ring-offset-1'
        )}
      >
        <span
          className={clsx(
            'text-2xl font-semibold tabular-nums leading-tight',
            PARTY_STYLE[column.party].percent
          )}
        >
          {percent}
        </span>
        <span className="text-ink-600 text-xs md:hidden">
          {column.shortLabel}
        </span>
      </button>
      {open && (
        <BetDialog
          contract={contract}
          open
          setOpen={setOpen}
          initialOutcome="YES"
          trackingLocation={trackingName}
        />
      )}
    </>
  )
}

const pct = (p: number) => `${p * 100}%`

const DOT =
  'ring-canvas-0 absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2'

// A 0–100% track with a dot per column and a neutral connector between them.
// The text beside it gives the gap in points; the accessible name carries both
// chances by column, so nothing depends on telling the dots apart by color.
function GapDumbbell(props: {
  columns: MatrixColumns
  probs: Record<MatrixParty, number | undefined>
}) {
  const { columns, probs } = props
  const [a, b] = columns.map((c) => probs[c.party])
  if (a == null || b == null) return null
  const gap = gapPoints(a, b)
  const gapText = gap === 0 ? 'No gap' : `${gap}-pt gap`
  const description = `${columns
    .map((c) => `${c.label}: ${wholePercent(probs[c.party])}`)
    .join('. ')}. ${gapText}.`
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const split = gap <= SPLIT_DOT_MAX_GAP
  return (
    <div
      role="img"
      aria-label={description}
      title={description}
      className="flex items-center gap-2"
    >
      <div className="relative mx-1.5 h-3 flex-1">
        <div className="bg-ink-200 absolute inset-x-0 top-1/2 h-px -translate-y-1/2" />
        <div className="bg-ink-300 absolute left-1/2 top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2" />
        <div
          className="bg-ink-400 absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
          style={{ left: pct(lo), width: pct(hi - lo) }}
        />
        {split ? (
          <span
            className={clsx(
              DOT,
              'bg-gradient-to-r from-50% to-50%',
              PARTY_STYLE[columns[0].party].from,
              PARTY_STYLE[columns[1].party].to
            )}
            style={{ left: pct((a + b) / 2) }}
          />
        ) : (
          columns.map((c) => (
            <span
              key={c.party}
              className={clsx(DOT, PARTY_STYLE[c.party].dot)}
              style={{ left: pct(probs[c.party] ?? 0) }}
            />
          ))
        )}
      </div>
      <span
        className={clsx(
          'text-ink-600 shrink-0 text-right text-xs tabular-nums',
          GAP_LABEL_WIDTH
        )}
      >
        {gapText}
      </span>
    </div>
  )
}

// The gap column's header: the dumbbell's 0–100% scale.
function GapAxis() {
  return (
    <div aria-hidden className="flex items-center gap-2">
      <div className="text-ink-600 relative mx-1.5 h-4 flex-1 text-[10px] tabular-nums">
        <span className="absolute left-0 -translate-x-1/2">0%</span>
        <span className="absolute left-1/2 -translate-x-1/2">50%</span>
        <span className="absolute left-full -translate-x-1/2">100%</span>
      </div>
      <span className={clsx('shrink-0', GAP_LABEL_WIDTH)} />
    </div>
  )
}

/**
 * Renders `children` with odds read from the live version of a market that
 * may be missing. Hooks can't be called conditionally, so without the market
 * the children get undefined (e.g. a matrix header with no chances).
 */
export function LiveConditionOdds<T>(props: {
  contract: Contract | null | undefined
  read: (contract: Contract) => T | undefined
  children: (odds: T | undefined) => ReactNode
}) {
  const { contract, read, children } = props
  if (!contract) return <>{children(undefined)}</>
  return <LiveOdds contract={contract} read={read} render={children} />
}

function LiveOdds<T>(props: {
  contract: Contract
  read: (contract: Contract) => T | undefined
  render: (odds: T | undefined) => ReactNode
}) {
  const live = useLiveContract(props.contract)
  return <>{props.render(props.read(live))}</>
}
