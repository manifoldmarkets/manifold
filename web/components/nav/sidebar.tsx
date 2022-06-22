import {
  HomeIcon,
  SearchIcon,
  BookOpenIcon,
  DotsHorizontalIcon,
  CashIcon,
  HeartIcon,
  PresentationChartLineIcon,
  PresentationChartBarIcon,
  SparklesIcon,
  NewspaperIcon,
  UserGroupIcon,
  ChevronDownIcon,
  TrendingUpIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogout, User } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton, MenuItem } from './menu'
import { ProfileSummary } from './profile-menu'
import {
  getUtcFreeMarketResetTime,
  useHasCreatedContractToday,
} from 'web/hooks/use-has-created-contract-today'
import { Row } from '../layout/row'
import NotificationsIcon from 'web/components/notifications-icon'
import React, { useEffect, useState } from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { CreateQuestionButton } from 'web/components/create-question-button'
import { useMemberGroups } from 'web/hooks/use-group'
import { groupPath } from 'web/lib/firebase/groups'
import { trackCallback, withTracking } from 'web/lib/service/analytics'
import { Group } from 'common/group'

// Create an icon from the url of an image
function IconFromUrl(url: string): React.ComponentType<{ className?: string }> {
  return function Icon(props) {
    return <img src={url} className={clsx(props.className, 'h-6 w-6')} />
  }
}

function getNavigation(username: string) {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    {
      name: 'Portfolio',
      href: `/${username}/bets`,
      icon: PresentationChartLineIcon,
    },
    {
      name: 'Notifications',
      href: `/notifications`,
      icon: NotificationsIcon,
    },

    { name: 'Get M$', href: '/add-funds', icon: CashIcon },
  ]
}

function getMoreNavigation(user?: User | null) {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards' }]
  }

  if (!user) {
    return [
      { name: 'Leaderboards', href: '/leaderboards' },
      { name: 'Charity', href: '/charity' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
      { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
    ]
  }

  return [
    { name: 'Leaderboards', href: '/leaderboards' },
    { name: 'Charity', href: '/charity' },
    { name: 'Blog', href: 'https://news.manifold.markets' },
    { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
    { name: 'Statistics', href: '/stats' },
    { name: 'About', href: 'https://docs.manifold.markets/$how-to' },
    { name: 'Sign out', href: '#', onClick: () => firebaseLogout() },
  ]
}

const signedOutNavigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
  { name: 'Charity', href: '/charity', icon: HeartIcon },
  {
    name: 'About',
    href: 'https://docs.manifold.markets/$how-to',
    icon: BookOpenIcon,
  },
]

const signedOutMobileNavigation = [
  { name: 'Charity', href: '/charity', icon: HeartIcon },
  { name: 'Leaderboards', href: '/leaderboards', icon: TrendingUpIcon },
  { name: 'Blog', href: 'https://news.manifold.markets', icon: NewspaperIcon },
  {
    name: 'Discord',
    href: 'https://discord.gg/eHQBNBqXuh',
    icon: IconFromUrl('/discord-logo.svg'),
  },
  {
    name: 'Twitter',
    href: 'https://twitter.com/ManifoldMarkets',
    icon: IconFromUrl('/twitter-logo.svg'),
  },
  {
    name: 'Statistics',
    href: '/stats',
    icon: PresentationChartBarIcon,
  },
  {
    name: 'About',
    href: 'https://docs.manifold.markets/$how-to',
    icon: BookOpenIcon,
  },
]

const signedInMobileNavigation = [
  { name: 'Get M$', href: '/add-funds', icon: CashIcon },
  ...signedOutMobileNavigation,
]

export type Item = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

function SidebarItem(props: { item: Item; currentPage: string }) {
  const { item, currentPage } = props
  return (
    <Link href={item.href} key={item.name}>
      <a
        onClick={trackCallback('sidebar: ' + item.name)}
        className={clsx(
          item.href == currentPage
            ? 'bg-gray-200 text-gray-900'
            : 'text-gray-600 hover:bg-gray-100',
          'group flex items-center rounded-md px-3 py-2 text-sm font-medium'
        )}
        aria-current={item.href == currentPage ? 'page' : undefined}
      >
        <item.icon
          className={clsx(
            item.href == currentPage
              ? 'text-gray-500'
              : 'text-gray-400 group-hover:text-gray-500',
            '-ml-1 mr-3 h-6 w-6 flex-shrink-0'
          )}
          aria-hidden="true"
        />
        <span className="truncate">{item.name}</span>
      </a>
    </Link>
  )
}

function SidebarButton(props: {
  text: string
  icon: React.ComponentType<{ className?: string }>
  children?: React.ReactNode
}) {
  const { text, children } = props
  return (
    <a className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:cursor-pointer hover:bg-gray-100">
      <props.icon
        className="-ml-1 mr-3 h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
        aria-hidden="true"
      />
      <span className="truncate">{text}</span>
      {children}
    </a>
  )
}

function MoreButton() {
  return <SidebarButton text={'More'} icon={DotsHorizontalIcon} />
}

function GroupsButton() {
  return (
    <SidebarButton icon={UserGroupIcon} text={'Groups'}>
      <ChevronDownIcon className=" mt-0.5 ml-2 h-5 w-5" aria-hidden="true" />
    </SidebarButton>
  )
}

export default function Sidebar(props: { className?: string }) {
  const { className } = props
  const router = useRouter()
  const currentPage = router.pathname
  const [countdown, setCountdown] = useState('...')
  useEffect(() => {
    const nextUtcResetTime = getUtcFreeMarketResetTime({ previousTime: false })
    const interval = setInterval(() => {
      const now = new Date().getTime()
      const timeUntil = nextUtcResetTime - now
      const hoursUntil = timeUntil / 1000 / 60 / 60
      const minutesUntil = (hoursUntil * 60) % 60
      const secondsUntil = Math.round((hoursUntil * 60 * 60) % 60)
      const timeString =
        hoursUntil < 1 && minutesUntil < 1
          ? `${secondsUntil}s`
          : hoursUntil < 1
          ? `${Math.round(minutesUntil)}m`
          : `${Math.floor(hoursUntil)}h`
      setCountdown(timeString)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const user = useUser()
  const mustWaitForFreeMarketStatus = useHasCreatedContractToday(user)
  const navigationOptions = !user
    ? signedOutNavigation
    : getNavigation(user?.username || 'error')
  const mobileNavigationOptions = !user
    ? signedOutMobileNavigation
    : signedInMobileNavigation
  const memberItems = (useMemberGroups(user) ?? []).map((group: Group) => ({
    name: group.name,
    href: groupPath(group.slug),
  }))

  return (
    <nav aria-label="Sidebar" className={className}>
      <ManifoldLogo className="pb-6" twoLine />
      {user && (
        <div className="mb-2" style={{ minHeight: 80 }}>
          <ProfileSummary user={user} />
        </div>
      )}

      <div className="space-y-1 lg:hidden">
        {user && (
          <MenuButton
            buttonContent={<GroupsButton />}
            menuItems={[{ name: 'Explore', href: '/groups' }, ...memberItems]}
            className={'relative z-50 flex-shrink-0'}
          />
        )}
        {mobileNavigationOptions.map((item) => (
          <SidebarItem key={item.href} item={item} currentPage={currentPage} />
        ))}
        {!user && (
          <SidebarItem
            key={'Groups'}
            item={{ name: 'Groups', href: '/groups', icon: UserGroupIcon }}
            currentPage={currentPage}
          />
        )}

        {user && (
          <MenuButton
            menuItems={[
              {
                name: 'Sign out',
                href: '#',
                onClick: withTracking(firebaseLogout, 'sign out'),
              },
            ]}
            buttonContent={<MoreButton />}
          />
        )}
      </div>

      <div className="hidden space-y-1 lg:block">
        {navigationOptions.map((item) =>
          item.name === 'Notifications' ? (
            <div key={item.href}>
              <SidebarItem item={item} currentPage={currentPage} />
              {user && (
                <MenuButton
                  key={'groupsdropdown'}
                  buttonContent={<GroupsButton />}
                  menuItems={[
                    { name: 'Explore', href: '/groups' },
                    ...memberItems,
                  ]}
                  className={'relative z-50 flex-shrink-0'}
                />
              )}
            </div>
          ) : (
            <SidebarItem
              key={item.href}
              item={item}
              currentPage={currentPage}
            />
          )
        )}

        <MenuButton
          menuItems={getMoreNavigation(user)}
          buttonContent={<MoreButton />}
        />
      </div>
      <CreateQuestionButton user={user} />

      {user &&
      mustWaitForFreeMarketStatus != 'loading' &&
      mustWaitForFreeMarketStatus ? (
        <Row className="mt-2 justify-center">
          <Row className="gap-1 text-sm text-gray-400">
            Next free question in {countdown}
          </Row>
        </Row>
      ) : (
        user &&
        mustWaitForFreeMarketStatus != 'loading' &&
        !mustWaitForFreeMarketStatus && (
          <Row className="mt-2 justify-center">
            <Row className="gap-1 text-sm text-indigo-400">
              Daily free question
              <SparklesIcon className="mt-0.5 h-4 w-4" aria-hidden="true" />
            </Row>
          </Row>
        )
      )}
    </nav>
  )
}
