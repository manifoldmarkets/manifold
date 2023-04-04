import { SearchIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useIsClient } from 'web/hooks/use-is-client'
import { isMac } from 'web/lib/util/device'
import { useSearchContext } from '../search/search-context'

export const SearchButton = (props: { className?: string }) => {
  const { setOpen } = useSearchContext() ?? {}
  const isClient = useIsClient()

  if (!setOpen) {
    return null
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className={clsx(
        'border-ink-500 text-ink-400 bg-canvas-0 hover:border-primary-300 flex items-center rounded-md border p-2 text-sm',
        props.className
      )}
    >
      <SearchIcon className="h-6 w-6" />
      <span className="text-md ml-3">Search</span>
      <span className="ml-auto mr-1">
        {isClient && isMac() ? '⌘' : 'Ctrl '}K
      </span>
    </button>
  )
}

export const MobileSearchButton = (props: { className?: string }) => {
  return (
    <Link
      href="/find"
      className={clsx(
        'bg border-ink-300 bg-canvas-0 hover:border-primary-300 flex flex-row gap-2 rounded-md border p-2',
        props.className
      )}
    >
      <SearchIcon className="text-ink-500 h-6 w-6 sm:text-inherit" />
      <div className="text-ink-500">Search</div>
    </Link>
  )
}
