import clsx from 'clsx'
import Link from 'next/link'

import { track } from 'web/lib/service/analytics'

export type Item = {
  name: string
  trackingEventName?: string
  href?: string
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
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
      ? 'bg-ink-100 text-primary-700'
      : 'text-ink-600 hover:bg-ink-100 hover:text-primary-700',
    'group flex items-center rounded-md px-3 py-2 text-sm font-medium',
    'focus-visible:bg-ink-100 outline-none transition-all'
  )

  const sidebarItem = (
    <>
      {item.icon && (
        <item.icon
          className={clsx(
            isCurrentPage
              ? 'text-primary-600'
              : 'text-ink-500 group-hover:text-primary-600',
            '-ml-1 mr-3 h-6 w-6 flex-shrink-0 transition-all'
          )}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{item.name}</span>
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
