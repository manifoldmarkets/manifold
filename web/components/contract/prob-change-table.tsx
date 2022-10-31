import clsx from 'clsx'
import { sortBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { ContractMetrics } from 'common/calculate-metrics'
import { CPMMBinaryContract, CPMMContract } from 'common/contract'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ContractCardProbChange } from './contract-card'
import { User } from 'common/user'

export function ProfitChangeTable(props: {
  contracts: CPMMBinaryContract[]
  metrics: ContractMetrics[]
  maxRows?: number
}) {
  const { contracts, metrics, maxRows } = props

  const contractProfit = metrics.map(
    (m) => [m.contractId, m.from?.day.profit ?? 0] as const
  )

  const positiveProfit = sortBy(
    contractProfit.filter(([, profit]) => profit > 0),
    ([, profit]) => profit
  ).reverse()
  const positive = filterDefined(
    positiveProfit.map(([contractId]) =>
      contracts.find((c) => c.id === contractId)
    )
  ).slice(0, maxRows)

  const negativeProfit = sortBy(
    contractProfit.filter(([, profit]) => profit < 0),
    ([, profit]) => profit
  )
  const negative = filterDefined(
    negativeProfit.map(([contractId]) =>
      contracts.find((c) => c.id === contractId)
    )
  ).slice(0, maxRows)

  if (positive.length === 0 && negative.length === 0)
    return <div className="px-4 text-gray-500">None</div>

  return (
    <Col className="mb-4 w-full gap-4 rounded-lg md:flex-row">
      <Col className="flex-1">
        {positive.map((contract) => (
          <ContractCardProbChange
            key={contract.id}
            contract={contract}
            showPosition
            showDailyProfit
          />
        ))}
      </Col>
      <Col className="flex-1">
        {negative.map((contract) => (
          <ContractCardProbChange
            key={contract.id}
            contract={contract}
            showPosition
            showDailyProfit
          />
        ))}
      </Col>
    </Col>
  )
}

export function ProbChangeTable(props: {
  changes: CPMMContract[] | undefined
  full?: boolean
}) {
  const { changes, full } = props

  if (!changes) return <LoadingIndicator />

  const descendingChanges = sortBy(changes, (c) => c.probChanges.day).reverse()
  const ascendingChanges = sortBy(changes, (c) => c.probChanges.day)

  const threshold = 0.01
  const positiveAboveThreshold = descendingChanges.filter(
    (c) => c.probChanges.day > threshold
  )
  const negativeAboveThreshold = ascendingChanges.filter(
    (c) => c.probChanges.day < threshold
  )
  const maxRows = Math.min(
    positiveAboveThreshold.length,
    negativeAboveThreshold.length
  )
  const rows = full ? maxRows : Math.min(3, maxRows)

  const filteredPositiveChanges = positiveAboveThreshold.slice(0, rows)
  const filteredNegativeChanges = negativeAboveThreshold.slice(0, rows)

  if (rows === 0) return <div className="px-4 text-gray-500">None</div>

  return (
    <Col className="mb-4 w-full gap-4 rounded-lg md:flex-row">
      <Col className="flex-1">
        {filteredPositiveChanges.map((contract) => (
          <ContractCardProbChange
            key={contract.id}
            contract={contract}
            showPosition
            showDailyProfit
          />
        ))}
      </Col>
      <Col className="flex-1">
        {filteredNegativeChanges.map((contract) => (
          <ContractCardProbChange
            key={contract.id}
            contract={contract}
            showPosition
            showDailyProfit
          />
        ))}
      </Col>
    </Col>
  )
}

export function ProbOrNumericChange(props: {
  contract: CPMMContract
  user?: User | null

  className?: string
}) {
  const { contract } = props
  // Some contract without a probChanges.day was crashing the site, so I added the conditional
  const change = contract.probChanges?.day ?? 0

  const color = change >= 0 ? 'text-teal-600' : 'text-scarlet-600'
  if (Math.abs(change * 100) > 5) {
    return (
      <div
        className={clsx(
          'mr-1 flex  items-center justify-center rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold ',
          change >= 0 ? 'bg-teal-100' : 'bg-scarlet-100',
          color
        )}
      >
        {(change > 0 ? '+' : '') + (change * 100).toFixed(0) + '%'}
      </div>
    )
  }
  return <></>
}
