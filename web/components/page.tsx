import clsx from 'clsx'
import { NavBar } from './nav/nav-bar'

export function Page(props: {
  wide?: boolean
  margin?: boolean
  assertUser?: 'signed-in' | 'signed-out'
  children?: any
}) {
  const { wide, margin, assertUser, children } = props

  return (
    <div>
      <NavBar wide={wide} assertUser={assertUser} />

      <div
        className={clsx(
          'mx-auto w-full pb-16',
          wide ? 'max-w-6xl' : 'max-w-4xl',
          margin && 'px-4'
        )}
      >
        {children}
      </div>
    </div>
  )
}
