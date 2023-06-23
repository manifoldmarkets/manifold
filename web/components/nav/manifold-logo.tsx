import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import { useIsDarkMode } from 'web/hooks/dark-mode-context'
import { ENV } from 'common/envs/constants'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className, twoLine } = props
  const isDarkMode = useIsDarkMode()

  const user = useUser()

  const name = ENV === 'DEV' ? 'DEV' : 'Markets'

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
        height={45}
        width={45}
        alt=""
      />

      <img
        src={
          ENV == 'DEV'
            ? isDarkMode
              ? '/devifold_text_white.svg'
              : '/devifold_text_indigo.svg'
            : isDarkMode
            ? '/manifold_text_white.svg'
            : '/manifold_text_indigo.svg'
        }
        className="flex min-w-0 grow object-contain pr-24 lg:pr-0"
        alt=""
      />
    </Link>
  )
}
