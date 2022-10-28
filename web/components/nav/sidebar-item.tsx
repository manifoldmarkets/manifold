import React from 'react'
import clsx from 'clsx'
import Link from 'next/link'

import { trackCallback } from 'web/lib/service/analytics'

export type Item = {
  name: string
  trackingEventName?: string
  href?: string
  key?: string
  icon?: React.ComponentType<{ className?: string }>
}

export function SidebarItem(props: {
  item: Item
  currentPage: string
  onClick?: (key: string) => void
}) {
  const { item, currentPage, onClick } = props
  const isCurrentPage =
    item.href != null ? item.href === currentPage : item.key === currentPage

  const sidebarItem = (
    <a
      onClick={trackCallback('sidebar: ' + item.name)}
      className={clsx(
        isCurrentPage
          ? 'bg-gray-200 text-gray-900'
          : 'text-gray-600 hover:bg-gray-100',
        'group flex items-center rounded-md px-3 py-2 text-sm font-medium'
      )}
      aria-current={item.href == currentPage ? 'page' : undefined}
    >
      {item.icon && (
        <item.icon
          className={clsx(
            isCurrentPage
              ? 'text-gray-500'
              : 'text-gray-400 group-hover:text-gray-500',
            '-ml-1 mr-3 h-6 w-6 flex-shrink-0'
          )}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{item.name}</span>
    </a>
  )

  if (item.href) {
    return (
      <Link href={item.href} key={item.name} legacyBehavior>
        {sidebarItem}
      </Link>
    )
  } else {
    return onClick ? (
      <button onClick={() => onClick(item.key ?? '#')}>{sidebarItem}</button>
    ) : (
      <> </>
    )
  }
}
