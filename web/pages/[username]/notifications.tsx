import { CreatorContractsList } from 'web/components/contract/contracts-list'
import { Tabs } from 'web/components/layout/tabs'
import { useUser } from 'web/hooks/use-user'
import { useEffect, useState } from 'react'
import { listenForBets } from 'web/lib/firebase/bets'
import { Notification } from 'common/notification'
import { listenForNotifications } from 'web/lib/firebase/notifications'
import { useRouter } from 'next/router'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { Avatar } from 'web/components/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'

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
    return <></>
  }
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
                <div>
                  {notifications &&
                    notifications.map((notification) => (
                      <Notification notification={notification} />
                    ))}
                </div>
              ),
              tabIcon: (
                <div className="px-0.5 font-bold">
                  {notifications?.length || 0}
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
  const [sourceUrl, setSourceUrl] = useState<string>()
  useEffect(() => {
    if (!notification.sourceContractId) return

    getContractFromId(notification.sourceContractId).then((contract) => {
      switch (notification.sourceType) {
        case 'bet':
          // todo: no bet notifications yet
          break
        case 'answer':
          setSourceUrl(
            `/${contract?.creatorUsername}/${contract?.slug}/#answer-${notification.sourceId}`
          )
          break
        case 'comment':
          setSourceUrl(
            `/${contract?.creatorUsername}/${contract?.slug}/#${notification.sourceId}`
          )
          break
        case 'contract':
          setSourceUrl(`/${contract?.creatorId}/${contract?.slug}`)
          break
      }
    })
  }, [notification])

  return (
    <div className={'cursor-pointer'}>
      <a href={sourceUrl}>
        <Row className={'items-center justify-start p-2'}>
          <Avatar
            avatarUrl={notification.sourceUserAvatarUrl}
            size={'sm'}
            className={'mr-2'}
            username={notification.sourceUserName}
            noLink={true}
          />
          {notification.reasonText}
        </Row>
      </a>
      <br />
      <br />
    </div>
  )
}
