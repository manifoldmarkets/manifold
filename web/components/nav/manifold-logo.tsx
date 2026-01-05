import Link from 'next/link'
import clsx from 'clsx'
import Image from 'next/image'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import { LogoIcon } from '../icons/logo-icon'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const user = useUser()

  return (
    <div className="flex items-center gap-2">
      <Link
        href={user ? '/home' : '/'}
        className={clsx(
          'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
          className
        )}
      >
        <LogoIcon
          className="h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
          aria-hidden
        />
        <div
          className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
        >
          {ENV == 'DEV' ? 'DEVIFOLD' : 'MANIFOLD'}
        </div>
      </Link>
    </div>
  )
}
