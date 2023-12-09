import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getMappedValue } from 'common/pseudo-numeric'
import { trackCallback } from 'web/lib/service/analytics'
import { buttonClass } from './button'
import Link from 'next/link'
import { NewQuestionParams } from 'web/components/new-contract/new-contract-panel'
import { getNativePlatform } from 'web/lib/native/is-native'

export function DuplicateContractButton(props: { contract: Contract }) {
  const { contract } = props
  const href = duplicateContractHref(contract)
  return (
    <Link
      className={clsx(buttonClass('sm', 'indigo-outline'))}
      href={href}
      onClick={trackCallback('duplicate market')}
      target={getLinkTarget(href, true)}
    >
      Duplicate
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

  if (contract.mechanism === 'cpmm-multi-1') {
    params.addAnswersMode = contract.addAnswersMode
    params.shouldAnswersSumToOne = contract.shouldAnswersSumToOne
  }

  if (contract.groupLinks && contract.groupLinks.length > 0) {
    params.groupIds = contract.groupLinks.map((gl) => gl.groupId)
  }

  return `/create?params=` + encodeURIComponent(JSON.stringify(params))
}

const getLinkTarget = (href: string, newTab?: boolean) => {
  if (href.startsWith('http')) return '_blank'
  const { isNative } = getNativePlatform()
  // Native will open 'a new tab' when target = '_blank' in the system browser rather than in the app
  if (isNative) return '_self'
  return newTab ? '_blank' : '_self'
}
