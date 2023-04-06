import clsx from 'clsx'
import { getSourceUrl, Notification } from 'common/notification'
import Link from 'next/link'
import React, { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { Avatar } from 'web/components/widgets/avatar'
import { Linkify } from 'web/components/widgets/linkify'
import { SiteLink } from 'web/components/widgets/site-link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { RelativeTimestampNoTooltip } from '../relative-timestamp'
import { truncateLengthType, truncateText } from '../widgets/truncate'
import NotificationDropdown from './notification-dropdown'
import { groupBy } from 'lodash'

const notification_base_style =
  'relative cursor-pointer text-sm transition-colors'
export const NESTED_NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'hover:bg-primary-50 p-2'
)
export const PARENT_NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'pt-3 pb-2'
)
export const NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'p-2 hover:bg-primary-50'
)
export const NOTIFICATIONS_PER_PAGE = 30
export function getHighlightClass(highlight: boolean) {
  return highlight ? 'opacity-100' : 'opacity-70'
}
export const NUM_SUMMARY_LINES = 3

export const NOTIFICATION_ICON_SIZE = 10

export function PrimaryNotificationLink(props: {
  text: string | undefined
  truncatedLength?: truncateLengthType
}) {
  const { text, truncatedLength } = props
  if (!text) {
    return <></>
  }
  return (
    <span className="hover:text-primary-500 font-semibold transition-colors">
      {truncatedLength ? truncateText(text, truncatedLength ?? 'xl') : text}
    </span>
  )
}

export function QuestionOrGroupLink(props: {
  notification: Notification
  truncatedLength?: truncateLengthType
  ignoreClick?: boolean
}) {
  const { notification, ignoreClick, truncatedLength } = props
  const {
    sourceType,
    sourceContractTitle,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
    sourceTitle,
  } = notification

  let title = sourceContractTitle || sourceTitle
  if (truncatedLength) {
    title = truncateText(title, truncatedLength)
  }

  if (ignoreClick) return <span className={'font-bold '}>{title}</span>
  return (
    <SiteLink
      className={'hover:text-primary-500 relative font-semibold'}
      href={getSourceUrl(notification).split('#')[0]}
      onClick={(e) => {
        e.stopPropagation()
        track('Notification Clicked', {
          type: 'question title',
          sourceType,
          sourceContractTitle,
          sourceContractCreatorUsername,
          sourceContractSlug,
          sourceSlug,
          sourceTitle,
        })
      }}
    >
      {title}
    </SiteLink>
  )
}

export function NotificationTextLabel(props: {
  notification: Notification
  className?: string
}) {
  const { className, notification } = props
  const { sourceText, reasonText } = notification
  const defaultText = sourceText ?? reasonText ?? ''
  return (
    <div className={className ? className : 'line-clamp-4 whitespace-pre-line'}>
      <Linkify text={defaultText} />
    </div>
  )
}

export function AvatarNotificationIcon(props: {
  notification: Notification
  symbol: string | ReactNode
}) {
  const { notification, symbol } = props
  const { sourceUserName, sourceUserAvatarUrl, sourceUserUsername } =
    notification
  const href = `/${sourceUserUsername}`
  return (
    <div className="relative">
      <Link
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        onClick={(e) => e.stopPropagation}
      >
        <Avatar
          username={sourceUserName}
          avatarUrl={sourceUserAvatarUrl}
          size={NOTIFICATION_ICON_SIZE}
          noLink={true}
        />
        <div className="absolute -bottom-2 -right-1 text-lg">{symbol}</div>
      </Link>
    </div>
  )
}

export function NotificationIcon(props: {
  symbol: string
  symbolBackgroundClass: string
}) {
  const { symbol, symbolBackgroundClass } = props
  return (
    <Col
      className={clsx(
        'h-10 w-10 justify-center rounded-full',
        symbolBackgroundClass
      )}
    >
      <div className="mx-auto text-2xl">{symbol}</div>
    </Col>
  )
}

// the primary skeleton for notifications
export function NotificationFrame(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  children: React.ReactNode
  icon: ReactNode
  link?: string
  onClick?: () => void
  subtitle?: string | ReactNode
  isChildOfGroup?: boolean
  customBackground?: ReactNode
}) {
  const {
    notification,
    isChildOfGroup,
    highlighted,
    setHighlighted,
    children,
    icon,
    subtitle,
    onClick,
    link,
    customBackground,
  } = props
  const isMobile = useIsMobile()

  const frameObject = (
    <>
      <Row className="text-ink-900 text-sm md:text-base">
        <Row className="w-full gap-3">
          <Col className="w-fit">{icon}</Col>
          <Col className="font w-full">
            <span>{children}</span>
            <div className="mt-1 text-xs md:text-sm">{subtitle}</div>
            {isMobile && (
              <div className="-mt-0.5 w-fit md:-mt-1">
                <RelativeTimestampNoTooltip
                  time={notification.createdTime}
                  className="text-ink-900 text-xs"
                />
              </div>
            )}
          </Col>
        </Row>
        {!isMobile && (
          <Row className="mx-1 w-40 justify-end">
            <RelativeTimestampNoTooltip
              time={notification.createdTime}
              className="text-ink-900 text-xs"
            />
          </Row>
        )}
      </Row>
    </>
  )

  return (
    <Row
      className={clsx(
        'group relative',
        isChildOfGroup ? NESTED_NOTIFICATION_STYLE : NOTIFICATION_STYLE,
        getHighlightClass(highlighted)
      )}
    >
      {customBackground}
      {link && (
        <Col className={'w-full'}>
          <SiteLink
            href={link}
            className={clsx('flex w-full flex-col')}
            onClick={() => {
              if (highlighted) {
                setHighlighted(false)
              }
            }}
          >
            {frameObject}
          </SiteLink>
        </Col>
      )}
      {!link && (
        <Col
          className={'w-full'}
          onClick={() => {
            if (highlighted) {
              setHighlighted(false)
            }
            if (onClick) {
              onClick()
            }
          }}
        >
          {frameObject}
        </Col>
      )}

      {/* frame end */}
      <div className="self-start">
        <NotificationDropdown notification={notification} />
      </div>
      <div className="-mr-2 flex w-4 items-center justify-center">
        {highlighted && (
          <div className="bg-highlight-blue h-3 w-3 rounded-full" />
        )}
      </div>
    </Row>
  )
}

export function ParentNotificationHeader(props: {
  header: ReactNode
  highlighted: boolean
}) {
  const { header, highlighted } = props
  const highlightedClass = getHighlightClass(highlighted)

  return (
    <Row className={clsx('text-ink-900 mx-2 items-center justify-start')}>
      <div className={clsx(highlightedClass, 'line-clamp-3')}>{header}</div>
    </Row>
  )
}
export function combineReactionNotifications(notifications: Notification[]) {
  const groupedNotificationsBySourceType = groupBy(
    notifications,
    (n) =>
      `${n.sourceType}-${
        n.sourceTitle ?? n.sourceContractTitle ?? n.sourceContractId
      }-${n.sourceText}`
  )

  const newNotifications = Object.values(groupedNotificationsBySourceType).map(
    (notifications) => {
      const mostRecentNotification = notifications[0]

      return {
        ...mostRecentNotification,
        data: {
          ...mostRecentNotification.data,
          relatedNotifications: notifications,
        },
      }
    }
  )

  return newNotifications as Notification[]
}
