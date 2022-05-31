import { Tabs } from 'web/components/layout/tabs'
import { useUser } from 'web/hooks/use-user'
import React, { useEffect, useState } from 'react'
import { Notification } from 'common/notification'
import { listenForNotifications } from 'web/lib/firebase/notifications'
import { Contract, getContractFromId } from 'web/lib/firebase/contracts'
import { Avatar } from 'web/components/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { Answer } from 'web/lib/firebase/answers'
import { Comment } from 'web/lib/firebase/comments'
import { getValue } from 'web/lib/firebase/utils'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/user-page'
import { Linkify } from 'web/components/linkify'

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
      <div className={'p-4'}>
        <Title text={'Notifications'} />
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

function Notification(props: { notification: Notification }) {
  const { notification } = props
  const {
    sourceType,
    sourceContractId,
    sourceId,
    userId,
    id,
    sourceUserName,
    sourceUserAvatarUrl,
    reasonText,
    sourceUserUserName,
    createdTime,
  } = notification
  const [sourceUrl, setSourceUrl] = useState<string>()
  const [subText, setSubText] = useState<string>('')
  const [contract, setContract] = useState<Contract | null>()

  useEffect(() => {
    if (!sourceType || !sourceContractId || !sourceId) return

    getContractFromId(sourceContractId).then((contract) => {
      switch (sourceType) {
        case 'answer':
          setSourceUrl(
            `/${contract?.creatorUsername}/${contract?.slug}#answer-${sourceId}`
          )
          break
        case 'comment':
          setSourceUrl(
            `/${contract?.creatorUsername}/${contract?.slug}#${sourceId}`
          )
          break
        case 'contract':
          setSourceUrl(`/${contract?.creatorUsername}/${contract?.slug}`)
          break
      }
      setContract(contract)
    })

    updateDoc(doc(db, `users/${userId}/notifications/`, id), {
      ...notification,
      isSeen: true,
      viewTime: new Date(),
    })
  }, [notification])

  useEffect(() => {
    if (!sourceType || !sourceContractId || !sourceId) return
    switch (sourceType) {
      case 'comment':
        getValue<Comment>(
          doc(db, `contracts/${sourceContractId}/comments/`, sourceId)
        ).then((comment) => {
          setSubText(comment?.text || '')
        })
        break
      case 'contract':
        getValue<Contract>(doc(db, `contracts/`, sourceId)).then((contract) => {
          setSubText(contract?.question || '')
          setContract(contract)
        })
        break
      case 'answer':
        getValue<Answer>(
          doc(db, `contracts/${sourceContractId}/answers/`, sourceId)
        ).then((answer) => {
          setSubText(answer?.text || '')
        })
        break
    }
  }, [notification])

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
    <div className={' bg-white px-4 pt-6'}>
      <Row className={'items-center text-gray-500 sm:justify-start'}>
        <Avatar
          avatarUrl={sourceUserAvatarUrl}
          size={'sm'}
          className={'mr-2'}
          username={sourceUserName}
        />
        <div className={'flex-1'}>
          <UserLink
            name={sourceUserName || ''}
            username={sourceUserUserName || ''}
            className={'mr-0 flex-shrink-0'}
          />
          <a href={sourceUrl} className={'flex-1 pl-1'}>
            {reasonText}
            {contract && sourceId && (
              <div className={'inline'}>
                <CopyLinkDateTimeComponent
                  contract={contract}
                  createdTime={createdTime}
                  elementId={getSourceIdForLinkComponent(sourceId)}
                />
              </div>
            )}
          </a>
        </div>
      </Row>
      <a href={sourceUrl}>
        <div className={'ml-4 mt-1'}>
          {' '}
          {contract && subText === contract.question ? (
            <div className={'text-md text-indigo-700 hover:underline'}>
              {subText}
            </div>
          ) : (
            <Linkify text={subText} />
          )}
        </div>

        <div className={'mt-6 border-b border-gray-300'} />
      </a>
    </div>
  )
}
