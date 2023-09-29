import clsx from 'clsx'
import Link from 'next/link'

import { trackCallback } from 'web/lib/service/analytics'

export type Item = {
  name: string
  trackingEventName?: string
  href?: string
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
}
export const SIDEBAR_SELECTED_ITEM_CLASS =
  'bg-ink-200 dark:bg-ink-100 text-ink-900'
export const SIDEBAR_UNSELECTED_ITEM_CLASS = 'text-ink-600'
export const SIDE_BAR_ITEM_HOVER_CLASS =
  'hover:bg-indigo-50 dark:hover:bg-indigo-900/50'

export function SidebarItem(props: { item: Item; currentPage?: string }) {
  const { item, currentPage } = props

  const currentBasePath = '/' + (currentPage?.split('/')[1] ?? '')
  const isCurrentPage =
    item.href != null && currentBasePath === item.href.split('?')[0]

  const sidebarItem = (
    <div
      onClick={trackCallback('sidebar: ' + item.name)}
      className={clsx(
        isCurrentPage
          ? SIDEBAR_SELECTED_ITEM_CLASS
          : SIDEBAR_UNSELECTED_ITEM_CLASS,
        'group flex items-center rounded-md px-3 py-2 text-sm font-medium',
        SIDE_BAR_ITEM_HOVER_CLASS
      )}
      aria-current={item.href == currentPage ? 'page' : undefined}
    >
      {item.icon && (
        <item.icon
          className={clsx(
            isCurrentPage
              ? 'text-ink-500'
              : 'text-ink-400 group-hover:text-ink-500',
            '-ml-1 mr-3 h-6 w-6 flex-shrink-0'
          )}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{item.name}</span>
    </div>
  )

  if (item.href) {
    return (
      <Link href={item.href} key={item.name}>
        {sidebarItem}
      </Link>
    )
  } else {
    return <button onClick={item.onClick}>{sidebarItem}</button>
  }
}
