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
  inputId?: string
  listboxId?: string
  instructionsId?: string
  expanded?: boolean
}) => {
  const {
    value,
    setValue,
    placeholder,
    autoFocus,
    loading,
    inputId,
    listboxId,
    instructionsId,
    expanded,
  } = props
  const hasQuery = value !== ''

  return (
    <div className="relative w-full">
      <Input
        id={inputId}
        type="text"
        inputMode="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-describedby={instructionsId}
        aria-expanded={expanded}
        aria-label={placeholder ?? 'Search markets'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={trackCallback('search', { query: value })}
        placeholder={placeholder ?? 'Search'}
        autoFocus={autoFocus}
        className={clsx('w-full', hasQuery && 'pr-10')}
        showSearchIcon
      />
      {hasQuery && (
        <IconButton
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2"
          onClick={() => setValue('')}
        >
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
