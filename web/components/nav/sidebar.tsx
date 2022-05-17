import {
  HomeIcon,
  CakeIcon,
  SearchIcon,
  BookOpenIcon,
  DotsHorizontalIcon,
  CashIcon,
  HeartIcon,
  PresentationChartLineIcon,
  XIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import _ from 'lodash'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useFollowedFolds } from 'web/hooks/use-fold'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, firebaseLogout } from 'web/lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { MenuButton } from './menu'
import { getNavigationOptions, ProfileSummary } from './profile-menu'
import { useHasCreatedContractToday } from 'web/hooks/use-has-created-contract-today'

// Create an icon from the url of an image
function IconFromUrl(url: string): React.ComponentType<{ className?: string }> {
  return function Icon(props) {
    return <img src={url} className={clsx(props.className, 'h-6 w-6')} />
  }
}

const navigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
  { name: 'Portfolio', href: '/portfolio', icon: PresentationChartLineIcon },
  { name: 'Charity', href: '/charity', icon: HeartIcon },
]

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

function CloseButton(props: { onClick: React.MouseEventHandler }) {
  return (
    <button
      className="absolute top-2 -right-12 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white lg:hidden"
      onClick={props.onClick}
    >
      <span className="sr-only">Close sidebar</span>
      <XIcon className="h-6 w-6 text-white" aria-hidden="true" />
    </button>
  )
}

function ModalOverlay(props: {
  open: boolean
  onClick: React.MouseEventHandler
}) {
  const { open, onClick } = props
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    // Disable scrolling page when sidebar is open
    document.body.style.overflow = open ? 'hidden' : 'auto'
    // If it's opened, make sure it's visible immediately so the fade-in will be apparent,
    // but if it's closed, we wait and set it invisible only after the fade-out is done,
    // via the onTransitionEnd handler.
    if (open) {
      setVisible(true)
    }
  }, [open])

  const overlayClass = clsx(
    'inset-0 z-40 flex fixed overflow-auto bg-gray-600 transition-opacity duration-300 lg:hidden',
    visible ? 'visible' : 'invisible',
    open ? 'opacity-75' : 'opacity-0'
  )
  return (
    <div
      className={overlayClass}
      onClick={onClick}
      onTransitionEnd={() => setVisible(open)}
    ></div>
  )
}

export default function Sidebar(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()
  let folds = useFollowedFolds(user) || []
  folds = _.sortBy(folds, 'followCount').reverse()
  const deservesDailyFreeMarket = !useHasCreatedContractToday(user)

  const navigationOptions = user === null ? signedOutNavigation : navigation
  const mobileNavigationOptions =
    user === null ? signedOutMobileNavigation : mobileNavigation

  // TODO: I think this whole business would be simpler if the outer layout was flexbox...
  const sidebarClass = clsx(
    'lg:p-0 lg:pt-0 lg:bg-inherit lg:top-6 lg:sticky lg:col-span-2 lg:self-start lg:w-auto',
    'p-4 pt-5 fixed bg-white w-80 transition-[left] duration-300 h-screen z-50 divide-gray-300',
    open ? 'left-0' : '-left-80'
  )

  return (
    <>
      <ModalOverlay open={open} onClick={onClose} />
      <nav aria-label="Sidebar" className={sidebarClass}>
        {open && <CloseButton onClick={onClose} />}
        <ManifoldLogo className="pb-6" twoLine />
        <div className="mb-2" style={{ minHeight: 80 }}>
          {user ? (
            <ProfileSummary user={user} />
          ) : user === null ? (
            <div className="py-6 text-center">
              <button
                className="btn btn-sm border-2 bg-white px-6 font-medium normal-case text-gray-700"
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
            <SidebarItem
              key={item.name}
              item={item}
              currentPage={currentPage}
            />
          ))}

          {user && (
            <MenuButton
              menuItems={[
                {
                  name: 'Sign out',
                  href: '#',
                  onClick: () => firebaseLogout(),
                },
              ]}
              buttonContent={<MoreButton />}
            />
          )}
        </div>

        <div className="hidden space-y-1 lg:block">
          {navigationOptions.map((item) => (
            <SidebarItem
              key={item.name}
              item={item}
              currentPage={currentPage}
            />
          ))}

          <MenuButton
            menuItems={getNavigationOptions(user)}
            buttonContent={<MoreButton />}
          />
        </div>

        {deservesDailyFreeMarket ? (
          <div className=" text-primary mt-4 text-center">
            Use your daily free market! 🎉
          </div>
        ) : (
          <div />
        )}

        {user && (
          <div className={'aligncenter flex justify-center'}>
            <Link href={'/create'}>
              <button className="btn btn-primary btn-md mt-4 capitalize">
                Create Market
              </button>
            </Link>
          </div>
        )}
      </nav>
    </>
  )
}
