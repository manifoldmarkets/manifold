import clsx from 'clsx'
import { contractPath } from 'web/lib/firebase/contracts'
import { CPMMContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { useProbChanges } from 'web/hooks/use-prob-changes'
import { SiteLink } from '../site-link'

export function ProbChangeTable(props: { userId: string | undefined }) {
  const { userId } = props

  const changes = useProbChanges(userId ?? '')
  console.log('changes', changes)

  if (!changes) {
    return null
  }

  const { positiveChanges, negativeChanges } = changes

  const count = 3

  return (
    <div className="grid max-w-xl gap-x-2 gap-y-2 rounded bg-white p-4 text-gray-700">
      <div className="text-xl text-gray-800">Daily movers</div>
      <div className="text-right">% pts</div>
      {positiveChanges.slice(0, count).map((contract) => (
        <>
          <div className="line-clamp-2">
            <SiteLink href={contractPath(contract)}>
              {contract.question}
            </SiteLink>
          </div>
          <ProbChange className="text-right" contract={contract} />
        </>
      ))}
      <div className="col-span-2 my-2" />
      {negativeChanges.slice(0, count).map((contract) => (
        <>
          <div className="line-clamp-2">
            <SiteLink href={contractPath(contract)}>
              {contract.question}
            </SiteLink>
          </div>
          <ProbChange className="text-right" contract={contract} />
        </>
      ))}
    </div>
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
      : 'text-gray-500'

  const str =
    change === 0
      ? '+0%'
      : `${change > 0 ? '+' : '-'}${formatPercent(Math.abs(change))}`
  return <div className={clsx(className, color)}>{str}</div>
}
