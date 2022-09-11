import clsx from 'clsx'
import { contractPath } from 'web/lib/firebase/contracts'
import { CPMMContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { SiteLink } from '../site-link'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../loading-indicator'

export function ProbChangeTable(props: {
  changes:
    | { positiveChanges: CPMMContract[]; negativeChanges: CPMMContract[] }
    | undefined
}) {
  const { changes } = props

  if (!changes) return <LoadingIndicator />

  const { positiveChanges, negativeChanges } = changes
  if (positiveChanges.length === 0 && negativeChanges.length === 0) return null

  const rows = Math.min(
    Math.min(positiveChanges.length, negativeChanges.length),
    3
  )

  const filteredPositiveChanges = positiveChanges.slice(0, rows)
  const filteredNegativeChanges = negativeChanges.slice(0, rows)

  return (
    <Col className="mb-4 w-full divide-x-2 divide-y rounded-lg bg-white shadow-md md:flex-row md:divide-y-0">
      <Col className="flex-1 divide-y">
        {filteredPositiveChanges.map((contract) => (
          <Row className="items-center hover:bg-gray-100">
            <ProbChange
              className="p-4 text-right text-xl"
              contract={contract}
            />
            <SiteLink
              className="p-4 pl-2 font-semibold text-indigo-700"
              href={contractPath(contract)}
            >
              <span className="line-clamp-2">{contract.question}</span>
            </SiteLink>
          </Row>
        ))}
      </Col>
      <Col className="flex-1 divide-y">
        {filteredNegativeChanges.map((contract) => (
          <Row className="items-center hover:bg-gray-100">
            <ProbChange
              className="p-4 text-right text-xl"
              contract={contract}
            />
            <SiteLink
              className="p-4 pl-2 font-semibold text-indigo-700"
              href={contractPath(contract)}
            >
              <span className="line-clamp-2">{contract.question}</span>
            </SiteLink>
          </Row>
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
    probChanges: { day: change },
  } = contract

  const color =
    change > 0
      ? 'text-green-500'
      : change < 0
      ? 'text-red-500'
      : 'text-gray-600'

  const str =
    change === 0
      ? '+0%'
      : `${change > 0 ? '+' : '-'}${formatPercent(Math.abs(change))}`
  return <div className={clsx(className, color)}>{str}</div>
}
