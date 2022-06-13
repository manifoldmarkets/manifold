import {
  HomeIcon,
  CakeIcon,
  SearchIcon,
  BookOpenIcon,
  DotsHorizontalIcon,
  CashIcon,
  HeartIcon,
  PresentationChartLineIcon,
  ChatAltIcon,
  SparklesIcon,
  NewspaperIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useFollowedFolds } from 'web/hooks/use-fold'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout, User } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { ProfileSummary } from './profile-menu'
import {
  getUtcFreeMarketResetTime,
  useHasCreatedContractToday,
} from 'web/hooks/use-has-created-contract-today'
import { Row } from '../layout/row'
import NotificationsIcon from 'web/components/notifications-icon'
import React, { useEffect, useState } from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'

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

    { name: 'Charity', href: '/charity', icon: HeartIcon },
  ]
}

function getMoreNavigation(user?: User | null) {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards' }]
  }

  if (!user) {
    return [
      { name: 'Leaderboards', href: '/leaderboards' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
      { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
    ]
  }

  return [
    { name: 'Add funds', href: '/add-funds' },
    { name: 'Leaderboards', href: '/leaderboards' },
    { name: 'Blog', href: 'https://news.manifold.markets' },
    { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    { name: 'Twitter', href: 'https://twitter.com/ManifoldMarkets' },
    { name: 'About', href: 'https://docs.manifold.markets' },
    { name: 'Sign out', href: '#', onClick: () => firebaseLogout() },
  ]
}

const signedOutNavigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
  { name: 'Charity', href: '/charity', icon: HeartIcon },
  { name: 'About', href: 'https://docs.manifold.markets', icon: BookOpenIcon },
]

const signedOutMobileNavigation = [
  { name: 'Charity', href: '/charity', icon: HeartIcon },
  { name: 'Leaderboards', href: '/leaderboards', icon: CakeIcon },
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
  { name: 'About', href: 'https://docs.manifold.markets', icon: BookOpenIcon },
]

const mobileNavigation = [
  { name: 'Add funds', href: '/add-funds', icon: CashIcon },
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

function MoreButton() {
  return (
    <a className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:cursor-pointer hover:bg-gray-100">
      <DotsHorizontalIcon
        className="-ml-1 mr-3 h-6 w-6 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
        aria-hidden="true"
      />
      <span className="truncate">More</span>
    </a>
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
  let folds = useFollowedFolds(user) || []
  folds = sortBy(folds, 'followCount').reverse()
  const mustWaitForFreeMarketStatus = useHasCreatedContractToday(user)
  const navigationOptions =
    user === null
      ? signedOutNavigation
      : getNavigation(user?.username || 'error')
  const mobileNavigationOptions =
    user === null ? signedOutMobileNavigation : mobileNavigation

  const gradient =
    'from-indigo-500 to-blue-500 hover:from-indigo-700 hover:to-blue-700'

  const buttonStyle =
    'border-w-0 mx-auto mt-4 -ml-1 w-full rounded-md bg-gradient-to-r py-2.5 text-base font-semibold text-white shadow-sm lg:-ml-0'

  return (
    <nav aria-label="Sidebar" className={className}>
      <ManifoldLogo className="pb-6" twoLine />
      {user && (
        <div className="mb-2" style={{ minHeight: 80 }}>
          <ProfileSummary user={user} />
        </div>
      )}

      <div className="space-y-1 lg:hidden">
        {mobileNavigationOptions.map((item) => (
          <SidebarItem key={item.name} item={item} currentPage={currentPage} />
        ))}

        {user && (
          <MenuButton
            menuItems={[
              { name: 'Sign out', href: '#', onClick: () => firebaseLogout() },
            ]}
            buttonContent={<MoreButton />}
          />
        )}
      </div>

      <div className="hidden space-y-1 lg:block">
        {navigationOptions.map((item) => (
          <SidebarItem key={item.name} item={item} currentPage={currentPage} />
        ))}

        <MenuButton
          menuItems={getMoreNavigation(user)}
          buttonContent={<MoreButton />}
        />
      </div>

      <div className={'aligncenter flex justify-center'}>
        {user ? (
          <Link href={'/create'} passHref>
            <button className={clsx(gradient, buttonStyle)}>
              Create a question
            </button>
          </Link>
        ) : (
          <button
            onClick={firebaseLogin}
            className={clsx(gradient, buttonStyle)}
          >
            Sign in
          </button>
        )}
      </div>

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
