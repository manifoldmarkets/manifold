import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import { useIsDarkMode } from 'web/hooks/dark-mode-context'
import { ENV } from 'common/envs/constants'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const isDarkMode = useIsDarkMode()

  const user = useUser()

  return (
    <Link
      href={user ? '/home' : '/'}
      className={clsx(
        'group flex w-full flex-row items-center gap-0.5 px-1',
        className
      )}
    >
      <img
        className="shrink-0 transition-all group-hover:rotate-12"
        src={isDarkMode ? '/logo-white.svg' : '/logo.svg'}
        height={40}
        width={40}
        alt=""
      />
      <div
        className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
      >
        {ENV == 'DEV' ? 'DEVIFOLD' : 'MANIFOLD'}
      </div>
    </Link>
  )
}
