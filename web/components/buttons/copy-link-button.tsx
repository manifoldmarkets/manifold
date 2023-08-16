import { useState } from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import { trackShareEvent } from 'web/lib/service/analytics'
import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'
import { IconButton } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import LinkIcon from 'web/lib/icons/link-icon'
import { postMessageToNative } from 'web/components/native-message-listener'
import { NativeShareData } from 'common/native-share-data'
import { CheckIcon, DuplicateIcon } from '@heroicons/react/outline'
import ArrowUpSquareIcon from 'web/lib/icons/arrow-up-square-icon'
import { getNativePlatform } from 'web/lib/native/is-native'
import { useBrowserOS } from 'web/hooks/use-browser-os'
import { ShareIcon } from '@heroicons/react/outline'

export function CopyLinkOrShareButton(props: {
  url: string
  eventTrackingName: string // was type ShareEventName — why??
  tooltip?: string
  className?: string
}) {
  const { url, eventTrackingName, className, tooltip } = props
  // TODO: this is resulting in hydration errors on mobile dev
  const { isNative, platform } = getNativePlatform()
  const { os } = useBrowserOS()

  const onClick = () => {
    if (!url) return
    if (isNative) {
      // If we want to extend this: iOS can use a url and a message, Android can use a title and a message.
      postMessageToNative('share', {
        message: url,
      } as NativeShareData)
    }

    copyToClipboard(url)
    toast.success('Link copied!')
    trackShareEvent(eventTrackingName, url)
  }

  return (
    <IconButton onClick={onClick} className={className} disabled={!url}>
      <Tooltip text={tooltip ?? 'Copy link'} noTap placement="bottom">
        {(isNative && platform === 'ios') || os === 'ios' ? (
          <ArrowUpSquareIcon className={'h-[1.4rem]'} />
        ) : (isNative && platform === 'android') || os === 'android' ? (
          <ShareIcon strokeWidth={'2.5'} className={'h-[1.4rem]'} />
        ) : (
          <LinkIcon strokeWidth={'2.5'} className={'h-5'} aria-hidden="true" />
        )}
      </Tooltip>
    </IconButton>
  )
}

export const CopyLinkRow = (props: {
  url?: string // required if not loading
  eventTrackingName: string
  linkBoxClassName?: string
  linkButtonClassName?: string
}) => {
  const { url, eventTrackingName, linkBoxClassName, linkButtonClassName } =
    props

  // TODO: this is resulting in hydration errors on mobile dev
  const { isNative, platform } = getNativePlatform()
  const { os } = useBrowserOS()

  // "copied" success state animations
  const [bgPressed, setBgPressed] = useState(false)
  const [iconPressed, setIconPressed] = useState(false)

  const onClick = () => {
    if (!url) return
    if (isNative) {
      // If we want to extend this: iOS can use a url and a message, Android can use a title and a message.
      postMessageToNative('share', {
        message: url,
      } as NativeShareData)
    }

    setBgPressed(true)
    setIconPressed(true)
    setTimeout(() => setBgPressed(false), 300)
    setTimeout(() => setIconPressed(false), 1000)
    copyToClipboard(url)
    toast.success('Link copied!')

    trackShareEvent(eventTrackingName, url)
  }

  // remove any http:// prefix
  const displayUrl = url?.replace(/^https?:\/\//, '') ?? ''

  return (
    <button
      className={clsx(
        'flex select-none items-center justify-between rounded border px-4 py-2 text-sm transition-colors duration-700',
        bgPressed
          ? 'bg-primary-50 text-primary-500 transition-none'
          : 'bg-canvas-50 text-ink-500',
        'disabled:h-9 disabled:animate-pulse',
        linkBoxClassName
      )}
      disabled={!url}
      onClick={onClick}
    >
      <div className={'select-all truncate'}>{displayUrl}</div>
      {url && (
        <div className={linkButtonClassName}>
          {iconPressed ? (
            (isNative && platform === 'ios') || os === 'ios' ? (
              <ArrowUpSquareIcon className={'h-[1.4rem]'} />
            ) : (isNative && platform === 'android') || os === 'android' ? (
              <ShareIcon strokeWidth={'2.5'} className={'h-[1.4rem]'} />
            ) : (
              <DuplicateIcon className="h-5 w-5" />
            )
          ) : (
            <CheckIcon className="h-5 w-5" />
          )}
        </div>
      )}
    </button>
  )
}
