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
import { Switch } from '@headlessui/react'
import { Col } from 'web/components/layout/col'
import {
  AdjustmentsIcon,
  CashIcon,
  ChatIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  LightBulbIcon,
  TrendingUpIcon,
  UserIcon,
} from '@heroicons/react/outline'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'
import { filterDefined } from 'common/util/array'
import toast from 'react-hot-toast'

export function NotificationSettings() {
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

    'tagged_user',
    'trending_markets',

    // TODO: add these
    // 'contract_from_followed_user',
    // 'referral_bonuses',
    // 'unique_bettors_on_your_contract',
    // 'tips_on_your_markets',
    // 'tips_on_your_comments',
    // 'subsidized_your_market',
    // 'on_new_follow',
    // maybe the following?
    // 'profit_loss_updates',
    // 'probability_updates_on_watched_markets',
    // 'limit_order_fills',
  ]
  const browserDisabled = ['trending_markets', 'profit_loss_updates']

  const watched_markets_explanations_comments: {
    [key in keyof Partial<notification_subscription_types>]: string
  } = {
    all_comments_on_watched_markets: 'All',
    all_replies_to_my_comments_on_watched_markets: 'Replies to your comments',
    all_comments_on_contracts_with_shares_in_on_watched_markets:
      'On markets you have shares in',
    // comments_by_followed_users_on_watched_markets: 'By followed users',
  }
  const watched_markets_explanations_answers: {
    [key in keyof Partial<notification_subscription_types>]: string
  } = {
    all_answers_on_watched_markets: 'All',
    all_replies_to_my_answers_on_watched_markets: 'Replies to your answers',
    all_answers_on_contracts_with_shares_in_on_watched_markets:
      'On markets you have shares in',
    // answers_by_followed_users_on_watched_markets: 'By followed users',
    // answers_by_market_creator_on_watched_markets: 'By market creator',
  }
  const watched_markets_explanations_your_markets: {
    [key in keyof Partial<notification_subscription_types>]: string
  } = {
    your_contract_closed: 'Your market has closed (and needs resolution)',
    all_comments_on_my_markets: 'Comments on your markets',
    all_answers_on_my_markets: 'Answers on your markets',
    subsidized_your_market: 'Your market was subsidized',
  }
  const watched_markets_explanations_market_updates: {
    [key in keyof Partial<notification_subscription_types>]: string
  } = {
    resolutions_on_watched_markets: 'Market resolutions',
    resolutions_on_watched_markets_with_shares_in:
      'Market resolutions you have shares in',
    market_updates_on_watched_markets: 'Updates made by the creator',
    market_updates_on_watched_markets_with_shares_in:
      'Updates made by the creator on markets you have shares in',
    // probability_updates_on_watched_markets: 'Probability updates',
  }

  const balance_change_explanations: {
    [key in keyof Partial<notification_subscription_types>]: string
  } = {
    loan_income: 'Automatic loans from your profitable bets',
    betting_streaks: 'Betting streak bonuses',
    referral_bonuses: 'Referral bonuses from referring users',
    unique_bettors_on_your_contract: 'Unique bettor bonuses on your markets',
    tips_on_your_comments: 'Tips on your comments',
    limit_order_fills: 'Limit order fills',
  }

  const general_explanations: {
    [key in keyof Partial<notification_subscription_types>]: string
  } = {
    tagged_user: 'A user tagged you',
    contract_from_followed_user: 'New markets created by users you follow',
    trending_markets: 'Weekly trending markets',
    on_new_follow: 'New followers',
    // profit_loss_updates: 'Weekly profit/loss updates',
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

    // for each entry in the exhaustive_notification_subscribe_types we'll want to load whether the user
    // wants email, browser, both, or none
    return (
      <Row className={clsx('my-1 gap-1 text-gray-300')}>
        <Col className="ml-3 gap-2 text-sm">
          <Row className="gap-2 font-medium text-gray-700">
            <span>{description}</span>
          </Row>
          <Row className={'gap-4'}>
            {!browserDisabled.includes(key) && (
              <Switch.Group as="div" className="flex items-center">
                <Switch
                  checked={inAppEnabled}
                  onChange={setInAppEnabled}
                  className={clsx(
                    inAppEnabled ? 'bg-indigo-600' : 'bg-gray-200',
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      inAppEnabled ? 'translate-x-5' : 'translate-x-0',
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                    )}
                  />
                </Switch>
                <Switch.Label as="span" className="ml-3">
                  <span className="text-sm font-medium text-gray-900">
                    In-app
                  </span>
                </Switch.Label>
              </Switch.Group>
            )}
            {emailsEnabled.includes(key) && (
              <Switch.Group as="div" className="flex items-center">
                <Switch
                  checked={emailEnabled}
                  onChange={setEmailEnabled}
                  className={clsx(
                    emailEnabled ? 'bg-indigo-600' : 'bg-gray-200',
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      emailEnabled ? 'translate-x-5' : 'translate-x-0',
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                    )}
                  />
                </Switch>
                <Switch.Label as="span" className="ml-3">
                  <span className="text-sm font-medium text-gray-900">
                    Emails
                  </span>
                </Switch.Label>
              </Switch.Group>
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

  const Section = (
    icon: ReactNode,
    label: string,
    subscriptionTypeToDescription: {
      [key in keyof Partial<notification_subscription_types>]: string
    }
  ) => {
    const [expanded, setExpanded] = useState(false)
    return (
      <Col className={'ml-2 gap-2'}>
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
        {/*// TODO: add none option to each section*/}
        {Section(
          <ChatIcon className={'h-6 w-6'} />,
          'New Comments',
          watched_markets_explanations_comments
        )}
        {Section(
          <LightBulbIcon className={'h-6 w-6'} />,
          'New Answers',
          watched_markets_explanations_answers
        )}
        {Section(
          <UserIcon className={'h-6 w-6'} />,
          'On Markets You Created',
          watched_markets_explanations_your_markets
        )}
        {Section(
          <TrendingUpIcon className={'h-6 w-6'} />,
          'Market Updates',
          watched_markets_explanations_market_updates
        )}
        <Row className={'gap-2 text-xl text-gray-700'}>
          <span>Balance Changes</span>
        </Row>
        {Section(
          <CashIcon className={'h-6 w-6'} />,
          'Loans and Bonuses',
          balance_change_explanations
        )}
        <Row className={'gap-2 text-xl text-gray-700'}>
          <span>Other</span>
        </Row>
        {Section(
          <AdjustmentsIcon className={'h-6 w-6'} />,
          'General',
          general_explanations
        )}
        <WatchMarketModal open={showWatchModal} setOpen={setShowWatchModal} />
      </Col>
    </div>
  )
}
