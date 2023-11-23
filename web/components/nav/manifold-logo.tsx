import Link from 'next/link'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props

  const user = useUser()

  return (
    <Link
      href={user ? '/home' : '/'}
      className={clsx(
        'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
        className
      )}
    >
      <img
        src="/logo-turkey.png"
        className="h-10 w-10 shrink-0 stroke-amber-700 transition-transform group-hover:rotate-12 dark:stroke-white"
        aria-hidden
      />
      <div className={clsx('text-xl font-thin text-amber-700 dark:text-white')}>
        {ENV == 'DEV' ? 'DEVIFOLD' : 'MANIFOLD'}
      </div>
    </Link>
  )
}
