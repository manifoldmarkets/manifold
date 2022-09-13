import { usePrivateUser } from 'web/hooks/use-user'
import React, { ReactNode, useEffect, useState } from 'react'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import {
  notification_subscription_types,
  notification_destination_types,
} from 'common/user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import {
  CashIcon,
  ChatIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CurrencyDollarIcon,
  InboxInIcon,
  InformationCircleIcon,
  LightBulbIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/outline'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'
import { filterDefined } from 'common/util/array'
import toast from 'react-hot-toast'
import { SwitchSetting } from 'web/components/switch-setting'

export function NotificationSettings(props: {
  navigateToSection: string | undefined
}) {
  const { navigateToSection } = props
  const privateUser = usePrivateUser()
  const [showWatchModal, setShowWatchModal] = useState(false)

  if (!privateUser || !privateUser.notificationSubscriptionTypes) {
    return <LoadingIndicator spinnerClassName={'border-gray-500 h-4 w-4'} />
  }

  const emailsEnabled: Array<keyof notification_subscription_types> = [
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
    // TODO: add these
    // one-click unsubscribe only unsubscribes them from that type only, (well highlighted), then a link to manage the rest of their notifications
    // 'profit_loss_updates', - changes in markets you have shares in
    // biggest winner, here are the rest of your markets

    // 'referral_bonuses',
    // 'on_new_follow',
    // 'tips_on_your_markets',
    // 'tips_on_your_comments',
    // maybe the following?
    // 'probability_updates_on_watched_markets',
    // 'limit_order_fills',
  ]
  const browserDisabled: Array<keyof notification_subscription_types> = [
    'trending_markets',
    'profit_loss_updates',
    'onboarding_flow',
    'thank_you_for_purchases',
  ]

  type sectionData = {
    label: string
    subscriptionTypeToDescription: {
      [key in keyof Partial<notification_subscription_types>]: string
    }
  }

  const comments: sectionData = {
    label: 'New Comments',
    subscriptionTypeToDescription: {
      all_comments_on_watched_markets: 'All new comments',
      all_comments_on_contracts_with_shares_in_on_watched_markets: `Only on markets you're invested in`,
      // TODO: combine these two
      all_replies_to_my_comments_on_watched_markets:
        'Only replies to your comments',
      all_replies_to_my_answers_on_watched_markets:
        'Only replies to your answers',
      // comments_by_followed_users_on_watched_markets: 'By followed users',
    },
  }

  const answers: sectionData = {
    label: 'New Answers',
    subscriptionTypeToDescription: {
      all_answers_on_watched_markets: 'All new answers',
      all_answers_on_contracts_with_shares_in_on_watched_markets: `Only on markets you're invested in`,
      // answers_by_followed_users_on_watched_markets: 'By followed users',
      // answers_by_market_creator_on_watched_markets: 'By market creator',
    },
  }
  const updates: sectionData = {
    label: 'Updates & Resolutions',
    subscriptionTypeToDescription: {
      market_updates_on_watched_markets: 'All creator updates',
      market_updates_on_watched_markets_with_shares_in: `Only creator updates on markets you're invested in`,
      resolutions_on_watched_markets: 'All market resolutions',
      resolutions_on_watched_markets_with_shares_in: `Only market resolutions you're invested in`,
      // probability_updates_on_watched_markets: 'Probability updates',
    },
  }
  const yourMarkets: sectionData = {
    label: 'Markets You Created',
    subscriptionTypeToDescription: {
      your_contract_closed: 'Your market has closed (and needs resolution)',
      all_comments_on_my_markets: 'Comments on your markets',
      all_answers_on_my_markets: 'Answers on your markets',
      subsidized_your_market: 'Your market was subsidized',
      tips_on_your_markets: 'Likes on your markets',
    },
  }
  const bonuses: sectionData = {
    label: 'Bonuses',
    subscriptionTypeToDescription: {
      betting_streaks: 'Prediction streak bonuses',
      referral_bonuses: 'Referral bonuses from referring users',
      unique_bettors_on_your_contract: 'Unique bettor bonuses on your markets',
    },
  }
  const otherBalances: sectionData = {
    label: 'Other',
    subscriptionTypeToDescription: {
      loan_income: 'Automatic loans from your profitable bets',
      limit_order_fills: 'Limit order fills',
      tips_on_your_comments: 'Tips on your comments',
    },
  }
  const userInteractions: sectionData = {
    label: 'Users',
    subscriptionTypeToDescription: {
      tagged_user: 'A user tagged you',
      on_new_follow: 'Someone followed you',
      contract_from_followed_user: 'New markets created by users you follow',
    },
  }
  const generalOther: sectionData = {
    label: 'Other',
    subscriptionTypeToDescription: {
      trending_markets: 'Weekly interesting markets',
      thank_you_for_purchases: 'Thank you notes for your purchases',
      onboarding_flow: 'Explanatory emails to help you get started',
      // profit_loss_updates: 'Weekly profit/loss updates',
    },
  }

  const NotificationSettingLine = (
    description: string,
    key: keyof notification_subscription_types,
    value: notification_destination_types[]
  ) => {
    const previousInAppValue = value.includes('browser')
    const previousEmailValue = value.includes('email')
    const [inAppEnabled, setInAppEnabled] = useState(previousInAppValue)
    const [emailEnabled, setEmailEnabled] = useState(previousEmailValue)
    const loading = 'Changing Notifications Settings'
    const success = 'Changed Notification Settings!'
    const highlight = navigateToSection === key

    useEffect(() => {
      if (
        inAppEnabled !== previousInAppValue ||
        emailEnabled !== previousEmailValue
      ) {
        toast.promise(
          updatePrivateUser(privateUser.id, {
            notificationSubscriptionTypes: {
              ...privateUser.notificationSubscriptionTypes,
              [key]: filterDefined([
                inAppEnabled ? 'browser' : undefined,
                emailEnabled ? 'email' : undefined,
              ]),
            },
          }),
          {
            success,
            loading,
            error: 'Error changing notification settings. Try again?',
          }
        )
      }
    }, [
      inAppEnabled,
      emailEnabled,
      previousInAppValue,
      previousEmailValue,
      key,
    ])

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
            {!browserDisabled.includes(key) && (
              <SwitchSetting
                checked={inAppEnabled}
                onChange={setInAppEnabled}
                label={'Web'}
              />
            )}
            {emailsEnabled.includes(key) && (
              <SwitchSetting
                checked={emailEnabled}
                onChange={setEmailEnabled}
                label={'Email'}
              />
            )}
          </Row>
        </Col>
      </Row>
    )
  }

  const getUsersSavedPreference = (
    key: keyof notification_subscription_types
  ) => {
    return privateUser.notificationSubscriptionTypes[key] ?? []
  }

  const Section = (icon: ReactNode, data: sectionData) => {
    const { label, subscriptionTypeToDescription } = data
    const expand =
      navigateToSection &&
      Object.keys(subscriptionTypeToDescription).includes(navigateToSection)
    const [expanded, setExpanded] = useState(expand)

    // Not working as the default value for expanded, so using a useEffect
    useEffect(() => {
      if (expand) setExpanded(true)
    }, [expand])

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
          {Object.entries(subscriptionTypeToDescription).map(([key, value]) =>
            NotificationSettingLine(
              value,
              key as keyof notification_subscription_types,
              getUsersSavedPreference(
                key as keyof notification_subscription_types
              )
            )
          )}
        </Col>
      </Col>
    )
  }

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
        {Section(<ChatIcon className={'h-6 w-6'} />, comments)}
        {Section(<LightBulbIcon className={'h-6 w-6'} />, answers)}
        {Section(<TrendingUpIcon className={'h-6 w-6'} />, updates)}
        {Section(<UserIcon className={'h-6 w-6'} />, yourMarkets)}
        <Row className={'gap-2 text-xl text-gray-700'}>
          <span>Balance Changes</span>
        </Row>
        {Section(<CurrencyDollarIcon className={'h-6 w-6'} />, bonuses)}
        {Section(<CashIcon className={'h-6 w-6'} />, otherBalances)}
        <Row className={'gap-2 text-xl text-gray-700'}>
          <span>General</span>
        </Row>
        {Section(<UsersIcon className={'h-6 w-6'} />, userInteractions)}
        {Section(<InboxInIcon className={'h-6 w-6'} />, generalOther)}
        <WatchMarketModal open={showWatchModal} setOpen={setShowWatchModal} />
      </Col>
    </div>
  )
}
