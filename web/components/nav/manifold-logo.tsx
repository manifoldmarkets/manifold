import Link from 'next/link'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import Logo from 'web/public/logo.svg'
import { useState } from 'react'
import Snowfall from 'react-snowfall'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const [isSnowing, setIsSnowing] = useState(false)

  const user = useUser()

  return (
    <>
      <Link
        href={user ? '/home' : '/'}
        onClick={(e) => {
          if (window.location.pathname == '/home') {
            e.preventDefault()
            setIsSnowing(!isSnowing)
          }
        }}
        className={clsx(
          'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
          className
        )}
      >
        <Logo
          className="h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
          aria-hidden
        />
        <div
          className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
        >
          {ENV == 'DEV' ? 'DEVIF❄️LD' : 'MANIF❄️LD'}
        </div>
      </Link>
      {isSnowing && (
        <Snowfall
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      )}
    </>
  )
}
