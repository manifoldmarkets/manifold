import Link from 'next/link'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import Logo from 'public/simple-bat-blue.png'
import LogoDark from 'public/simple-bat-white.png'
import Image from 'next/image'

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
      <Image
        src={Logo}
        className="block h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:hidden dark:stroke-white"
        aria-hidden
        alt={'manifold logo'}
      />
      <Image
        src={LogoDark}
        className="hidden h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:block dark:stroke-white"
        aria-hidden
        alt={'manifold logo'}
      />
      <div
        className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
      >
        {ENV == 'DEV' ? 'DEVIFOLD' : 'MANIF🎃LD'}
      </div>
    </Link>
  )
}
