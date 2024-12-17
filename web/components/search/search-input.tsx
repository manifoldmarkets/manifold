import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { trackCallback } from 'web/lib/service/analytics'
import { IconButton } from '../buttons/button'
import { Input } from '../widgets/input'
import { LoadingIndicator } from '../widgets/loading-indicator'

export const SearchInput = (props: {
  value: string
  setValue: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  loading?: boolean
}) => {
  const { value, setValue, placeholder, autoFocus, loading } = props
  const hasQuery = value !== ''

  return (
    <div className="relative w-full">
      <Input
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={trackCallback('search', { query: value })}
        placeholder={placeholder ?? 'Search'}
        autoFocus={autoFocus}
        className={clsx('w-full', hasQuery && 'pr-10')}
      />
      {hasQuery && (
        <IconButton className="absolute right-2 top-1/2 -translate-y-1/2">
          {loading ? (
            <LoadingIndicator size="sm" />
          ) : (
            <XIcon className="h-5 w-5 rounded-full" />
          )}
        </IconButton>
      )}
    </div>
  )
}
