import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'

import { PrivateUser } from 'common/user'
import { useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { setPushTokenRequestDenied } from 'web/lib/firebase/notifications'

export function PushNotificationsModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
  privateUser: PrivateUser
  notifications: number
}) {
  const { isOpen, setOpen, privateUser, notifications } = props

  const showSystemDialog = () => {
    ;(window as any).ReactNativeWebView.postMessage(
      'promptEnablePushNotifications'
    )
  }

  useEffect(() => {
    if (!(window as any).isNative || privateUser.pushToken) return

    const shouldShowNotificationPrompt =
      privateUser.rejectedPushNotificationsOn === undefined &&
      notifications >= 10

    ;(window as any).ReactNativeWebView.postMessage(
      'tryToGetPushTokenWithoutPrompt'
    )
    if (shouldShowNotificationPrompt) {
      // Show prompt in 3 seconds if we still don't have a push token
      const openTimer = setTimeout(() => {
        setOpen(shouldShowNotificationPrompt)
      }, 3000)
      return () => clearTimeout(openTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privateUser.pushToken])

  if (!(window as any).isNative) return <div />

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <span className="mb-2 text-lg">
          Want notifications when a market resolves?
        </span>
        <Col className={'gap-2'}>
          <span className={'text-indigo-700'}>• Can I opt out later?</span>
          <span className={'ml-2'}>
            Yes! You can go to the 'Opt Out' section of your notification
            settings and tap the 'Mobile' toggle.
          </span>
          <Row className={'justify-between'}>
            <Button
              size={'xl'}
              className={'mt-4 font-normal'}
              onClick={() => {
                setPushTokenRequestDenied(privateUser.id)
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
                showSystemDialog()
                setOpen(false)
              }}
              color={'blue'}
            >
              Sure
            </Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}
