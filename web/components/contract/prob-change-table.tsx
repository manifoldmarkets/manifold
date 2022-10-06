import clsx from 'clsx'
import { CPMMContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { sortBy } from 'lodash'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../loading-indicator'
import { ContractCardProbChange } from './contract-card'

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
      <Col className="flex-1 gap-4">
        {filteredPositiveChanges.map((contract) => (
          <ContractCardProbChange key={contract.id} contract={contract} />
        ))}
      </Col>
      <Col className="flex-1 gap-4">
        {filteredNegativeChanges.map((contract) => (
          <ContractCardProbChange key={contract.id} contract={contract} />
        ))}
      </Col>
    </Col>
  )
}

export function ProbChange(props: {
  contract: CPMMContract
  className?: string
}) {
  const { contract, className } = props
  const {
    prob,
    probChanges: { day: change },
  } = contract

  const color = change >= 0 ? 'text-green-500' : 'text-red-500'

  return (
    <Col className={clsx('flex flex-col items-end', className)}>
      <div className="mb-0.5 mr-0.5 text-2xl">
        {formatPercent(Math.round(100 * prob) / 100)}
      </div>
      <div className={clsx('text-base', color)}>
        {(change > 0 ? '+' : '') + (change * 100).toFixed(0) + '%'}
      </div>
    </Col>
  )
}
