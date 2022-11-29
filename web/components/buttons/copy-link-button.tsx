import React, { useState } from 'react'
import { CheckIcon, DuplicateIcon } from '@heroicons/react/outline'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'

export function CopyLinkButton(props: {
  url: string
  displayUrl?: string
  tracking?: string
}) {
  const { url, displayUrl, tracking } = props

  // "copied" success state animations
  const [bgPressed, setBgPressed] = useState(false)
  const [iconPressed, setIconPressed] = useState(false)

  return (
    <Row
      className={clsx(
        'items-center rounded border bg-gray-50 text-sm text-gray-500 transition-colors duration-700',
        bgPressed ? 'bg-indigo-50 text-indigo-500 transition-none' : ''
      )}
    >
      <div className="ml-3 w-full select-all truncate">{displayUrl ?? url}</div>

      <Tooltip noTap text={iconPressed ? 'Copied!' : 'Copy Link'}>
        <button
          className="px-3 py-2 transition hover:opacity-50"
          onClick={() => {
            setBgPressed(true)
            setIconPressed(true)
            setTimeout(() => setBgPressed(false), 300)
            setTimeout(() => setIconPressed(false), 1000)
            copyToClipboard(url)
            track(tracking ?? 'copy share link')
          }}
        >
          {iconPressed ? (
            <CheckIcon className="h-5 w-5" />
          ) : (
            <DuplicateIcon className="h-5 w-5" />
          )}
        </button>
      </Tooltip>
    </Row>
  )
}
