import { usePrivateUser } from 'web/hooks/use-user'
import React, { ReactNode, useEffect, useState } from 'react'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import {
  exhaustive_notification_subscribe_types,
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

  // should be keyof Partial<exhaustive_notification_subscribe_types>[] but can't figure out how to make that work
  // TODO: re-enable emails for renamed subscribe types
  const emailsEnabled = [
    // 'all_comments',
    // 'all_answers',
    // 'resolutions',
    'all_replies_to_my_comments',
    'all_replies_to_my_answers',
    'all_comments_on_my_markets',
    'all_answers_on_my_markets',
    'my_markets_closed',
    'probability_updates',
    'user_tagged_you',
    'new_markets_by_followed_users',
    'trending_markets',
    'profit_loss_updates',
    'all_comments_on_contracts_with_shares_in',
    'all_answers_on_contracts_with_shares_in',
  ]
  const browserDisabled = ['trending_markets', 'profit_loss_updates']

  const watched_markets_explanations_comments: {
    [key in keyof Partial<exhaustive_notification_subscribe_types>]: string
  } = {
    all_comments_on_watched_markets: 'All',
    all_replies_to_my_comments_on_watched_markets: 'Replies to your comments',
    all_comments_on_contracts_with_shares_in_on_watched_markets:
      'On markets you have shares in',
    // comments_by_followed_users_on_watched_markets: 'By followed users',
  }
  const watched_markets_explanations_answers: {
    [key in keyof Partial<exhaustive_notification_subscribe_types>]: string
  } = {
    all_answers_on_watched_markets: 'All',
    all_replies_to_my_answers_on_watched_markets: 'Replies to your answers',
    all_answers_on_contracts_with_shares_in_on_watched_markets:
      'On markets you have shares in',
    // answers_by_followed_users_on_watched_markets: 'By followed users',
    // answers_by_market_creator_on_watched_markets: 'By market creator',
  }
  const watched_markets_explanations_your_markets: {
    [key in keyof Partial<exhaustive_notification_subscribe_types>]: string
  } = {
    my_markets_closed: 'Your market has closed (and needs resolution)',
    all_comments_on_my_markets: 'Comments on your markets',
    all_answers_on_my_markets: 'Answers on your markets',
  }
  const watched_markets_explanations_market_updates: {
    [key in keyof Partial<exhaustive_notification_subscribe_types>]: string
  } = {
    resolutions_on_watched_markets: 'Market resolutions',
    market_updates_on_watched_markets: 'Updates made by the creator',
    // probability_updates_on_watched_markets: 'Probability updates',
  }

  const balance_change_explanations: {
    [key in keyof Partial<exhaustive_notification_subscribe_types>]: string
  } = {
    loan_income: 'Automatic loans from your profitable bets',
    betting_streaks: 'Betting streak bonuses',
    referral_bonuses: 'Referral bonuses from referring users',
    unique_bettor_bonuses: 'Unique bettor bonuses on your markets',
    tips_on_your_comments: 'Tips on your comments',
    limit_order_fills: 'Limit order fills',
  }

  const general_explanations: {
    [key in keyof Partial<exhaustive_notification_subscribe_types>]: string
  } = {
    user_tagged_you: 'A user tagged you',
    new_markets_by_followed_users: 'New markets created by users you follow',
    trending_markets: 'Weekly trending markets',
    new_followers: 'New followers',
    group_adds: 'When someone adds you to a group',
    // profit_loss_updates: 'Weekly profit/loss updates',
  }

  const NotificationSettingLine = (
    description: string,
    key: string,
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

  const getUsersSavedPreference = (key: string) => {
    return Object.keys(privateUser.notificationSubscriptionTypes).includes(key)
      ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        privateUser.notificationSubscriptionTypes[
          Object.keys(privateUser.notificationSubscriptionTypes).filter(
            (x) => x === key
          )[0]
        ]
      : ''
  }

  const Section = (
    icon: ReactNode,
    label: string,
    map: { [key: string]: string }
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
          {Object.entries(map).map(([key, value]) =>
            NotificationSettingLine(value, key, getUsersSavedPreference(key))
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
