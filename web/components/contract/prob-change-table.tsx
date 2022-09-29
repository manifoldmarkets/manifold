import clsx from 'clsx'
import { partition } from 'lodash'
import { contractPath } from 'web/lib/firebase/contracts'
import { CPMMContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { SiteLink } from '../site-link'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../loading-indicator'
import { useContractWithPreload } from 'web/hooks/use-contract'

export function ProbChangeTable(props: {
  changes: CPMMContract[] | undefined
  full?: boolean
}) {
  const { changes, full } = props

  if (!changes) return <LoadingIndicator />

  const [positiveChanges, negativeChanges] = partition(
    changes,
    (c) => c.probChanges.day > 0
  )

  const threshold = 0.01
  const positiveAboveThreshold = positiveChanges.filter(
    (c) => c.probChanges.day > threshold
  )
  const negativeAboveThreshold = negativeChanges.filter(
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
    <Col className="mb-4 w-full divide-x-2 divide-y rounded-lg bg-white shadow-md md:flex-row md:divide-y-0">
      <Col className="flex-1 divide-y">
        {filteredPositiveChanges.map((contract) => (
          <ProbChangeRow key={contract.id} contract={contract} />
        ))}
      </Col>
      <Col className="flex-1 divide-y">
        {filteredNegativeChanges.map((contract) => (
          <ProbChangeRow key={contract.id} contract={contract} />
        ))}
      </Col>
    </Col>
  )
}

export function ProbChangeRow(props: {
  contract: CPMMContract
  className?: string
}) {
  const { className } = props
  const contract =
    (useContractWithPreload(props.contract) as CPMMContract) ?? props.contract
  return (
    <Row
      className={clsx(
        'items-center justify-between gap-4 hover:bg-gray-100',
        className
      )}
    >
      <SiteLink
        className="p-4 pr-0 font-semibold text-indigo-700"
        href={contractPath(contract)}
      >
        <span className="line-clamp-2">{contract.question}</span>
      </SiteLink>
      <ProbChange className="py-2 pr-4 text-xl" contract={contract} />
    </Row>
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
