import { ExternalLinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'

import { track } from 'web/lib/service/analytics'

export type NavItem = {
  name: string
  trackingEventName?: string
  href?: string
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
  solidIcon?: React.ComponentType<{ className?: string }>
  iconClassName?: string
  external?: boolean
  alwaysShowName?: boolean
  prefetch?: boolean
  children?: React.ReactNode
  subLabel?: string
  itemClassName?: string
}

export function SidebarItem(props: { item: NavItem; currentPage?: string }) {
  const { item, currentPage } = props
  const currentBasePath = '/' + (currentPage?.split('/')[1] ?? '')
  const queryCleanedHref =
    (item.href?.includes('?') ? item.href.split('?')[0] : item.href) ?? ''
  const segmentCleanedHref =
    queryCleanedHref.split('/').length > 2
      ? '/' + queryCleanedHref.split('/')[1]
      : queryCleanedHref

  const isCurrentPage =
    currentBasePath === segmentCleanedHref && !item.href?.startsWith('https://')

  const onClick = () => {
    track('sidebar: ' + item.name)
    item.onClick?.()
  }

  const sidebarClass = clsx(
    'sage-nav-item group flex min-h-[46px] w-full items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none',
    isCurrentPage ? 'sage-nav-item-active' : 'sage-nav-item-idle',
    item.itemClassName
  )

  const sidebarItem = (
    <>
      {item.icon && (
        <item.icon
          className={clsx(
            'sage-nav-icon -ml-0.5 mr-3 h-7 w-7 flex-shrink-0 rounded-lg p-1',
            isCurrentPage && 'sage-nav-icon-active',
            item.iconClassName
          )}
          aria-hidden="true"
        />
      )}

      <span className="truncate">{item.children ?? item.name}</span>

      {item.external && (
        <ExternalLinkIcon className="ml-2 h-4 w-4" aria-hidden="true" />
      )}
    </>
  )

  if (item.href) {
    return (
      <Link
        href={item.href}
        aria-current={isCurrentPage ? 'page' : undefined}
        onClick={onClick}
        className={sidebarClass}
        target={
          item.external || !item.href.startsWith('/') ? '_blank' : undefined
        }
      >
        {sidebarItem}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={sidebarClass}>
      {sidebarItem}
    </button>
  )
}
