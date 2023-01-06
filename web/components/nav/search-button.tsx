import { SearchIcon } from '@heroicons/react/outline'
import { useIsClient } from 'web/hooks/use-is-client'
import { isMac } from 'web/lib/util/device'
import { useSearchContext } from '../search/search-context'

export const SearchButton = () => {
  const { setOpen } = useSearchContext() ?? {}
  const isClient = useIsClient()

  if (!setOpen) {
    return null
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="mb-5 flex w-full items-center rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-400 hover:border-indigo-300"
    >
      <SearchIcon className="mr-3 h-6 w-6 text-gray-400" />
      <span className="text-md">Search</span>
      <span className="ml-auto mr-1">
        {isClient && isMac() ? '⌘' : 'Ctrl '}K
      </span>
    </button>
  )
}
