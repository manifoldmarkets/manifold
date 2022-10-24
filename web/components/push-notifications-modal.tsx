import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'

import { PrivateUser } from 'common/user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'

export function PushNotificationsModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
  privateUser: PrivateUser
  notifications: number
}) {
  const { isOpen, setOpen, privateUser, notifications } = props
  //eslint-disable-next-line
  const setPushTokenRequestDenied = async (userId: string) => {
    console.log('push token denied', userId)
    // TODO: at some point in the future we can ask them again
    updatePrivateUser(userId, {
      rejectedPushNotificationsOn: Date.now(),
    })
  }
  const showSystemDialog = () => {
    ;(window as any).ReactNativeWebView.postMessage(
      'promptEnablePushNotifications'
    )
  }

  useEffect(() => {
    if (!(window as any).isNative) return
    // TODO: if the user uninstalls the app the notification permission will be invalid
    //  so we have to figure out if it's valid, and if not, re-request it. We maye just want
    //  to set pushToken to null in case we get a pushReceipt with DeviceNotRegistered, see https://docs.expo.dev/push-notifications/sending-notifications/#push-receipt-errors
    if (
      !privateUser.pushToken &&
      !privateUser.rejectedPushNotificationsOn &&
      notifications > 10
    ) {
      // show modal in 3 seconds
      const openTimer = setTimeout(() => {
        setOpen(true)
      }, 3000)
      return () => clearTimeout(openTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
