import React, { useState } from 'react'
import { CheckIcon, DuplicateIcon } from '@heroicons/react/outline'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'
import { IconButton } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import { Col } from 'web/components/layout/col'
import LinkIcon from 'web/lib/icons/link-icon'

const SimpleLinkButton = (props: {
  url: string
  className?: string
  tooltip: string
}) => {
  const { url, tooltip, className } = props

  return (
    <Tooltip text={tooltip} placement="bottom" noTap noFade>
      <IconButton
        size="2xs"
        onClick={() => {
          copyToClipboard(url)
          toast.success('Link copied!')
          track('copy share link')
        }}
        className={className}
      >
        <Col className={'items-center gap-x-2 sm:flex-row'}>
          <LinkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
        </Col>
      </IconButton>
    </Tooltip>
  )
}

export function CopyLinkButton(props: {
  url: string
  linkOnlyProps?: {
    tooltip: string
    className?: string
  }
  displayUrl?: string
  tracking?: string
}) {
  const { url, displayUrl, tracking, linkOnlyProps } = props
  const { className, tooltip } = linkOnlyProps ?? {}

  // "copied" success state animations
  const [bgPressed, setBgPressed] = useState(false)
  const [iconPressed, setIconPressed] = useState(false)

  if (linkOnlyProps) {
    return (
      <SimpleLinkButton
        url={url}
        tooltip={tooltip ?? 'Copy link'}
        className={className}
      />
    )
  }

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
