import { Switch } from '@headlessui/react'
import clsx from 'clsx'
import { useState } from 'react'
import { Row } from './layout/row'

export function DarkModeSwitch(props: { disabled?: boolean }) {
  const { disabled } = props
  if (typeof window !== 'undefined') {
    return <DMSwitch disabled={disabled} />
  } else {
    return <></>
  }
}

function DMSwitch(props: { disabled?: boolean }) {
  const { disabled } = props
  const [isDark, setIsDark] = useState(
    document.documentElement.classList[0] === 'dark'
  )
  return (
    <Row className="text-ink-600 gap-2 text-sm">
      <Switch
        disabled={disabled}
        checked={isDark}
        onChange={(e: boolean) => {
          if (e) {
            setIsDark(true)
            document.documentElement.classList.add('dark')
          } else {
            setIsDark(false)
            document.documentElement.classList.remove('dark')
          }
        }}
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
