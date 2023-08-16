import { DuplicateIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getMappedValue } from 'common/pseudo-numeric'
import { trackCallback } from 'web/lib/service/analytics'
import { buttonClass } from './button'
import Link from 'next/link'
import { getLinkTarget } from 'web/components/widgets/site-link'
import { NewQuestionParams } from 'web/components/new-contract/new-contract-panel'

export function DuplicateContractButton(props: { contract: Contract }) {
  const { contract } = props
  const href = duplicateContractHref(contract)
  return (
    <Link
      className={clsx(
        buttonClass('sm', 'override'),
        'hover:text-ink-0 gap-1 border-2 border-violet-400 text-violet-400 hover:bg-violet-400'
      )}
      href={href}
      onClick={trackCallback('duplicate market')}
      target={getLinkTarget(href, true)}
    >
      <DuplicateIcon className="h-4 w-4" aria-hidden="true" />
      <div>Duplicate</div>
    </Link>
  )
}

// Pass along the Uri to create a new contract
function duplicateContractHref(contract: Contract) {
  const descriptionString = JSON.stringify(contract.description)
  // Don't set a closeTime that's in the past
  const closeTime =
    (contract?.closeTime ?? 0) <= Date.now() ? 0 : contract.closeTime
  const params = {
    q: contract.question,
    closeTime,
    description: descriptionString,
    outcomeType: contract.outcomeType,
    visibility: contract.visibility,
  } as NewQuestionParams

  if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    params.min = contract.min
    params.max = contract.max
    if (contract.isLogScale) {
      // Conditional, because `?isLogScale=false` evaluates to `true`
      params.isLogScale = true
    }
    params.initValue = getMappedValue(contract, contract.initialProbability)
  }

  if (contract.outcomeType === 'MULTIPLE_CHOICE') {
    params.answers = contract.answers.map((a) => a.text)
  }

  if (contract.groupLinks && contract.groupLinks.length > 0) {
    params.groupIds = contract.groupLinks.map((gl) => gl.groupId)
  }

  return `/create?params=` + encodeURIComponent(JSON.stringify(params))
}
