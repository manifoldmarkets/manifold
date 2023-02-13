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
        'flex items-center rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-400 hover:border-indigo-300',
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
        'bg flex flex-row gap-2 rounded-md border border-gray-300 bg-white p-2 hover:border-indigo-300',
        props.className
      )}
    >
      <SearchIcon className="h-6 w-6 text-gray-700 sm:text-inherit" />
      <div className="text-gray-500">Search</div>
    </Link>
  )
}
