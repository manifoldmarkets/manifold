import Link from 'next/link'
import { sortBy } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { isCandidateAnswer, lookupCandidate } from 'web/lib/politics/candidates'
import { runningField } from 'web/lib/politics/election-glance'
import { MAP_VIEW_EVENT } from 'web/lib/politics/election-map'
import { TIMELINE } from 'web/lib/politics/elections-2028-config'
import { placeName } from 'web/lib/politics/official-markets'
import {
  EARLY_STATES,
  PrimaryCell,
  PrimaryRow,
} from 'web/lib/politics/primaries'
import { track } from 'web/lib/service/analytics'
import { CandidateAvatar, PhotoCredits } from './candidate-avatar'
import { LiveContracts } from './live-contracts'
import { OddsRows, oddsItems } from './odds-rows'

// The primaries as two pictures: who's likely to run (each party's field,
// faces with each one's chance of running), and the four early contests side
// by side with each party's leader there, then the calendar after them. The
// other states, and the Senate and governor primaries, are on the map's
// Primaries view, which the link at the bottom opens.

const FIELD = 8

const cellUrl = (cell: PrimaryCell) =>
  `/${cell.u ?? 'ManifoldPolitics'}/${cell.s}`

const dayOf = (key: string) => {
  const e = TIMELINE.find((x) => x.key === key)
  if (!e) return undefined
  return e.time
    ? new Date(e.time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : e.season
}

export function PrimariesOverview(props: {
  rows: PrimaryRow[]
  fields: Contract[]
}) {
  return (
    <LiveContracts contracts={props.fields}>
      {(fields) => <Primaries rows={props.rows} fields={fields} />}
    </LiveContracts>
  )
}

function Primaries(props: { rows: PrimaryRow[]; fields: Contract[] }) {
  const { rows, fields } = props
  const early = EARLY_STATES.flatMap((st) => {
    const row = rows.find((r) => r.o === 'P' && r.st === st && !r.y)
    return row && (row.D || row.R) ? [row] : []
  })
  // "Who will run for the Democratic presidential nomination?"; anything
  // else among the primary markets is a line each below.
  const isField = (c: Contract) => !!runningField(c.question) && isMultiCpmm(c)
  const runFields = sortBy(fields.filter(isField), (c) =>
    runningField(c.question) === 'D' ? 0 : 1
  )
  const otherMarkets = fields.filter((c) => !isField(c))
  const superTuesday = dayOf('super-tuesday')
  const last = dayOf('last-primaries')
  const rest = rows.filter((r) => r.o === 'P').length - early.length
  const downBallot = rows.some((r) => r.o !== 'P')

  return (
    <div className="flex flex-col gap-4">
      {runFields.length > 0 && (
        <div className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-ink-1000 text-base font-semibold">
              Who&apos;s running
            </h3>
            <span className="text-ink-500 text-xs">
              Each one&apos;s chance of running. Each name is its own market.
            </span>
          </div>
          {runFields.map((c) => (
            <Field
              key={c.id}
              contract={c}
              party={runningField(c.question) as 'D' | 'R'}
            />
          ))}
        </div>
      )}

      {early.length > 0 && (
        <div className="bg-canvas-0 border-ink-200 flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-ink-1000 text-base font-semibold">
              The early states
            </h3>
            <span className="text-ink-500 text-xs">
              Who leads each party&apos;s contest, in the order they vote
            </span>
          </div>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            {early.map((row, i) => (
              <li key={row.k} className="flex flex-col gap-2">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-ink-500 text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-ink-1000 text-sm font-semibold">
                    {placeName(row.st)}
                  </span>
                </span>
                {row.D && <EarlyLeader cell={row.D} party="D" />}
                {row.R && <EarlyLeader cell={row.R} party="R" />}
              </li>
            ))}
          </ol>
          <div className="text-ink-600 border-ink-200 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm">
            {superTuesday && (
              <span>
                <span className="text-ink-900 font-medium">Super Tuesday</span>{' '}
                {superTuesday}
              </span>
            )}
            {last && (
              <span>
                <span className="text-ink-900 font-medium">Last primaries</span>{' '}
                {last}
              </span>
            )}
            <a
              href="#map"
              className="text-primary-700 ml-auto font-medium hover:underline"
              onClick={() => {
                track('election primaries to map')
                window.dispatchEvent(
                  new CustomEvent(MAP_VIEW_EVENT, {
                    detail: { mode: 'primary', office: 'P' },
                  })
                )
              }}
            >
              {rest > 0
                ? `The other ${rest} contests${
                    downBallot ? ', and Senate and governor primaries,' : ''
                  } on the map →`
                : 'Every state on the map →'}
            </a>
          </div>
        </div>
      )}
      {otherMarkets.length > 0 && (
        <div className="bg-canvas-0 border-ink-200 rounded-xl border p-4">
          <OddsRows
            items={oddsItems(otherMarkets)}
            trackingName="election 2028 primaries"
          />
        </div>
      )}
      <PhotoCredits
        candidates={[
          ...early.flatMap((r) =>
            [r.D?.l, r.R?.l].flatMap((l) => (l ? [lookupCandidate(l)] : []))
          ),
          ...runFields.flatMap((c) =>
            isMultiCpmm(c)
              ? topAnswers(c).map((a) => lookupCandidate(a.text))
              : []
          ),
        ]}
      />
    </div>
  )
}

function topAnswers(c: Contract) {
  if (!isMultiCpmm(c)) return []
  const multi = c
  return sortBy(
    multi.answers.filter((a) => isCandidateAnswer(a.text)),
    (a) => -getAnswerProbability(multi, a.id)
  ).slice(0, FIELD)
}

function Field(props: { contract: Contract; party: 'D' | 'R' }) {
  const { contract, party } = props
  if (!isMultiCpmm(contract)) return null
  const answers = topAnswers(contract)
  return (
    <div className="flex flex-col gap-1.5">
      <Link
        href={contractPath(contract)}
        className="text-ink-600 hover:text-primary-700 w-fit text-xs font-semibold uppercase tracking-wide hover:underline"
      >
        {party === 'D' ? 'Democrats' : 'Republicans'}
      </Link>
      <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {answers.map((a) => {
          const candidate = lookupCandidate(a.text)
          const p = getAnswerProbability(contract, a.id)
          return (
            <li key={a.id} className="shrink-0">
              <Link
                href={contractPath(contract)}
                onClick={() => track('click election running field', { party })}
                className="hover:bg-canvas-50 flex w-[4.5rem] flex-col items-center gap-1 rounded-lg px-1 py-1 text-center"
                aria-label={`${candidate.name}: ${formatOdds(p)} to run`}
              >
                <CandidateAvatar
                  candidate={candidate}
                  size={40}
                  party={party}
                />
                <span className="text-ink-900 w-full truncate text-xs">
                  {candidate.shortName}
                </span>
                <span className="text-ink-1000 text-sm font-semibold tabular-nums leading-none">
                  {formatOdds(p)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EarlyLeader(props: { cell: PrimaryCell; party: 'D' | 'R' }) {
  const { cell, party } = props
  if (!cell.l) return null
  const candidate = lookupCandidate(cell.l)
  return (
    <Link
      href={cellUrl(cell)}
      onClick={() => track('click election early state', { party })}
      className="hover:bg-canvas-50 -mx-1 flex items-center gap-2 rounded-md px-1 py-0.5"
    >
      <CandidateAvatar candidate={candidate} size={28} party={party} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-ink-900 truncate text-sm">
          {candidate.shortName}
        </span>
        <span className="text-ink-600 text-xs tabular-nums">
          {cell.won
            ? 'Won'
            : cell.p !== undefined
            ? `${formatOdds(cell.p)} · ${party === 'D' ? 'Dem' : 'GOP'}`
            : party === 'D'
            ? 'Dem'
            : 'GOP'}
        </span>
      </span>
    </Link>
  )
}
