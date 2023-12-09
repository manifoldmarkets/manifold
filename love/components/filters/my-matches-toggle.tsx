import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { Lover } from 'common/love/lover'

export function MyMatchesToggle(props: {
  setYourFilters: (checked: boolean) => void
  youLover: Lover | undefined | null
  on: boolean
  hidden: boolean
}) {
  const { setYourFilters, on, hidden } = props
  if (hidden) {
    return <></>
  }

  const label = 'Your matches'

  return (
    <Row className={clsx('mr-2 items-center', on && 'font-semibold')}>
      <input
        id={label}
        type="checkbox"
        className="border-ink-300 bg-canvas-0 dark:border-ink-500 text-primary-600 focus:ring-primary-500 h-4 w-4 rounded"
        checked={on}
        onChange={(e) => setYourFilters(e.target.checked)}
      />
      <label htmlFor={label} className={clsx('text-ink-600 ml-2')}>
        {label}
      </label>
    </Row>
  )
}
