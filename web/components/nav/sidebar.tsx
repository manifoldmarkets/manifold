import {
  HomeIcon,
  FireIcon,
  UserGroupIcon,
  TrendingUpIcon,
  SearchIcon,
  CollectionIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'

const navigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Markets', href: '/markets', icon: SearchIcon },
  { name: 'Communities', href: '/folds', icon: UserGroupIcon },
  { name: 'Trades', href: '/trades', icon: CollectionIcon },
  // { name: 'Trending', href: '#', icon: TrendingUpIcon, current: false },
]

const communities = [
  { name: 'Movies', href: '#' },
  { name: 'Food', href: '#' },
  { name: 'Sports', href: '#' },
  { name: 'Animals', href: '#' },
  { name: 'Science', href: '#' },
  { name: 'Dinosaurs', href: '#' },
  { name: 'Talents', href: '#' },
  { name: 'Gaming', href: '#' },
]

export default function Sidebar() {
  const router = useRouter()
  const currentPage = router.pathname

  return (
    <nav aria-label="Sidebar" className="sticky top-4 divide-y divide-gray-300">
      <div className="space-y-1 pb-8">
        {navigation.map((item) => (
          <Link href={item.href} key={item.name}>
            <a
              key={item.name}
              href={item.href}
              className={clsx(
                item.href == currentPage
                  ? 'bg-gray-200 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50',
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
        ))}
      </div>
      <div className="pt-10">
        <p
          className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
          id="communities-headline"
        >
          My communities
        </p>
        <div className="mt-3 space-y-2" aria-labelledby="communities-headline">
          {communities.map((community) => (
            <a
              key={community.name}
              href={community.href}
              className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              <span className="truncate">{community.name}</span>
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}
