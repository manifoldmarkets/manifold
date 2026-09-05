import type { HistoryPoint } from 'common/chart'
import type {
  PerpContractPoolStats,
  PerpPoolStats,
  PerpPoolStatsPoint,
} from 'common/perps/pool-accounting'
import { formatMoney } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'
import { max, sumBy } from 'lodash'
import clsx from 'clsx'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { MultiValueHistoryChart } from 'web/components/charts/generic-charts'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SizedContainer } from 'web/components/sized-container'
import { Select } from 'web/components/widgets/select'
import { linkClass } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'

const LONG_COLOR = '#3b82f6'
const SHORT_COLOR = '#f59e0b'
const TOTAL_COLOR = '#10b981'

export function PerpStatsTab(props: { stats: PerpPoolStats }) {
  const { stats } = props
  const activeContracts = stats.contracts.filter(
    (contract) => !contract.isResolved
  )
  const defaultContract = activeContracts[0] ?? stats.contracts[0]
  const [selectedId, setSelectedId] = useState(defaultContract?.id ?? '')
  const selected =
    stats.contracts.find((contract) => contract.id === selectedId) ??
    defaultContract

  const totalPool = sumBy(
    stats.contracts,
    (contract) => contract.poolLong + contract.poolShort
  )
  const markedPositionValue = sumBy(
    stats.contracts,
    (contract) => contract.markedPositionValue
  )
  const reservedMargin = sumBy(
    stats.contracts,
    (contract) => contract.reservedMarginLong + contract.reservedMarginShort
  )
  const subsidy = stats.flows.initialSubsidy + stats.flows.addedSubsidy
  const subsidyPnlAtMark =
    totalPool - markedPositionValue + stats.flows.residualReturned - subsidy

  return (
    <Col className="w-full min-w-0 max-w-full gap-8">
      <div>
        <Title>Perpetual market economics</Title>
        <p className="text-ink-500 max-w-3xl text-sm">
          Backing pools and cash flows are recorded with each perp transaction,
          independently of the stats scheduler. Pool history begins when this
          accounting ledger is deployed; cumulative cash flows include the
          complete transaction history.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Current backing" value={totalPool} />
        <Stat label="Marked trader value" value={markedPositionValue} />
        <Stat label="Reserved margin" value={reservedMargin} />
        <Stat label="Fees added" value={stats.flows.feesIn} />
        <Stat
          label="Pre-ADL subsidy P&L at mark"
          value={subsidyPnlAtMark}
          signed
        />
        <Stat label="Initial subsidy" value={stats.flows.initialSubsidy} />
        <Stat label="Added subsidy" value={stats.flows.addedSubsidy} />
        <Stat label="Trader margin in" value={stats.flows.marginIn} />
        <Stat label="Trader payouts" value={stats.flows.traderPayouts} />
        <Stat label="Residual returned" value={stats.flows.residualReturned} />
      </div>
      <p className="text-ink-500 -mt-5 max-w-3xl text-xs">
        Subsidy P&amp;L at mark is current backing plus resolved residuals,
        minus open positions at the oracle mark and all subsidy deposited. It
        includes trading fees and is shown before any future ADL.
      </p>

      <section>
        <Title>Sitewide perp backing</Title>
        <PoolHistoryChart points={stats.points} />
      </section>

      {selected && (
        <section>
          <Row className="mb-4 flex-wrap items-center justify-between gap-3">
            <Title className="mb-0">Backing by market</Title>
            <Select
              value={selected.id}
              onChange={(event) => setSelectedId(event.target.value)}
              className="max-w-full sm:max-w-xl"
            >
              {stats.contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.question}
                </option>
              ))}
            </Select>
          </Row>
          <Link
            className={clsx(linkClass, 'mb-3 block text-sm')}
            href={`/${selected.creatorUsername}/${selected.slug}`}
          >
            Open market
          </Link>
          <ContractFlowStats contract={selected} />
          <PoolHistoryChart points={selected.points} />
        </section>
      )}

      <section>
        <Title>Perp markets</Title>
        <p className="text-ink-500 mb-3 max-w-3xl text-sm">
          “Backing minus marked value” estimates what would remain after paying
          positions at the current oracle mark before any ADL. A negative value
          is a risk signal, not a guaranteed house loss, because ADL can reduce
          profitable claims.
        </p>
        <div className="border-ink-200 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-ink-200 border-b">
                <Header>Market</Header>
                <Header right>Long pool</Header>
                <Header right>Short pool</Header>
                <Header right>Open interest</Header>
                <Header right>Marked value</Header>
                <Header right>Backing − value</Header>
                <Header right>Subsidy P&amp;L</Header>
                <Header right>Fees</Header>
              </tr>
            </thead>
            <tbody>
              {stats.contracts.map((contract) => (
                <ContractRow key={contract.id} contract={contract} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Col>
  )
}

function ContractFlowStats(props: { contract: PerpContractPoolStats }) {
  const { contract } = props
  const totalPool = contract.poolLong + contract.poolShort
  const subsidy = contract.flows.initialSubsidy + contract.flows.addedSubsidy
  const subsidyPnlAtMark =
    totalPool -
    contract.markedPositionValue +
    contract.flows.residualReturned -
    subsidy

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Current backing" value={totalPool} />
      <Stat label="Subsidy in" value={subsidy} />
      <Stat label="Trader margin in" value={contract.flows.marginIn} />
      <Stat label="Fees added" value={contract.flows.feesIn} />
      <Stat label="Trader payouts" value={contract.flows.traderPayouts} />
      <Stat
        label="Pre-ADL subsidy P&L at mark"
        value={subsidyPnlAtMark}
        signed
      />
    </div>
  )
}

function Stat(props: { label: string; value: number; signed?: boolean }) {
  const { label, value, signed } = props
  const color =
    signed && value !== 0
      ? value > 0
        ? 'text-teal-600'
        : 'text-scarlet-600'
      : 'text-ink-1000'
  return (
    <div className="bg-canvas-50 rounded-lg p-3">
      <div className="text-ink-500 text-xs">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>
        {signed && value > 0 ? '+' : ''}
        {formatMoney(value)}
      </div>
    </div>
  )
}

function Header(props: { children: string; right?: boolean }) {
  return (
    <th
      className={`text-ink-600 px-3 py-2 text-xs font-medium ${
        props.right ? 'text-right' : 'text-left'
      }`}
    >
      {props.children}
    </th>
  )
}

function ContractRow(props: { contract: PerpContractPoolStats }) {
  const { contract } = props
  const pool = contract.poolLong + contract.poolShort
  const openInterest = contract.openInterestLong + contract.openInterestShort
  const buffer = pool - contract.markedPositionValue
  const subsidy = contract.flows.initialSubsidy + contract.flows.addedSubsidy
  const subsidyPnl = buffer + contract.flows.residualReturned - subsidy
  return (
    <tr className="border-ink-200 border-b last:border-0">
      <td className="max-w-sm px-3 py-2 text-sm">
        <Link
          className={linkClass}
          href={`/${contract.creatorUsername}/${contract.slug}`}
        >
          {contract.question}
        </Link>
        <div className="text-ink-500 mt-1 text-xs">
          {contract.isResolved
            ? 'Resolved'
            : contract.solvencyHalted
            ? 'Risk halt active'
            : 'Active'}
        </div>
      </td>
      <Cell>{contract.poolLong}</Cell>
      <Cell>{contract.poolShort}</Cell>
      <Cell>{openInterest}</Cell>
      <Cell>{contract.markedPositionValue}</Cell>
      <Cell signed>{buffer}</Cell>
      <Cell signed>{subsidyPnl}</Cell>
      <Cell>{contract.flows.feesIn}</Cell>
    </tr>
  )
}

function Cell(props: { children: number; signed?: boolean }) {
  const { children, signed } = props
  const color =
    signed && children !== 0
      ? children > 0
        ? 'text-teal-600'
        : 'text-scarlet-600'
      : ''
  return (
    <td className={`px-3 py-2 text-right text-sm tabular-nums ${color}`}>
      {signed && children > 0 ? '+' : ''}
      {formatMoney(children)}
    </td>
  )
}

function PoolHistoryChart(props: { points: PerpPoolStatsPoint[] }) {
  const { points } = props
  const data = useMemo(() => {
    const asPoints = (value: (point: PerpPoolStatsPoint) => number) =>
      points.map((point) => ({
        x: new Date(`${point.date}T12:00:00Z`).getTime(),
        y: value(point),
      }))
    return {
      Total: {
        points: asPoints((point) => point.poolLong + point.poolShort),
        color: TOTAL_COLOR,
      },
      Long: { points: asPoints((point) => point.poolLong), color: LONG_COLOR },
      Short: {
        points: asPoints((point) => point.poolShort),
        color: SHORT_COLOR,
      },
    }
  }, [points])

  const allPoints = Object.values(data).flatMap((series) => series.points)
  if (allPoints.length === 0)
    return <div className="text-ink-400 py-8">No pool history yet.</div>

  const first = allPoints[0].x
  const last = allPoints[allPoints.length - 1].x
  const maxValue = max(allPoints.map((point) => point.y)) ?? 1

  return (
    <>
      <SizedContainer className="h-[260px] w-full pr-12 sm:h-[360px] sm:pr-0">
        {(width, height) => (
          <MultiValueHistoryChart<HistoryPoint>
            data={data}
            w={width}
            h={height}
            xScale={scaleTime(
              [first, last === first ? first + DAY_MS : last],
              [0, width]
            )}
            yScale={scaleLinear([0, Math.max(maxValue * 1.05, 1)], [height, 0])}
            yKind="amount"
            curve={curveStepAfter}
            Tooltip={({ prev, ans }) =>
              prev ? (
                <Col className="gap-1">
                  <div>{new Date(prev.x).toLocaleDateString()}</div>
                  <div>
                    {ans}: {formatMoney(prev.y)}
                  </div>
                </Col>
              ) : null
            }
          />
        )}
      </SizedContainer>
      <Row className="mt-3 flex-wrap gap-5 text-xs">
        <Legend color={TOTAL_COLOR}>Total</Legend>
        <Legend color={LONG_COLOR}>Long</Legend>
        <Legend color={SHORT_COLOR}>Short</Legend>
      </Row>
    </>
  )
}

function Legend(props: { color: string; children: string }) {
  return (
    <Row className="items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: props.color }}
      />
      {props.children}
    </Row>
  )
}
