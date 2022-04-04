import {
  HomeIcon,
  UserGroupIcon,
  CakeIcon,
  SearchIcon,
  ChatIcon,
  BookOpenIcon,
  TableIcon,
  DotsHorizontalIcon,
  CashIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import _ from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useFollowedFolds } from '../../hooks/use-fold'
import { useUser } from '../../hooks/use-user'
import { firebaseLogin, firebaseLogout } from '../../lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { getNavigationOptions, ProfileSummary } from './profile-menu'

const navigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
  { name: 'Portfolio', href: '/portfolio', icon: TableIcon },
]

const signedOutNavigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
  { name: 'About', href: 'https://docs.manifold.markets', icon: BookOpenIcon },
]

const signedOutMobileNavigation = [
  { name: 'Leaderboards', href: '/leaderboards', icon: CakeIcon },
  { name: 'Communities', href: '/folds', icon: UserGroupIcon },
  { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh', icon: ChatIcon },
  { name: 'About', href: 'https://docs.manifold.markets', icon: BookOpenIcon },
]

const mobileNavigation = [
  { name: 'Add funds', href: '/add-funds', icon: CashIcon },
  ...signedOutMobileNavigation,
]

type Item = {
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

export default function Sidebar() {
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()
  let folds = useFollowedFolds(user) || []
  folds = _.sortBy(folds, 'followCount').reverse()

  const navigationOptions = user === null ? signedOutNavigation : navigation
  const mobileNavigationOptions =
    user === null ? signedOutMobileNavigation : mobileNavigation

  return (
    <nav aria-label="Sidebar" className="sticky top-4 divide-gray-300 pl-2">
      <div className="space-y-1 pb-4">
        <ManifoldLogo hideText />
      </div>

      <div style={{ minHeight: 93 }}>
        {user ? (
          <Link href={`/${user.username}`}>
            <a className="group">
              <ProfileSummary user={user} />
            </a>
          </Link>
        ) : user === null ? (
          <div className="py-6 text-center">
            <button
              className="btn border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
              onClick={firebaseLogin}
            >
              Sign in
            </button>
          </div>
        ) : (
          <div />
        )}
      </div>

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
    </nav>
  )
}
