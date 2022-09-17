import clsx from 'clsx'
import { contractPath } from 'web/lib/firebase/contracts'
import { CPMMContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { SiteLink } from '../site-link'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../loading-indicator'
import { ProfitBadge } from '../bets-list'

export function ProbChangeTable(props: {
  changes:
    | { positiveChanges: CPMMContract[]; negativeChanges: CPMMContract[] }
    | undefined
  full?: boolean
}) {
  const { changes, full } = props

  if (!changes) return <LoadingIndicator />

  const { positiveChanges, negativeChanges } = changes

  const threshold = 0.075
  const countOverThreshold = Math.max(
    positiveChanges.findIndex((c) => c.probChanges.day < threshold) + 1,
    negativeChanges.findIndex((c) => c.probChanges.day > -threshold) + 1
  )
  const maxRows = Math.min(positiveChanges.length, negativeChanges.length)
  const rows = full
    ? maxRows
    : Math.min(3, Math.min(maxRows, countOverThreshold))

  const filteredPositiveChanges = positiveChanges.slice(0, rows)
  const filteredNegativeChanges = negativeChanges.slice(0, rows)

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

function ProbChangeRow(props: { contract: CPMMContract }) {
  const { contract } = props
  return (
    <Row className="items-center justify-between gap-4 hover:bg-gray-100">
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
  return (
    <Col className={clsx('flex flex-col items-end', className)}>
      <span className="mr-1.5 mb-0.5 text-2xl">
        {formatPercent(Math.round(100 * prob) / 100)}
      </span>
      <ProfitBadge className="ml-0" profitPercent={100 * change} />
    </Col>
  )
}
