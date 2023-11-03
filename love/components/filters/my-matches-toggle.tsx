import { Lover } from 'love/hooks/use-lover'
import { Row } from 'web/components/layout/row'
import { Checkbox } from 'web/components/widgets/checkbox'
import clsx from 'clsx'

export function MyMatchesToggle(props: {
  setYourFilters: (checked: boolean) => void
  youLover: Lover | undefined | null
  isYourFilters: boolean
}) {
  const { setYourFilters, youLover, isYourFilters } = props
  if (!youLover) {
    return <></>
  }

  const label = 'Your matches'

  const disabled = !youLover

  return (
    <Row className={'mr-2 items-center gap-2 sm:gap-1 sm:font-semibold'}>
      <input
        id={label}
        type="checkbox"
        className="border-ink-300 bg-canvas-0 dark:border-ink-500 text-primary-600 focus:ring-primary-500 h-4 w-4 rounded"
        checked={isYourFilters}
        onChange={(e) => setYourFilters(e.target.checked)}
        disabled={disabled}
      />
      <label
        htmlFor={label}
        className={clsx(disabled ? 'text-ink-300' : 'text-ink-600')}
      >
        {label}
      </label>
    </Row>
  )
}
