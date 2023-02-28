import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'

import { PrivateUser } from 'common/user'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { postMessageToNative } from 'web/components/native-message-listener'
import { getIsNative } from 'web/lib/native/is-native'

export function PushNotificationsModal(props: {
  privateUser: PrivateUser
  totalNotifications: number
}) {
  const { privateUser, totalNotifications } = props
  const [isOpen, setOpen] = useState(false)

  const showSystemNotificationsPrompt = () => {
    postMessageToNative('promptEnablePushNotifications', {})
  }

  useEffect(() => {
    if (
      !getIsNative() ||
      privateUser.pushToken ||
      privateUser.rejectedPushNotificationsOn ||
      privateUser.interestedInPushNotifications === false
    )
      return // They already gave permission, but we haven't written the token to the db yet
    postMessageToNative('tryToGetPushTokenWithoutPrompt', {})

    // They said 'sure' to our prompt, but they haven't given us system permissions yet
    if (privateUser.interestedInPushNotifications === true) {
      return showSystemNotificationsPrompt()
    }

    // They haven't seen our prompt yet
    const shouldShowOurNotificationPrompt = totalNotifications >= 10
    const openTimer = setTimeout(() => {
      setOpen(shouldShowOurNotificationPrompt)
    }, 1000)
    return () => clearTimeout(openTimer)
  }, [
    privateUser.pushToken,
    privateUser.interestedInPushNotifications,
    privateUser.rejectedPushNotificationsOn,
  ])

  if (!getIsNative()) return <div />

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="bg-canvas-0 items-center gap-4 rounded-md px-8 py-6">
        <span className="mb-2 text-lg">
          Want push notifications when a market resolves or when users reply to
          you?
        </span>
        <Col className={'gap-2'}>
          <span className={'text-primary-700'}>• Can I opt out later?</span>
          <span className={'ml-2'}>
            Yes! You can go to the 'Opt Out' section of your notification
            settings and tap the 'Mobile' toggle.
          </span>
          <Row className={'justify-between'}>
            <Button
              size={'xl'}
              className={'mt-4 font-normal'}
              onClick={() => {
                updatePrivateUser(privateUser.id, {
                  interestedInPushNotifications: false,
                })
                setOpen(false)
              }}
              color={'gray'}
            >
              No thanks
            </Button>
            <Button
              size={'xl'}
              className={'mt-4'}
              onClick={() => {
                updatePrivateUser(privateUser.id, {
                  interestedInPushNotifications: true,
                })
                showSystemNotificationsPrompt()
                setOpen(false)
              }}
            >
              Sure
            </Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}
