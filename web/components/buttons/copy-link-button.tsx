import React, { useState } from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'
import { IconButton } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import { Col } from 'web/components/layout/col'
import LinkIcon from 'web/lib/icons/link-icon'
import { postMessageToNative } from 'web/components/native-message-listener'
import { NativeShareData } from 'common/native-share-data'
import { CheckIcon, DuplicateIcon } from '@heroicons/react/outline'
import ArrowUpSquareIcon from 'web/lib/icons/arrow-up-square-icon'
import { getIsNative } from 'web/lib/native/is-native'

export function CopyLinkButton(props: {
  url: string
  linkIconOnlyProps?: {
    tooltip: string
    className?: string
  }
  displayUrl?: string
  tracking?: string
}) {
  const { url, displayUrl, tracking, linkIconOnlyProps } = props
  const { className, tooltip } = linkIconOnlyProps ?? {}
  // TODO: this is resulting in hydration errors on mobile dev
  const isNative = getIsNative()

  // "copied" success state animations
  const [bgPressed, setBgPressed] = useState(false)
  const [iconPressed, setIconPressed] = useState(false)

  const onClick = () => {
    if (isNative) {
      // If we want to extend this: iOS can use a url and a message, Android can use a title and a message.
      postMessageToNative('share', {
        message: url,
      } as NativeShareData)
    } else if (linkIconOnlyProps) {
      copyToClipboard(url)
      toast.success('Link copied!')
    } else {
      setBgPressed(true)
      setIconPressed(true)
      setTimeout(() => setBgPressed(false), 300)
      setTimeout(() => setIconPressed(false), 1000)
      copyToClipboard(url)
    }
    track(tracking ?? 'copy share link')
  }

  const Button = (props: { onClick: () => void }) => {
    const { onClick } = props
    return (
      <Tooltip
        text={tooltip ?? iconPressed ? 'Copied!' : 'Copy link'}
        placement="bottom"
        noTap
        noFade
      >
        <IconButton size="2xs" onClick={onClick} className={className}>
          <Col className={'items-center gap-x-2 sm:flex-row'}>
            {isNative ? (
              <ArrowUpSquareIcon className={'h-5 w-5'} />
            ) : linkIconOnlyProps ? (
              <LinkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
            ) : iconPressed ? (
              <CheckIcon className="h-5 w-5" />
            ) : (
              <DuplicateIcon className="h-5 w-5" />
            )}
          </Col>
        </IconButton>
      </Tooltip>
    )
  }

  if (linkIconOnlyProps) return <Button onClick={onClick} />

  return (
    <Row
      className={clsx(
        'items-center rounded border bg-gray-50 text-sm text-gray-500 transition-colors duration-700',
        bgPressed ? 'bg-indigo-50 text-indigo-500 transition-none' : ''
      )}
    >
      <div className="ml-3 w-full select-all truncate">{displayUrl ?? url}</div>
      <Button onClick={onClick} />
    </Row>
  )
}
