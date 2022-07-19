import React, { useState } from 'react'
import { ShareIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { Contract } from 'common/contract'
import { copyToClipboard } from 'web/lib/util/copy'
import { contractPath } from 'web/lib/firebase/contracts'
import { ENV_CONFIG } from 'common/envs/constants'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { track } from 'web/lib/service/analytics'
import { contractDetailsButtonClassName } from 'web/components/contract/contract-info-dialog'
import { Group } from 'common/group'
import { groupPath } from 'web/lib/firebase/groups'
import { Manalink } from 'common/manalink'
import getManalinkUrl from 'web/get-manalink-url'

function copyContractWithReferral(contract: Contract, username?: string) {
  const postFix =
    username && contract.creatorUsername !== username
      ? '?referrer=' + username
      : ''
  copyToClipboard(
    `https://${ENV_CONFIG.domain}${contractPath(contract)}${postFix}`
  )
}

// Note: if a user arrives at a /group endpoint with a ?referral= query, they'll be added to the group automatically
function copyGroupWithReferral(group: Group, username?: string) {
  const postFix = username ? '?referrer=' + username : ''
  copyToClipboard(
    `https://${ENV_CONFIG.domain}${groupPath(group.slug)}${postFix}`
  )
}

function copyManalink(manalink: Manalink) {
  copyToClipboard(getManalinkUrl(manalink.slug))
}

export function ShareIconButton(props: {
  contract?: Contract
  group?: Group
  manalink?: Manalink
  buttonClassName?: string
  onCopyButtonClassName?: string
  toastClassName?: string
  username?: string
  children?: React.ReactNode
  iconClassName?: string
}) {
  const {
    contract,
    manalink,
    buttonClassName,
    onCopyButtonClassName,
    toastClassName,
    username,
    group,
    children,
    iconClassName,
  } = props
  const [showToast, setShowToast] = useState(false)

  return (
    <div className="relative z-10 flex-shrink-0">
      <button
        className={clsx(
          contractDetailsButtonClassName,
          buttonClassName,
          showToast ? onCopyButtonClassName : ''
        )}
        onClick={() => {
          if (contract) copyContractWithReferral(contract, username)
          if (group) copyGroupWithReferral(group, username)
          if (manalink) copyManalink(manalink)
          track('copy share link')
          setShowToast(true)
          setTimeout(() => setShowToast(false), 2000)
        }}
      >
        <ShareIcon
          className={clsx(iconClassName ? iconClassName : 'h-[24px] w-5')}
          aria-hidden="true"
        />
        {children}
      </button>

      {showToast && <ToastClipboard className={toastClassName} />}
    </div>
  )
}
