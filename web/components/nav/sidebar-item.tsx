import { ExternalLinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'

import { track } from 'web/lib/service/analytics'

export type Item = {
  name: string
  trackingEventName?: string
  href?: string
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
  external?: boolean
}

export function SidebarItem(props: { item: Item; currentPage?: string }) {
  const { item, currentPage } = props

  const currentBasePath = '/' + (currentPage?.split('/')[1] ?? '')
  const isCurrentPage =
    item.href != null && currentBasePath === item.href.split('?')[0]

  const onClick = () => {
    track('sidebar: ' + item.name)
    item.onClick?.()
  }

  const sidebarClass = clsx(
    isCurrentPage
      ? 'bg-ink-200 text-ink-900'
      : 'text-ink-600 hover:bg-primary-100 hover:text-ink-700',
    'group flex items-center rounded-md px-3 py-2 text-sm font-medium',
    'focus-visible:bg-primary-100 outline-none'
  )

  const sidebarItem = (
    <>
      {item.icon && (
        <item.icon
          className={clsx(
            isCurrentPage
              ? 'text-ink-600'
              : 'text-ink-500 group-hover:text-ink-600',
            '-ml-1 mr-3 h-6 w-6 flex-shrink-0'
          )}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{item.name}</span>
      {item.external && <ExternalLinkIcon className="ml-2 h-4 w-4" />}
    </>
  )

  if (item.href) {
    return (
      <Link
        href={item.href}
        aria-current={isCurrentPage ? 'page' : undefined}
        onClick={onClick}
        className={sidebarClass}
      >
        {sidebarItem}
      </Link>
    )
  } else {
    return (
      <button onClick={onClick} className={sidebarClass}>
        {sidebarItem}
      </button>
    )
  }
}
