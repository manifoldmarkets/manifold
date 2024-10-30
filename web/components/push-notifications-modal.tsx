import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { PrivateUser, User, humanish } from 'common/user'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { postMessageToNative } from 'web/lib/native/post-message'
import dayjs from 'dayjs'
import { formatMoney } from 'common/util/format'
import { PUSH_NOTIFICATION_BONUS } from 'common/economy'
import { api } from 'web/lib/api/api'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { nativeToWebMessageType } from 'common/native-message'
import { MesageTypeMap } from 'common/native-message'
import { useEvent } from 'web/hooks/use-event'

export function PushNotificationsModal(props: {
  privateUser: PrivateUser
  user: User
  totalNotifications: number
}) {
  const { privateUser, user, totalNotifications } = props
  const [open, setOpen] = useState(false)
  const [showHowToEnableInSettings, setShowHowToEnableInSettings] =
    useState(false)

  const showEnableSystemNotificationsPrompt = () => {
    postMessageToNative('promptEnablePushNotifications', {})
  }

  const handleNativeMessage = useEvent(
    async (type: nativeToWebMessageType, data: MesageTypeMap[typeof type]) => {
      const { status } =
        data as MesageTypeMap['pushNotificationPermissionStatus']
      if (status === 'undetermined' && privateUser.pushToken) {
        setOpen(true)
      }
    }
  )
  useNativeMessages(['pushNotificationPermissionStatus'], handleNativeMessage)

  useEffect(() => {
    if (privateUser.pushToken) {
      postMessageToNative('tryToGetPushTokenWithoutPrompt', {})
    }
  }, [privateUser.pushToken])

  useEffect(() => {
    if (privateUser.pushToken) return

    // They said 'sure' to our prompt, but they haven't given us system permissions yet
    if (
      privateUser.interestedInPushNotifications &&
      !privateUser.rejectedPushNotificationsOn
    ) {
      showEnableSystemNotificationsPrompt()
      return
    }

    if (privateUser.lastPromptedToEnablePushNotifications) {
      const lastPrompted = new Date(
        privateUser.lastPromptedToEnablePushNotifications
      )
      const diff = dayjs().diff(dayjs(lastPrompted), 'day')
      if (diff < 30) return
    }
    // They said yes to our prompt, but no to the system prompt
    else if (privateUser.rejectedPushNotificationsOn) {
      const lastRejectedSystemPrompt = new Date(
        privateUser.rejectedPushNotificationsOn
      )
      const diff = dayjs().diff(dayjs(lastRejectedSystemPrompt), 'day')
      if (diff < 30) return
    }
    // Undefined if they haven't seen our prompt yet, and false if they said no to our prompt
    else if (privateUser.interestedInPushNotifications === false) {
      const createdOn = new Date(user.createdTime)
      const diff = dayjs().diff(dayjs(createdOn), 'day')
      if (diff < 30) return
    }

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

  useEffect(() => {
    if (open) {
      api('me/private/update', {
        lastPromptedToEnablePushNotifications: Date.now(),
      })
    }
  }, [open])

  const bonusEligible = humanish(user) && !privateUser.pushToken

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="bg-canvas-0 text-ink-1000 w-full justify-start gap-3 rounded-md px-8 py-6">
        <span className="text-primary-700 mb-2 text-2xl font-semibold">
          Enable push notifications
          {bonusEligible && (
            <>
              , earn{' '}
              <span className={'text-teal-500'}>
                {formatMoney(PUSH_NOTIFICATION_BONUS)}
              </span>
            </>
          )}
        </span>
        {!showHowToEnableInSettings && (
          <span className={'text-ink-700'}>
            Get the most out of Manifold: replies, breaking market news, and
            direct messages.
          </span>
        )}
        {showHowToEnableInSettings ? (
          <Col className={'justify-between gap-2'}>
            <Col className={'gap-1 text-lg'}>
              <span>1. Go to your settings</span>
              <span>3. Search & tap Manifold</span>
              <span>2. Tap Notifications</span>
              <span>4. Tap Allow Notifications</span>
              {bonusEligible && (
                <span>
                  5. We'll send you{' '}
                  <span className={'font-semibold text-teal-500'}>
                    {formatMoney(PUSH_NOTIFICATION_BONUS)}!
                  </span>
                </span>
              )}
            </Col>
            <Button
              size={'xl'}
              className={'mt-4'}
              color={'indigo-outline'}
              onClick={() => {
                postMessageToNative('tryToGetPushTokenWithoutPrompt', {})
                setOpen(false)
              }}
            >
              Done
            </Button>
          </Col>
        ) : (
          <Col className={'flex-col-reverse justify-between gap-2 sm:flex-row'}>
            <Button
              size={'lg'}
              className={'mt-4 !font-medium'}
              onClick={() => {
                api('update-notif-settings', {
                  type: 'opt_out_all',
                  medium: 'mobile',
                  enabled: true,
                })
                if (privateUser.pushToken) {
                  api('me/private/update', {
                    pushToken: 'delete',
                  })
                }
                setOpen(false)
              }}
              color={'gray-white'}
            >
              No thanks
            </Button>
            <Button
              size={'lg'}
              className={'mt-4'}
              onClick={() => {
                api('update-notif-settings', {
                  type: 'opt_out_all',
                  medium: 'mobile',
                  enabled: false,
                })
                if (!!privateUser.rejectedPushNotificationsOn) {
                  postMessageToNative('tryToGetPushTokenWithoutPrompt', {})
                  setShowHowToEnableInSettings(true)
                  return
                }
                showEnableSystemNotificationsPrompt()
                setOpen(false)
              }}
            >
              <span>
                Enable notifications
                {bonusEligible && (
                  <>
                    {' '}
                    for{' '}
                    <span className={'ml-1 text-teal-400'}>
                      {formatMoney(PUSH_NOTIFICATION_BONUS)}
                    </span>
                  </>
                )}
              </span>
            </Button>
          </Col>
        )}
      </Col>
    </Modal>
  )
}
