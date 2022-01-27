import clsx from 'clsx'
import { NavBar } from './nav-bar'

export function Page(props: {
  wide?: boolean
  margin?: boolean
  children?: any
}) {
  const { wide, margin, children } = props

  return (
    <div>
      <NavBar wide={wide} />

      <div
        className={clsx(
          'w-full mx-auto',
          wide ? 'max-w-6xl' : 'max-w-4xl',
          margin && 'px-4'
        )}
      >
        {children}
      </div>
    </div>
  )
}
