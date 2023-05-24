import {
  CashIcon,
  ChatIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CurrencyDollarIcon,
  ExclamationIcon,
  InboxInIcon,
  InformationCircleIcon,
  LightBulbIcon,
  RefreshIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { NOTIFICATION_DESCRIPTIONS } from 'common/notification'
import { PrivateUser } from 'common/user'
import {
  notification_destination_types,
  notification_preference,
} from 'common/user-notification-preferences'
import { deleteField } from 'firebase/firestore'
import { uniq } from 'lodash'
import { memo, ReactNode, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SwitchSetting } from 'web/components/switch-setting'

import { updatePrivateUser } from 'web/lib/firebase/users'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/components/native-message-listener'
import { UserWatchedContractsButton } from 'web/components/notifications/watched-markets'
import { useUser } from 'web/hooks/use-user'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import TrophyIcon from 'web/lib/icons/trophy-icon'

export function NotificationSettings(props: {
  navigateToSection: string | undefined
  privateUser: PrivateUser
}) {
  const { navigateToSection, privateUser } = props
  const user = useUser()
  const [showWatchModal, setShowWatchModal] = useState(false)
  const isNative = getIsNative()

  const emailsEnabled: Array<notification_preference> = [
    'all_comments_on_watched_markets',
    'all_replies_to_my_comments_on_watched_markets',
    'all_comments_on_contracts_with_shares_in_on_watched_markets',

    'all_answers_on_watched_markets',
    'all_replies_to_my_answers_on_watched_markets',
    'all_answers_on_contracts_with_shares_in_on_watched_markets',

    'your_contract_closed',
    'all_comments_on_my_markets',
    'all_answers_on_my_markets',

    'resolutions_on_watched_markets_with_shares_in',
    'resolutions_on_watched_markets',

    'trending_markets',
    'onboarding_flow',
    'thank_you_for_purchases',

    'tagged_user', // missing tagged on contract description email
    'contract_from_followed_user',
    'unique_bettors_on_your_contract',
    'profit_loss_updates',
    'opt_out_all',
    'some_comments_on_watched_markets',
    // TODO: add these
    // biggest winner, here are the rest of your markets

    // 'referral_bonuses',
    // 'on_new_follow',
    // maybe the following?
    // 'probability_updates_on_watched_markets',
    // 'limit_order_fills',
  ]
  const browserDisabled: Array<notification_preference> = [
    'trending_markets',
    'onboarding_flow',
    'thank_you_for_purchases',
  ]

  const mobilePushEnabled: Array<notification_preference> = [
    'resolutions_on_watched_markets',
    'resolutions_on_watched_markets_with_shares_in',
    'opt_out_all',
    'all_replies_to_my_comments_on_watched_markets',
    'all_replies_to_my_answers_on_watched_markets',
    'all_comments_on_my_markets',
    'all_answers_on_my_markets',
    'tagged_user',
    'some_comments_on_watched_markets',
    'betting_streaks',

    // TODO: add these
    // 'limit_order_fills',
    // 'contract_from_followed_user',
    // 'probability_updates_on_watched_markets',
  ]

  type SectionData = {
    label: string
    subscriptionTypes: Partial<notification_preference>[]
  }

  const comments: SectionData = {
    label: 'New Comments',
    subscriptionTypes: [
      'some_comments_on_watched_markets',
      // TODO: combine these two
      'all_replies_to_my_comments_on_watched_markets',
      'all_replies_to_my_answers_on_watched_markets',
      'all_comments_on_contracts_with_shares_in_on_watched_markets',
      'all_comments_on_watched_markets',
    ],
  }

  const answers: SectionData = {
    label: 'New Answers',
    subscriptionTypes: [
      'all_answers_on_watched_markets',
      'all_answers_on_contracts_with_shares_in_on_watched_markets',
    ],
  }
  const updates: SectionData = {
    label: 'Updates & Resolutions',
    subscriptionTypes: [
      'market_updates_on_watched_markets',
      'market_updates_on_watched_markets_with_shares_in',
      'resolutions_on_watched_markets',
      'resolutions_on_watched_markets_with_shares_in',
    ],
  }
  const yourMarkets: SectionData = {
    label: 'Markets You Created',
    subscriptionTypes: [
      // 'your_contract_closed',
      'all_comments_on_my_markets',
      'all_answers_on_my_markets',
      'subsidized_your_market',
    ],
  }
  const bonuses: SectionData = {
    label: 'Bonuses',
    subscriptionTypes: [
      'betting_streaks',
      'referral_bonuses',
      'unique_bettors_on_your_contract',
      'quest_payout',
    ],
  }
  const otherBalances: SectionData = {
    label: 'Other',
    subscriptionTypes: ['loan_income', 'limit_order_fills'],
  }
  const userInteractions: SectionData = {
    label: 'Users',
    subscriptionTypes: [
      'tagged_user',
      'on_new_follow',
      'contract_from_followed_user',
      'user_liked_your_content',
    ],
  }
  const groups: SectionData = {
    label: 'Groups',
    subscriptionTypes: ['group_role_changed', 'added_to_group'],
  }
  const leagues: SectionData = {
    label: 'Leagues',
    subscriptionTypes: ['league_changed'],
  }
  const generalOther: SectionData = {
    label: 'Other',
    subscriptionTypes: [
      'trending_markets',
      'thank_you_for_purchases',
      'onboarding_flow',
      'profit_loss_updates',
    ],
  }

  const optOut: SectionData = {
    label: 'Opt Out',
    subscriptionTypes: ['opt_out_all'],
  }

  function NotificationSettingLine(props: {
    description: string
    subscriptionTypeKey: notification_preference
    destinations: notification_destination_types[]
    optOutAll: notification_destination_types[]
  }) {
    const { description, subscriptionTypeKey, destinations, optOutAll } = props
    const previousInAppValue = destinations.includes('browser')
    const previousEmailValue = destinations.includes('email')
    const previousMobileValue = destinations.includes('mobile')
    const [inAppEnabled, setInAppEnabled] = useState(previousInAppValue)
    const [emailEnabled, setEmailEnabled] = useState(previousEmailValue)
    const [mobileEnabled, setMobileEnabled] = useState(previousMobileValue)
    const [error, setError] = useState<string>('')
    const highlight = navigateToSection === subscriptionTypeKey

    return (
      <Row
        className={clsx(
          'text-ink-300 my-1 gap-1',
          highlight ? 'bg-primary-100 rounded-md p-1' : ''
        )}
      >
        <Col className="ml-3 gap-2 text-sm">
          <Row className="text-ink-700 gap-2 font-medium">
            <span>{description}</span>
          </Row>
          <Row className={'gap-4'}>
            {!browserDisabled.includes(subscriptionTypeKey) && (
              <SwitchSetting
                checked={inAppEnabled}
                onChange={(newVal) =>
                  attemptToChangeSetting({
                    setting: 'browser',
                    newValue: newVal,
                    subscriptionTypeKey: subscriptionTypeKey,
                    privateUser: privateUser,
                    emailEnabled: emailEnabled,
                    inAppEnabled: inAppEnabled,
                    setError: setError,
                    setEnabled: setInAppEnabled,
                  })
                }
                label={'Web'}
                disabled={optOutAll.includes('browser')}
              />
            )}
            {emailsEnabled.includes(subscriptionTypeKey) && (
              <SwitchSetting
                checked={emailEnabled}
                onChange={(newVal) =>
                  attemptToChangeSetting({
                    setting: 'email',
                    newValue: newVal,
                    subscriptionTypeKey: subscriptionTypeKey,
                    privateUser: privateUser,
                    emailEnabled: emailEnabled,
                    inAppEnabled: inAppEnabled,
                    setError: setError,
                    setEnabled: setEmailEnabled,
                  })
                }
                label={'Email'}
                disabled={optOutAll.includes('email')}
              />
            )}
            {mobilePushEnabled.includes(subscriptionTypeKey) && (
              <SwitchSetting
                checked={mobileEnabled}
                onChange={(newVal) =>
                  attemptToChangeSetting({
                    setting: 'mobile',
                    newValue: newVal,
                    subscriptionTypeKey: subscriptionTypeKey,
                    privateUser: privateUser,
                    emailEnabled: emailEnabled,
                    inAppEnabled: inAppEnabled,
                    setError: setError,
                    setEnabled: setMobileEnabled,
                  })
                }
                label={'Mobile'}
                disabled={optOutAll.includes('mobile')}
              />
            )}
          </Row>
          {error && <span className={'text-error'}>{error}</span>}
        </Col>
      </Row>
    )
  }

  const Section = memo(function Section(props: {
    icon: ReactNode
    data: SectionData
  }) {
    const { icon, data } = props
    const { label, subscriptionTypes } = data
    const expand =
      navigateToSection &&
      subscriptionTypes.includes(navigateToSection as notification_preference)

    // Not sure how to prevent re-render (and collapse of an open section)
    // due to a private user settings change. Just going to persist expanded state here
    const [expanded, setExpanded] = usePersistentInMemoryState(
      expand ?? false,
      'notifs-section-open-' + subscriptionTypes.join('-')
    )

    // Not working as the default value for expanded, so using a useEffect
    useEffect(() => {
      if (expand) setExpanded(true)
    }, [expand, setExpanded])

    return (
      <Col className={clsx('ml-2 gap-2')}>
        <Row
          className={'text-ink-600 mt-1 cursor-pointer items-center gap-2'}
          onClick={() => setExpanded(!expanded)}
        >
          {icon}
          <span>{label}</span>

          {expanded ? (
            <ChevronUpIcon className="text-ink-500 h-5 w-5 text-xs">
              Hide
            </ChevronUpIcon>
          ) : (
            <ChevronDownIcon className="text-ink-500 h-5 w-5 text-xs">
              Show
            </ChevronDownIcon>
          )}
        </Row>
        <Col className={clsx(expanded ? 'block' : 'hidden', 'gap-2 p-2')}>
          {subscriptionTypes.map((subType) => (
            <NotificationSettingLine
              key={subType}
              subscriptionTypeKey={subType as notification_preference}
              destinations={getUsersSavedPreference(
                subType as notification_preference,
                privateUser
              )}
              description={NOTIFICATION_DESCRIPTIONS[subType].simple}
              optOutAll={
                subType === 'opt_out_all' || subType === 'your_contract_closed'
                  ? []
                  : getUsersSavedPreference('opt_out_all', privateUser)
              }
            />
          ))}
        </Col>
      </Col>
    )
  })

  const PushNotificationsBanner = (props: { privateUser: PrivateUser }) => {
    const { privateUser } = props
    const {
      interestedInPushNotifications,
      rejectedPushNotificationsOn,
      pushToken,
    } = privateUser

    if (
      interestedInPushNotifications ||
      pushToken ||
      (interestedInPushNotifications === undefined &&
        pushToken === undefined) ||
      !isNative
    )
      return <div />

    // If they only said they weren't interested in push notifications to our modal
    if (
      interestedInPushNotifications === false &&
      !rejectedPushNotificationsOn
    ) {
      return (
        <Row className="text-ink-700 items-center justify-center font-medium">
          <span className={'bg-ink-100 rounded-md p-2'}>
            You haven't enabled mobile push notifications.
            <Button
              size={'2xs'}
              className={'ml-2 inline-block whitespace-nowrap'}
              onClick={() => {
                updatePrivateUser(privateUser.id, {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  interestedInPushNotifications: deleteField(),
                })
              }}
            >
              Turn on
            </Button>
          </span>
        </Row>
      )
    }

    // Otherwise, they rejected the system modal, so they've to re-enable it in their settings
    return (
      <Row className="text-ink-700 bg-ink-100 items-center justify-center gap-2 rounded-md p-2 text-sm">
        <span className={''}>
          Mobile push notifications are disabled. To enable them, go to your
          phone's notification settings and turn them on for Manifold. Then tap
          this button ➡️
        </span>
        <Button
          onClick={() =>
            postMessageToNative('promptEnablePushNotifications', {})
          }
          className={'whitespace-nowrap'}
        >
          <RefreshIcon className={'h-4 w-4 '} />
        </Button>
      </Row>
    )
  }

  return (
    <div className={'p-2'}>
      <Col className={'gap-6'}>
        <PushNotificationsBanner privateUser={privateUser} />
        <Row className={'text-ink-700 gap-2 text-xl'}>
          {user ? (
            <UserWatchedContractsButton user={user} />
          ) : (
            <span>Watched Markets</span>
          )}
          <InformationCircleIcon
            className="text-ink-500 -mb-1 h-5 w-5 cursor-pointer"
            onClick={() => setShowWatchModal(true)}
          />
        </Row>
        <Section icon={<ChatIcon className={'h-6 w-6'} />} data={comments} />
        <Section
          icon={<TrendingUpIcon className={'h-6 w-6'} />}
          data={updates}
        />
        <Section
          icon={<LightBulbIcon className={'h-6 w-6'} />}
          data={answers}
        />
        <Section icon={<UserIcon className={'h-6 w-6'} />} data={yourMarkets} />
        <Row className={'text-ink-700 gap-2 text-xl'}>
          <span>Balance Changes</span>
        </Row>
        <Section
          icon={<CurrencyDollarIcon className={'h-6 w-6'} />}
          data={bonuses}
        />
        <Section
          icon={<CashIcon className={'h-6 w-6'} />}
          data={otherBalances}
        />
        <Row className={'text-ink-700 gap-2 text-xl'}>
          <span>General</span>
        </Row>
        <Section icon={<TrophyIcon className={'h-6 w-6'} />} data={leagues} />
        <Section
          icon={<UserIcon className={'h-6 w-6'} />}
          data={userInteractions}
        />
        <Section icon={<UsersIcon className={'h-6 w-6'} />} data={groups} />
        <Section
          icon={<InboxInIcon className={'h-6 w-6'} />}
          data={generalOther}
        />
        <Section
          icon={<ExclamationIcon className={'h-6 w-6'} />}
          data={optOut}
        />
        <WatchMarketModal open={showWatchModal} setOpen={setShowWatchModal} />
      </Col>
    </div>
  )
}

export const notificationIsNecessary = (props: {
  setting: 'browser' | 'email' | 'mobile'
  subscriptionTypeKey: notification_preference
  emailEnabled: boolean
  newValue: boolean
  inAppEnabled: boolean
  setError?: (error: string) => void
}) => {
  const {
    setting,
    subscriptionTypeKey,
    emailEnabled,
    newValue,
    inAppEnabled,
    setError,
  } = props
  const necessaryError =
    'This notification type is necessary. At least one destination must be enabled.'
  // Fall back to false for old deprecated reason types. They won't be able to change the setting though :(
  const necessarySetting =
    NOTIFICATION_DESCRIPTIONS[subscriptionTypeKey]?.necessary ?? false
  if (necessarySetting && setting === 'browser' && !emailEnabled && !newValue) {
    if (setError) {
      setError(necessaryError)
    }
    return true
  } else if (
    necessarySetting &&
    setting === 'email' &&
    !inAppEnabled &&
    !newValue
  ) {
    if (setError) {
      setError(necessaryError)
    }
    return true
  }
  return false
}

const attemptToChangeSetting = (props: {
  setting: 'browser' | 'email' | 'mobile'
  newValue: boolean
  subscriptionTypeKey: notification_preference
  privateUser: PrivateUser
  emailEnabled: boolean
  inAppEnabled: boolean
  setError: (error: string) => void
  setEnabled?: (setting: boolean) => void
}) => {
  const {
    setting,
    newValue,
    subscriptionTypeKey,
    privateUser,
    emailEnabled,
    inAppEnabled,
    setError,
    setEnabled,
  } = props
  // Mobile notifications not included in necessary destinations yet
  if (
    notificationIsNecessary({
      setting: setting,
      subscriptionTypeKey: subscriptionTypeKey,
      emailEnabled: emailEnabled,
      newValue: newValue,
      inAppEnabled: inAppEnabled,
      setError: setError,
    })
  ) {
    return
  }

  changeSetting({
    setting: setting,
    newValue: newValue,
    privateUser: privateUser,
    subscriptionTypeKey: subscriptionTypeKey,
    setEnabled: setEnabled,
  })
}

export const changeSetting = (props: {
  setting: 'browser' | 'email' | 'mobile'
  newValue: boolean
  privateUser: PrivateUser
  subscriptionTypeKey: notification_preference
  setEnabled?: (setting: boolean) => void
}) => {
  const { setting, newValue, privateUser, subscriptionTypeKey, setEnabled } =
    props
  const destinations = getUsersSavedPreference(subscriptionTypeKey, privateUser)
  const loading = 'Changing Notifications Settings'
  const success = 'Changed Notification Settings!'
  toast
    .promise(
      updatePrivateUser(privateUser.id, {
        notificationPreferences: {
          ...privateUser.notificationPreferences,
          [subscriptionTypeKey]: destinations.includes(setting)
            ? destinations.filter((d) => d !== setting)
            : uniq([...destinations, setting]),
        },
      }),
      {
        success,
        loading,
        error: 'Error changing notification settings. Try again?',
      }
    )
    .then(() => {
      if (setEnabled) {
        setEnabled(newValue)
      }
    })
}

export const getUsersSavedPreference = (
  key: notification_preference,
  privateUser: PrivateUser
) => {
  return privateUser.notificationPreferences[key] ?? []
}
