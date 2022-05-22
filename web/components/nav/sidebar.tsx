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
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useFollowedFolds } from 'web/hooks/use-fold'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { getNavigationOptions, ProfileSummary } from './profile-menu'
import { useHasCreatedContractToday } from 'web/hooks/use-has-created-contract-today'
import { Row } from '../layout/row'

// Create an icon from the url of an image
function IconFromUrl(url: string): React.ComponentType<{ className?: string }> {
  return function Icon(props) {
    return <img src={url} className={clsx(props.className, 'h-6 w-6')} />
  }
}

function getNavigation(username: string) {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    { name: 'Activity', href: '/activity', icon: ChatAltIcon },
    {
      name: 'Portfolio',
      href: `/${username}/bets`,
      icon: PresentationChartLineIcon,
    },
    { name: 'Charity', href: '/charity', icon: HeartIcon },
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

  const user = useUser()
  let folds = useFollowedFolds(user) || []
  folds = sortBy(folds, 'followCount').reverse()
  const deservesDailyFreeMarket = !useHasCreatedContractToday(user)

  const navigationOptions =
    user === null
      ? signedOutNavigation
      : getNavigation(user?.username || 'error')
  const mobileNavigationOptions =
    user === null ? signedOutMobileNavigation : mobileNavigation

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
          menuItems={getNavigationOptions(user)}
          buttonContent={<MoreButton />}
        />
      </div>

      <div className={'aligncenter flex justify-center'}>
        {user ? (
          <Link href={'/create'} passHref>
            <button className="border-w-0 mx-auto mt-4 -ml-1 w-full rounded-md bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500 py-2.5 text-base font-semibold text-white shadow-sm hover:from-purple-700 hover:via-violet-700 hover:to-indigo-700 lg:-ml-0">
              Ask a question
            </button>
          </Link>
        ) : (
          <button
            onClick={firebaseLogin}
            className="border-w-0 mx-auto mt-4 -ml-1 w-full rounded-md bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500 py-2.5 text-base font-semibold text-white shadow-sm hover:from-purple-700 hover:via-violet-700 hover:to-indigo-700 lg:-ml-0"
          >
            Sign in
          </button>
        )}
      </div>

      {user && deservesDailyFreeMarket && (
        <Row className="mt-2 justify-center">
          <Row className="gap-1 text-sm text-indigo-400">
            Daily free market
            <SparklesIcon className="mt-0.5 h-4 w-4" aria-hidden="true" />
          </Row>
        </Row>
      )}
    </nav>
  )
}
