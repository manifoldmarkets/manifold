import clsx from 'clsx'
import { contractPath } from 'web/lib/firebase/contracts'
import { CPMMContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { useProbChanges } from 'web/hooks/use-prob-changes'
import { SiteLink } from '../site-link'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

export function ProbChangeTable(props: { userId: string | undefined }) {
  const { userId } = props

  const changes = useProbChanges(userId ?? '')

  if (!changes) {
    return null
  }

  const { positiveChanges, negativeChanges } = changes

  const count = 3

  return (
    <Row className="mb-4 w-full flex-wrap divide-x-2 rounded bg-white shadow-md">
      <Col className="min-w-[300px] flex-1 divide-y">
        {positiveChanges.slice(0, count).map((contract) => (
          <Row className="hover:bg-gray-100">
            <ProbChange className="p-4 text-right" contract={contract} />
            <SiteLink
              className="p-4 font-semibold text-indigo-700"
              href={contractPath(contract)}
            >
              <span className="line-clamp-2">{contract.question}</span>
            </SiteLink>
          </Row>
        ))}
      </Col>
      <Col className="justify-content-stretch min-w-[300px] flex-1 divide-y">
        {negativeChanges.slice(0, count).map((contract) => (
          <Row className="hover:bg-gray-100">
            <ProbChange className="p-4 text-right" contract={contract} />
            <SiteLink
              className="p-4 font-semibold text-indigo-700"
              href={contractPath(contract)}
            >
              <span className="line-clamp-2">{contract.question}</span>
            </SiteLink>
          </Row>
        ))}
      </Col>
    </Row>
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
      ? 'text-green-600'
      : change < 0
      ? 'text-red-600'
      : 'text-gray-600'

  const str =
    change === 0
      ? '+0%'
      : `${change > 0 ? '+' : '-'}${formatPercent(Math.abs(change))}`
  return <div className={clsx(className, color)}>{str}</div>
}
