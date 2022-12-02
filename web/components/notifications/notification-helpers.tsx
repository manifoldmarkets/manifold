import clsx from 'clsx'
import { getSourceUrl, Notification } from 'common/notification'
import { doc, updateDoc } from 'firebase/firestore'
import Link from 'next/link'
import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { Avatar } from 'web/components/widgets/avatar'
import { Linkify } from 'web/components/widgets/linkify'
import { SiteLink } from 'web/components/widgets/site-link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { db } from 'web/lib/firebase/init'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { truncateLengthType, truncateText } from '../widgets/truncate'
import { groupBy } from 'lodash'

const notification_base_style =
  'relative cursor-pointer text-sm bg-inherit rounded-lg transition-colors'
export const NESTED_NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'hover:bg-indigo-50 p-2'
)
export const PARENT_NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'group pt-3 pb-2'
)
export const NOTIFICATION_STYLE = clsx(
  notification_base_style,
  'p-2 hover:bg-indigo-50'
)
export const NOTIFICATIONS_PER_PAGE = 30
export function getHighlightClass(highlight: boolean) {
  return highlight ? 'opacity-100' : 'opacity-60'
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
    <span className="font-semibold transition-colors hover:text-indigo-500">
      {truncateText(text, truncatedLength ?? 'xl')}
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
  if (truncatedLength && title) {
    title = truncateText(title, truncatedLength)
  }

  if (ignoreClick) return <span className={'font-bold '}>{title}</span>
  return (
    <SiteLink
      className={'relative font-semibold hover:text-indigo-500'}
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
  children: React.ReactNode
  icon: ReactNode
  link?: string
  onClick?: () => void
  subtitle?: string | ReactNode
  isChildOfGroup?: boolean
}) {
  const {
    notification,
    isChildOfGroup,
    highlighted,
    children,
    icon,
    subtitle,
    onClick,
    link,
  } = props
  const isMobile = useIsMobile()
  const frameObject = (
    <>
      <Row className="gap-2 text-sm text-gray-900 md:text-base">
        <Row className="w-full gap-3">
          <Col className="w-fit">{icon}</Col>
          <Col className="font w-full">
            <div className="whitespace-pre-wrap">
              <span>{children}</span>
            </div>
            <div className="mt-1 text-xs md:text-sm">{subtitle}</div>
            {isMobile && (
              <div className="-mt-0.5 w-fit md:-mt-1">
                <RelativeTimestamp
                  time={notification.createdTime}
                  className="-ml-1 text-xs font-light text-gray-900"
                  placement={'right-start'}
                />
              </div>
            )}
          </Col>
        </Row>
        {!isMobile && (
          <Row className="w-30 mx-1 justify-end">
            <RelativeTimestamp
              time={notification.createdTime}
              className="text-xs font-light text-gray-900"
              placement={'right-start'}
            />
          </Row>
        )}
        <Col className="w-4">
          {highlighted && (
            <div className="bg-highlight-blue mx-auto my-auto h-3 w-3 rounded-full" />
          )}
        </Col>
      </Row>
    </>
  )

  if (link) {
    return (
      <SiteLink
        href={link}
        className={clsx(
          'group flex w-full flex-col',
          isChildOfGroup ? NESTED_NOTIFICATION_STYLE : NOTIFICATION_STYLE,
          getHighlightClass(highlighted)
        )}
        followsLinkClass={false}
      >
        {frameObject}
      </SiteLink>
    )
  }
  return (
    <Col
      className={clsx(
        'group w-full',
        isChildOfGroup ? NESTED_NOTIFICATION_STYLE : NOTIFICATION_STYLE,
        getHighlightClass(highlighted)
      )}
      onClick={onClick}
    >
      {frameObject}
    </Col>
  )
}

export const markNotificationsAsSeen = async (
  notifications: Notification[]
) => {
  const unseenNotifications = notifications.filter((n) => !n.isSeen)
  return await Promise.all(
    unseenNotifications.map((n) => {
      const notificationDoc = doc(db, `users/${n.userId}/notifications/`, n.id)
      return updateDoc(notificationDoc, { isSeen: true, viewTime: new Date() })
    })
  )
}

export function ParentNotificationHeader(props: {
  header: ReactNode
  highlighted: boolean
}) {
  const { header, highlighted } = props
  const highlightedClass = getHighlightClass(highlighted)
  return (
    <Row
      className={clsx(
        'mx-2 items-center justify-start text-sm text-gray-900 md:text-base'
      )}
    >
      <div className={highlightedClass}>{header}</div>
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
          otherNotifications: notifications,
        },
      }
    }
  )

  return newNotifications as Notification[]
}
