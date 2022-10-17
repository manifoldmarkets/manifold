import React, { memo, ReactNode, useEffect, useState } from 'react'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { PrivateUser } from 'common/user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
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
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/outline'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'
import toast from 'react-hot-toast'
import { SwitchSetting } from 'web/components/switch-setting'
import { uniq } from 'lodash'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { NOTIFICATION_DESCRIPTIONS } from 'common/notification'
import {
  notification_destination_types,
  notification_preference,
} from 'common/user-notification-preferences'

export function NotificationSettings(props: {
  navigateToSection: string | undefined
  privateUser: PrivateUser
}) {
  useEffect(() => {
    console.log((window as any).isNative, 'isNative')
    if ((window as any).isNative && privateUser && !privateUser.pushToken) {
      console.log('Notifications: no push token, requesting')
      ;(window as any).ReactNativeWebView.postMessage(
        'promptEnablePushNotifications'
      )
    }
  }, [])
  const { navigateToSection, privateUser } = props
  const [showWatchModal, setShowWatchModal] = useState(false)

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
    // TODO: add these
    // biggest winner, here are the rest of your markets

    // 'referral_bonuses',
    // 'on_new_follow',
    // 'tips_on_your_markets',
    // 'tips_on_your_comments',
    // maybe the following?
    // 'probability_updates_on_watched_markets',
    // 'limit_order_fills',
  ]
  const browserDisabled: Array<notification_preference> = [
    'trending_markets',
    'profit_loss_updates',
    'onboarding_flow',
    'thank_you_for_purchases',
  ]

  type SectionData = {
    label: string
    subscriptionTypes: Partial<notification_preference>[]
  }

  const comments: SectionData = {
    label: 'New Comments',
    subscriptionTypes: [
      'all_comments_on_watched_markets',
      'all_comments_on_contracts_with_shares_in_on_watched_markets',
      // TODO: combine these two
      'all_replies_to_my_comments_on_watched_markets',
      'all_replies_to_my_answers_on_watched_markets',
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
      'tips_on_your_markets',
    ],
  }
  const bonuses: SectionData = {
    label: 'Bonuses',
    subscriptionTypes: [
      'betting_streaks',
      'referral_bonuses',
      'unique_bettors_on_your_contract',
    ],
  }
  const otherBalances: SectionData = {
    label: 'Other',
    subscriptionTypes: [
      'loan_income',
      'limit_order_fills',
      'tips_on_your_comments',
      'badges_awarded',
    ],
  }
  const userInteractions: SectionData = {
    label: 'Users',
    subscriptionTypes: [
      'tagged_user',
      'on_new_follow',
      'contract_from_followed_user',
    ],
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
    const [inAppEnabled, setInAppEnabled] = useState(previousInAppValue)
    const [emailEnabled, setEmailEnabled] = useState(previousEmailValue)
    const [error, setError] = useState<string>('')
    const loading = 'Changing Notifications Settings'
    const success = 'Changed Notification Settings!'
    const highlight = navigateToSection === subscriptionTypeKey

    const attemptToChangeSetting = (
      setting: 'browser' | 'email',
      newValue: boolean
    ) => {
      const necessaryError =
        'This notification type is necessary. At least one destination must be enabled.'
      const necessarySetting =
        NOTIFICATION_DESCRIPTIONS[subscriptionTypeKey].necessary
      if (
        necessarySetting &&
        setting === 'browser' &&
        !emailEnabled &&
        !newValue
      ) {
        setError(necessaryError)
        return
      } else if (
        necessarySetting &&
        setting === 'email' &&
        !inAppEnabled &&
        !newValue
      ) {
        setError(necessaryError)
        return
      }

      changeSetting(setting, newValue)
    }

    const changeSetting = (setting: 'browser' | 'email', newValue: boolean) => {
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
          if (setting === 'browser') {
            setInAppEnabled(newValue)
          } else {
            setEmailEnabled(newValue)
          }
        })
    }

    return (
      <Row
        className={clsx(
          'my-1 gap-1 text-gray-300',
          highlight ? 'rounded-md bg-indigo-100 p-1' : ''
        )}
      >
        <Col className="ml-3 gap-2 text-sm">
          <Row className="gap-2 font-medium text-gray-700">
            <span>{description}</span>
          </Row>
          <Row className={'gap-4'}>
            {!browserDisabled.includes(subscriptionTypeKey) && (
              <SwitchSetting
                checked={inAppEnabled}
                onChange={(newVal) => attemptToChangeSetting('browser', newVal)}
                label={'Web'}
                disabled={optOutAll.includes('browser')}
              />
            )}
            {emailsEnabled.includes(subscriptionTypeKey) && (
              <SwitchSetting
                checked={emailEnabled}
                onChange={(newVal) => attemptToChangeSetting('email', newVal)}
                label={'Email'}
                disabled={optOutAll.includes('email')}
              />
            )}
          </Row>
          {error && <span className={'text-error'}>{error}</span>}
        </Col>
      </Row>
    )
  }

  const getUsersSavedPreference = (key: notification_preference) => {
    return privateUser.notificationPreferences[key] ?? []
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
    const [expanded, setExpanded] = usePersistentState(expand ?? false, {
      key: 'NotificationsSettingsSection-' + subscriptionTypes.join('-'),
      store: storageStore(safeLocalStorage()),
    })

    // Not working as the default value for expanded, so using a useEffect
    useEffect(() => {
      if (expand) setExpanded(true)
    }, [expand, setExpanded])

    return (
      <Col className={clsx('ml-2 gap-2')}>
        <Row
          className={'mt-1 cursor-pointer items-center gap-2 text-gray-600'}
          onClick={() => setExpanded(!expanded)}
        >
          {icon}
          <span>{label}</span>

          {expanded ? (
            <ChevronUpIcon className="h-5 w-5 text-xs text-gray-500">
              Hide
            </ChevronUpIcon>
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-xs text-gray-500">
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
                subType as notification_preference
              )}
              description={NOTIFICATION_DESCRIPTIONS[subType].simple}
              optOutAll={
                subType === 'opt_out_all' || subType === 'your_contract_closed'
                  ? []
                  : getUsersSavedPreference('opt_out_all')
              }
            />
          ))}
        </Col>
      </Col>
    )
  })

  return (
    <div className={'p-2'}>
      <Col className={'gap-6'}>
        <Row className={'gap-2 text-xl text-gray-700'}>
          <span>Notifications for Watched Markets</span>
          <InformationCircleIcon
            className="-mb-1 h-5 w-5 cursor-pointer text-gray-500"
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
        <Row className={'gap-2 text-xl text-gray-700'}>
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
        <Row className={'gap-2 text-xl text-gray-700'}>
          <span>General</span>
        </Row>
        <Section
          icon={<UsersIcon className={'h-6 w-6'} />}
          data={userInteractions}
        />
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
