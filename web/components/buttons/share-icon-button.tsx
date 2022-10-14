import React, { useState } from 'react'
import { LinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { copyToClipboard } from 'web/lib/util/copy'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { track } from 'web/lib/service/analytics'
import { IconButton } from './button'

export function ShareIconButton(props: {
  toastClassName?: string
  children?: React.ReactNode
  iconClassName?: string
  copyPayload: string
}) {
  const { toastClassName, children, iconClassName, copyPayload } = props
  const [showToast, setShowToast] = useState(false)

  return (
    <div className="relative z-10 flex-shrink-0">
      <IconButton
        size="2xs"
        className={clsx('mt-1', showToast ? 'text-indigo-600' : '')}
        onClick={() => {
          copyToClipboard(copyPayload)
          track('copy share link')
          setShowToast(true)
          setTimeout(() => setShowToast(false), 2000)
        }}
      >
        <LinkIcon
          className={clsx(iconClassName ? iconClassName : 'h-5 w-5')}
          aria-hidden="true"
        />
        {children}
      </IconButton>

      {showToast && <ToastClipboard className={toastClassName} />}
    </div>
  )
}
