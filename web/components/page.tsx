import clsx from 'clsx'
import { NavBar } from './nav-bar'

export function Page(props: { wide?: boolean; children?: any }) {
  const { wide, children } = props

  return (
    <div>
      <NavBar />
      <div
        className={clsx(
          'max-w-4xl px-4 pb-8 mx-auto w-full',
          wide ? 'max-w-7xl' : 'max-w-4xl'
        )}
      >
        {children}
      </div>
    </div>
  )
}
