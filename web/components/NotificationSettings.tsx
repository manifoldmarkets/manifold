import { useUser } from 'web/hooks/use-user'
import React, { useEffect, useState } from 'react'
import { notification_subscribe_types, PrivateUser } from 'common/user'
import { listenForPrivateUser, updatePrivateUser } from 'web/lib/firebase/users'
import toast from 'react-hot-toast'
import { track } from '@amplitude/analytics-browser'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { CheckIcon, XIcon } from '@heroicons/react/outline'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { Col } from 'web/components/layout/col'
import { FollowMarketModal } from 'web/components/contract/follow-market-modal'

export function NotificationSettings() {
  const user = useUser()
  const [notificationSettings, setNotificationSettings] =
    useState<notification_subscribe_types>('all')
  const [emailNotificationSettings, setEmailNotificationSettings] =
    useState<notification_subscribe_types>('all')
  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (user) listenForPrivateUser(user.id, setPrivateUser)
  }, [user])

  useEffect(() => {
    if (!privateUser) return
    if (privateUser.notificationPreferences) {
      setNotificationSettings(privateUser.notificationPreferences)
    }
    if (
      privateUser.unsubscribedFromResolutionEmails &&
      privateUser.unsubscribedFromCommentEmails &&
      privateUser.unsubscribedFromAnswerEmails
    ) {
      setEmailNotificationSettings('none')
    } else if (
      !privateUser.unsubscribedFromResolutionEmails &&
      !privateUser.unsubscribedFromCommentEmails &&
      !privateUser.unsubscribedFromAnswerEmails
    ) {
      setEmailNotificationSettings('all')
    } else {
      setEmailNotificationSettings('less')
    }
  }, [privateUser])

  const loading = 'Changing Notifications Settings'
  const success = 'Notification Settings Changed!'
  function changeEmailNotifications(newValue: notification_subscribe_types) {
    if (!privateUser) return
    if (newValue === 'all') {
      toast.promise(
        updatePrivateUser(privateUser.id, {
          unsubscribedFromResolutionEmails: false,
          unsubscribedFromCommentEmails: false,
          unsubscribedFromAnswerEmails: false,
        }),
        {
          loading,
          success,
          error: (err) => `${err.message}`,
        }
      )
    } else if (newValue === 'less') {
      toast.promise(
        updatePrivateUser(privateUser.id, {
          unsubscribedFromResolutionEmails: false,
          unsubscribedFromCommentEmails: true,
          unsubscribedFromAnswerEmails: true,
        }),
        {
          loading,
          success,
          error: (err) => `${err.message}`,
        }
      )
    } else if (newValue === 'none') {
      toast.promise(
        updatePrivateUser(privateUser.id, {
          unsubscribedFromResolutionEmails: true,
          unsubscribedFromCommentEmails: true,
          unsubscribedFromAnswerEmails: true,
        }),
        {
          loading,
          success,
          error: (err) => `${err.message}`,
        }
      )
    }
  }

  function changeInAppNotificationSettings(
    newValue: notification_subscribe_types
  ) {
    if (!privateUser) return
    track('In-App Notification Preferences Changed', {
      newPreference: newValue,
      oldPreference: privateUser.notificationPreferences,
    })
    toast.promise(
      updatePrivateUser(privateUser.id, {
        notificationPreferences: newValue,
      }),
      {
        loading,
        success,
        error: (err) => `${err.message}`,
      }
    )
  }

  useEffect(() => {
    if (privateUser && privateUser.notificationPreferences)
      setNotificationSettings(privateUser.notificationPreferences)
    else setNotificationSettings('all')
  }, [privateUser])

  if (!privateUser) {
    return <LoadingIndicator spinnerClassName={'border-gray-500 h-4 w-4'} />
  }

  function NotificationSettingLine(props: {
    label: string | React.ReactNode
    highlight: boolean
    onClick?: () => void
  }) {
    const { label, highlight, onClick } = props
    return (
      <Row
        className={clsx(
          'my-1 gap-1 text-gray-300',
          highlight && '!text-black',
          onClick ? 'cursor-pointer' : ''
        )}
        onClick={onClick}
      >
        {highlight ? <CheckIcon height={20} /> : <XIcon height={20} />}
        {label}
      </Row>
    )
  }

  return (
    <div className={'p-2'}>
      <div>In App Notifications</div>
      <ChoicesToggleGroup
        currentChoice={notificationSettings}
        choicesMap={{ All: 'all', Less: 'less', None: 'none' }}
        setChoice={(choice) =>
          changeInAppNotificationSettings(
            choice as notification_subscribe_types
          )
        }
        className={'col-span-4 p-2'}
        toggleClassName={'w-24'}
      />
      <div className={'mt-4 text-sm'}>
        <Col className={''}>
          <Row className={'my-1'}>
            You will receive notifications for these general events:
          </Row>
          <NotificationSettingLine
            highlight={notificationSettings !== 'none'}
            label={"Income & referral bonuses you've received"}
          />
          <Row className={'my-1'}>
            You will receive new comment, answer, & resolution notifications on
            questions:
          </Row>
          <NotificationSettingLine
            highlight={notificationSettings !== 'none'}
            label={
              <span>
                That <span className={'font-bold'}>you watch </span>- you
                auto-watch questions if:
              </span>
            }
            onClick={() => setShowModal(true)}
          />
          <Col
            className={clsx(
              'mb-2 ml-8',
              'gap-1 text-gray-300',
              notificationSettings !== 'none' && '!text-black'
            )}
          >
            <Row>• You create it</Row>
            <Row>• You bet, comment on, or answer it</Row>
            <Row>• You add liquidity to it</Row>
            <Row>
              • If you select 'Less' and you've commented on or answered a
              question, you'll only receive notification on direct replies to
              your comments or answers
            </Row>
          </Col>
        </Col>
      </div>
      <div className={'mt-4'}>Email Notifications</div>
      <ChoicesToggleGroup
        currentChoice={emailNotificationSettings}
        choicesMap={{ All: 'all', Less: 'less', None: 'none' }}
        setChoice={(choice) =>
          changeEmailNotifications(choice as notification_subscribe_types)
        }
        className={'col-span-4 p-2'}
        toggleClassName={'w-24'}
      />
      <div className={'mt-4 text-sm'}>
        <div>
          You will receive emails for:
          <NotificationSettingLine
            label={"Resolution of questions you're betting on"}
            highlight={emailNotificationSettings !== 'none'}
          />
          <NotificationSettingLine
            label={'Closure of your questions'}
            highlight={emailNotificationSettings !== 'none'}
          />
          <NotificationSettingLine
            label={'Activity on your questions'}
            highlight={emailNotificationSettings === 'all'}
          />
          <NotificationSettingLine
            label={"Activity on questions you've answered or commented on"}
            highlight={emailNotificationSettings === 'all'}
          />
        </div>
      </div>
      <FollowMarketModal setOpen={setShowModal} open={showModal} />
    </div>
  )
}
