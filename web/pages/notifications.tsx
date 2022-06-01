import { Tabs } from 'web/components/layout/tabs'
import { useUser } from 'web/hooks/use-user'
import React, { useEffect, useState } from 'react'
import {
  Notification,
  notification_reason_types,
  notification_source_types,
} from 'common/notification'
import { listenForNotifications } from 'web/lib/firebase/notifications'
import { Avatar } from 'web/components/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { Answer } from 'common/answer'
import { Comment } from 'web/lib/firebase/comments'
import { getValue } from 'web/lib/firebase/utils'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/user-page'
import { User } from 'common/user'
import { useContract } from 'web/hooks/use-contract'
import { Contract } from 'common/contract'

export default function Notifications() {
  const user = useUser()
  const [notifications, setNotifications] = useState<
    Notification[] | undefined
  >()

  useEffect(() => {
    if (user) return listenForNotifications(user.id, setNotifications)
  }, [user])

  if (!user) {
    // TODO: return sign in page
    return <Custom404 />
  }

  // TODO: use infinite scroll
  return (
    <Page>
      <div className={'p-2 sm:p-4'}>
        <Title text={'Notifications'} className={'hidden sm:block'} />
        <Tabs
          className={'pb-2 pt-1 '}
          defaultIndex={0}
          tabs={[
            {
              title: 'All Notifications',
              content: (
                <div className={''}>
                  {notifications &&
                    notifications.map((notification) => (
                      <Notification
                        currentUser={user}
                        notification={notification}
                        key={notification.id}
                      />
                    ))}
                </div>
              ),
            },
          ]}
        />
      </div>
    </Page>
  )
}

function Notification(props: {
  currentUser: User
  notification: Notification
}) {
  const { notification, currentUser } = props
  const {
    sourceType,
    sourceContractId,
    sourceId,
    userId,
    id,
    sourceUserName,
    sourceUserAvatarUrl,
    reasonText,
    reason,
    sourceUserUsername,
    createdTime,
  } = notification
  const [subText, setSubText] = useState<string>('')
  const contract = useContract(sourceContractId ?? '')

  useEffect(() => {
    if (!contract) return
    if (sourceType === 'contract') {
      setSubText(contract.question)
    }
  }, [contract, sourceType])

  useEffect(() => {
    if (!sourceContractId || !sourceId) return

    if (sourceType === 'answer') {
      getValue<Answer>(
        doc(db, `contracts/${sourceContractId}/answers/`, sourceId)
      ).then((answer) => {
        setSubText(answer?.text || '')
      })
    } else if (sourceType === 'comment') {
      getValue<Comment>(
        doc(db, `contracts/${sourceContractId}/comments/`, sourceId)
      ).then((comment) => {
        setSubText(comment?.text || '')
      })
    }
  }, [sourceContractId, sourceId, sourceType])

  useEffect(() => {
    if (!contract || !notification || notification.isSeen) return
    updateDoc(doc(db, `users/${currentUser.id}/notifications/`, id), {
      ...notification,
      isSeen: true,
      viewTime: new Date(),
    })
  }, [notification, contract, currentUser, id, userId])

  function getSourceUrl(sourceId?: string) {
    if (!contract) return ''
    return `/${contract.creatorUsername}/${
      contract.slug
    }#${getSourceIdForLinkComponent(sourceId ?? '')}`
  }

  function getSourceIdForLinkComponent(sourceId: string) {
    switch (sourceType) {
      case 'answer':
        return `answer-${sourceId}`
      case 'comment':
        return sourceId
      case 'contract':
        return ''
      default:
        return sourceId
    }
  }

  return (
    <div className={'bg-white px-1 pt-6 sm:px-4'}>
      <Row className={'items-center text-gray-500 sm:justify-start'}>
        <Avatar
          avatarUrl={sourceUserAvatarUrl}
          size={'sm'}
          className={'mr-2'}
          username={sourceUserName}
        />
        <div className={'flex-1 overflow-hidden sm:flex'}>
          <div
            className={
              'flex max-w-sm shrink overflow-hidden text-ellipsis sm:max-w-md'
            }
          >
            <UserLink
              name={sourceUserName || ''}
              username={sourceUserUsername || ''}
              className={'mr-0 flex-shrink-0 text-sm'}
            />
            <a
              href={getSourceUrl(sourceId)}
              className={
                'inline-flex overflow-hidden text-ellipsis pl-1 text-sm '
              }
            >
              {sourceType && reason ? (
                <div className={'inline truncate'}>
                  {getReasonTextFromReason(sourceType, reason, contract)}
                </div>
              ) : (
                reasonText
              )}
            </a>
          </div>
          {contract && sourceId && (
            <CopyLinkDateTimeComponent
              contract={contract}
              createdTime={createdTime}
              elementId={getSourceIdForLinkComponent(sourceId)}
              className={'-mx-1 inline-flex text-sm sm:inline-block'}
            />
          )}
        </div>
      </Row>
      <a href={getSourceUrl(sourceId)}>
        <div className={'mt-1 text-sm sm:text-base'}>
          {' '}
          {contract && subText === contract.question ? (
            <div className={'text-indigo-700 hover:underline'}>{subText}</div>
          ) : (
            <div className={'line-clamp-4 whitespace-pre-line'}>{subText}</div>
          )}
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
}

function getReasonTextFromReason(
  source: notification_source_types,
  reason: notification_reason_types,
  contract: Contract | undefined
) {
  switch (source) {
    case 'comment':
      return `commented on ${contract?.question}`
    case 'contract':
      return `${reason} ${contract?.question}`
    case 'answer':
      return `answered ${contract?.question}`
    default:
      return ''
  }
}
