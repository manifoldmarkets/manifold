import {
  HomeIcon,
  UserGroupIcon,
  SearchIcon,
  BookOpenIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import _ from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useFollowedFolds } from '../../hooks/use-fold'
import { useUser } from '../../hooks/use-user'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { ManifoldLogo } from './manifold-logo'
import { NavOptions } from './nav-bar'

const navigation = [
  { name: 'Home', href: '/home', icon: HomeIcon },
  { name: 'Markets', href: '/markets', icon: SearchIcon },
  { name: 'About', href: 'https://docs.manifold.markets', icon: BookOpenIcon },
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
  )
}

export default function Sidebar() {
  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()
  let folds = useFollowedFolds(user) || []
  folds = _.sortBy(folds, 'followCount').reverse()

  return (
    <nav aria-label="Sidebar" className="sticky top-4 divide-y divide-gray-300">
      <div className="space-y-1 pb-8">
        <ManifoldLogo hideText />
        <Spacer h={4} />

        {navigation.map((item) => (
          <SidebarItem item={item} currentPage={currentPage} />
        ))}
      </div>

      <Row className="items-center gap-6 py-6 sm:gap-8">
        {(user || user === null) && <NavOptions user={user} />}
      </Row>

      <div className="pt-10">
        <SidebarItem
          item={{ name: 'Communities', href: '/folds', icon: UserGroupIcon }}
          currentPage={currentPage}
        />

        <div className="mt-3 space-y-2">
          {folds.map((fold) => (
            <a
              key={fold.name}
              href={`/fold/${fold.slug}`}
              className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              <span className="truncate">&nbsp; {fold.name}</span>
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}
