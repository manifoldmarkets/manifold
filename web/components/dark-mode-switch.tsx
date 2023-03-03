import { Switch } from '@headlessui/react'
import clsx from 'clsx'
import { useContext } from 'react'
import { DarkModeContext } from 'web/hooks/dark-mode-context'
import { useIsClient } from 'web/hooks/use-is-client'
import { Row } from './layout/row'

export function DarkModeSwitch(props: { disabled?: boolean }) {
  const { disabled } = props
  const isClient = useIsClient()
  if (isClient) {
    return <DMSwitch disabled={disabled} />
  } else {
    return <></>
  }
}

function DMSwitch(props: { disabled?: boolean }) {
  const { disabled } = props

  const { theme, changeTheme } = useContext(DarkModeContext)
  const isDark = theme === 'dark'

  return (
    <Row className="text-ink-600 gap-2 text-sm">
      <div className={'bg-canvas-0'} />
      <Switch
        disabled={disabled}
        checked={isDark}
        onChange={(e) => changeTheme(e ? 'dark' : 'light')}
        className={clsx(
          'focus:ring-primary-500 group relative inline-flex h-5 w-10 flex-shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2',
          !disabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-full w-full rounded-md bg-inherit"
        />
        <span
          aria-hidden="true"
          className={clsx(
            isDark ? 'bg-primary-600' : 'bg-ink-200',
            'pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out'
          )}
        />
        <span
          aria-hidden="true"
          className={clsx(
            isDark ? 'translate-x-5' : 'translate-x-0',
            'border-ink-200 bg-canvas-0 pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border shadow ring-0 transition-transform duration-200 ease-in-out'
          )}
        />
      </Switch>
      Dark mode
    </Row>
  )
}
