import React, { useState } from 'react'
import { ShareIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { Contract } from 'common/contract'
import { copyToClipboard } from 'web/lib/util/copy'
import { contractPath } from 'web/lib/firebase/contracts'
import { ENV_CONFIG } from 'common/envs/constants'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { track } from 'web/lib/service/analytics'
import { ContractDetailsButtonClassName } from 'web/components/contract/contract-info-dialog'
import { Group } from 'common/group'
import { groupPath } from 'web/lib/firebase/groups'

function copyContractWithReferral(contract: Contract, username?: string) {
  const postFix =
    username && contract.creatorUsername !== username
      ? '?referrer=' + username
      : ''
  copyToClipboard(
    `https://${ENV_CONFIG.domain}${contractPath(contract)}${postFix}`
  )
}
function copyGroupWithReferral(group: Group, username?: string) {
  const postFix = username ? '?referrer=' + username : ''
  copyToClipboard(
    `https://${ENV_CONFIG.domain}${groupPath(group.slug)}${postFix}`
  )
}

export function ShareIconButton(props: {
  contract?: Contract
  group?: Group
  buttonClassName?: string
  toastClassName?: string
  username?: string
  children?: React.ReactNode
}) {
  const {
    contract,
    buttonClassName,
    toastClassName,
    username,
    group,
    children,
  } = props
  const [showToast, setShowToast] = useState(false)

  return (
    <div className="relative z-10 flex-shrink-0">
      <button
        className={clsx(ContractDetailsButtonClassName, buttonClassName)}
        onClick={() => {
          if (contract) copyContractWithReferral(contract, username)
          if (group) copyGroupWithReferral(group, username)
          track('copy share link')
          setShowToast(true)
          setTimeout(() => setShowToast(false), 2000)
        }}
      >
        <ShareIcon className="h-[24px] w-5" aria-hidden="true" />
        {children}
      </button>

      {showToast && <ToastClipboard className={toastClassName} />}
    </div>
  )
}
