import React, { useState } from 'react'
import { ShareIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { copyToClipboard } from 'web/lib/util/copy'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { track } from 'web/lib/service/analytics'
import { contractDetailsButtonClassName } from 'web/components/contract/contract-info-dialog'

export function ShareIconButton(props: {
  buttonClassName?: string
  onCopyButtonClassName?: string
  toastClassName?: string
  children?: React.ReactNode
  iconClassName?: string
  copyPayload: string
}) {
  const {
    buttonClassName,
    onCopyButtonClassName,
    toastClassName,
    children,
    iconClassName,
    copyPayload,
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
          copyToClipboard(copyPayload)
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
