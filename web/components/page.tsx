import clsx from 'clsx'
import { NavBar } from './nav-bar'

export function Page(props: { wide?: boolean; children?: any }) {
  const { wide, children } = props

  return (
    <div>
      <NavBar wide={wide} />

      <div
        className={clsx(
          'w-full px-4 pb-8 mx-auto',
          wide ? 'max-w-6xl' : 'max-w-4xl'
        )}
      >
        {children}
      </div>
    </div>
  )
}
