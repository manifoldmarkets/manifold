import Link from 'next/link'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import Snowfall from 'react-snowfall'
import { useState } from 'react'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const user = useUser()
  const [showSnow, setShowSnow] = useState(false)

  return (
    <>
      <Link
        href={user ? '/home' : '/'}
        onClick={(e) => {
          setShowSnow(!showSnow)

          if (window.location.pathname == '/home') {
            e.preventDefault()
          }
        }}
        className={clsx(
          'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
          className
        )}
      >
        {/* <LogoIcon
          className="h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
          aria-hidden
        /> */}
        <>
          {showSnow && (
            <Snowfall
              style={{
                position: 'fixed',
                width: '100vw',
                height: '100vh',
                zIndex: 50,
              }}
              snowflakeCount={100}
              speed={[0.5, 1.5]}
            />
          )}
          <img
            src="/christmas_manifold_logo.png"
            alt="Manifold Christmas logo"
            className="h-10 w-10 shrink-0 cursor-pointer stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
            aria-hidden
          />
        </>
        <div
          className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
        >
          {ENV == 'DEV' ? 'DEVIFO️LD' : 'MANIF❄️LD'}
        </div>
      </Link>
    </>
  )
}
