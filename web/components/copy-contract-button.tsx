import { DuplicateIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getMappedValue } from 'common/pseudo-numeric'
import { trackCallback } from 'web/lib/service/analytics'

export function DuplicateContractButton(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  return (
    <a
      className={clsx('btn btn-xs flex-nowrap normal-case', className)}
      style={{
        backgroundColor: 'white',
        border: '2px solid #a78bfa',
        // violet-400
        color: '#a78bfa',
      }}
      href={duplicateContractHref(contract)}
      onClick={trackCallback('duplicate market')}
      target="_blank"
    >
      <DuplicateIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
      <div>Duplicate</div>
    </a>
  )
}

// Pass along the Uri to create a new contract
function duplicateContractHref(contract: Contract) {
  const params = {
    q: contract.question,
    closeTime: contract.closeTime || 0,
    description: contract.description,
    outcomeType: contract.outcomeType,
  } as Record<string, any>

  if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    params.min = contract.min
    params.max = contract.max
    params.isLogScale = contract.isLogScale
    params.initValue = getMappedValue(contract)(contract.initialProbability)
  }

  return (
    `/create?` +
    Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&')
  )
}
