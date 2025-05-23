import { ComponentProps, useState } from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import { track, trackShareEvent } from 'web/lib/service/analytics'
import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'
import {
  Button,
  ColorType,
  IconButton,
  SizeType,
} from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import LinkIcon from 'web/lib/icons/link-icon.svg'
import { NativeShareData } from 'common/native-share-data'
import {
  CheckIcon,
  ClipboardCopyIcon,
  DuplicateIcon,
} from '@heroicons/react/outline'
import { getNativePlatform } from 'web/lib/native/is-native'
import { useBrowserOS } from 'web/hooks/use-browser-os'
import { ShareIcon } from '@heroicons/react/outline'
import { postMessageToNative } from 'web/lib/native/post-message'
import { useNativeInfo } from '../native-message-provider'
import { LuShare } from 'react-icons/lu'

export function CopyLinkOrShareButton(props: {
  url: string
  eventTrackingName: string // was type ShareEventName — why??
  tooltip?: string
  className?: string
  size?: SizeType
  children?: React.ReactNode
  color?: ColorType
  trackingInfo?: {
    contractId: string
  }
}) {
  const {
    url,
    size,
    children,
    eventTrackingName,
    className,
    tooltip,
    color,
    trackingInfo,
  } = props
  const { isNative, platform } = useNativeInfo()
  const { os } = useBrowserOS()

  const onClick = () => {
    if (!url) return
    copyToClipboard(url)
    if (!isNative) toast.success('Link copied!')
    trackShareEvent(eventTrackingName, url, trackingInfo)
  }

  return (
    <ToolTipOrDiv
      hasChildren={!!children}
      text={tooltip ?? 'Copy link'}
      noTap
      placement="bottom"
    >
      <Button
        onClick={onClick}
        className={className}
        disabled={!url}
        size={size}
        color={color ?? 'gray-white'}
      >
        {(isNative && platform === 'ios') || os === 'ios' ? (
          <LuShare
            className={clsx('h-[1.4rem] w-[1.1rem]')}
            strokeWidth={'2.5'}
          />
        ) : (isNative && platform === 'android') || os === 'android' ? (
          <ShareIcon strokeWidth={'2.5'} className={clsx('h-[1.4rem]')} />
        ) : (
          <LinkIcon
            strokeWidth={'2.5'}
            className={clsx('h-[1.1rem]')}
            aria-hidden="true"
          />
        )}
        {children}
      </Button>
    </ToolTipOrDiv>
  )
}

const ToolTipOrDiv = (
  props: { hasChildren: boolean } & ComponentProps<typeof Tooltip>
) =>
  props.hasChildren ? (
    <>{props.children}</>
  ) : (
    <Tooltip text={props.text} noTap placement="bottom">
      {' '}
      {props.children}
    </Tooltip>
  )

export const CopyLinkRow = (props: {
  url: string
  eventTrackingName: string
  linkBoxClassName?: string
  linkButtonClassName?: string
}) => {
  const { url, eventTrackingName, linkBoxClassName, linkButtonClassName } =
    props

  const { isNative } = useNativeInfo()

  // "copied" success state animations
  const [bgPressed, setBgPressed] = useState(false)
  const [iconPressed, setIconPressed] = useState(false)

  const onClick = () => {
    if (!url) return

    setBgPressed(true)
    setIconPressed(true)
    setTimeout(() => setBgPressed(false), 300)
    setTimeout(() => setIconPressed(false), 1000)
    copyToClipboard(url)
    if (!isNative) toast.success('Link copied!')

    trackShareEvent(eventTrackingName, url)
  }

  // remove any http:// prefix
  const displayUrl = url?.replace(/^https?:\/\//, '') ?? ''

  return (
    <button
      className={clsx(
        'border-ink-300 flex select-none items-center justify-between rounded border px-4 py-2 text-sm transition-colors duration-700',
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
      <div className={linkButtonClassName}>
        {!iconPressed ? (
          <DuplicateIcon className="h-5 w-5" />
        ) : (
          <CheckIcon className="h-5 w-5" />
        )}
      </div>
    </button>
  )
}

export function SimpleCopyTextButton(props: {
  text: string
  eventTrackingName: string // was type ShareEventName — why??
  tooltip?: string
  className?: string
}) {
  const { text, eventTrackingName, className, tooltip } = props
  const { isNative } = getNativePlatform()

  const onClick = () => {
    if (!text) return
    if (isNative) {
      // If we want to extend this: iOS can use a url and a message, Android can use a title and a message.
      postMessageToNative('share', {
        message: text,
      } as NativeShareData)
    }

    copyToClipboard(text)
    if (!isNative) toast.success('Link copied!')
    track(eventTrackingName, { text })
  }

  return (
    <IconButton onClick={onClick} className={className} disabled={!text}>
      <Tooltip text={tooltip ?? 'Copy link'} noTap placement="bottom">
        <ClipboardCopyIcon className={'h-5'} aria-hidden="true" />
      </Tooltip>
    </IconButton>
  )
}
