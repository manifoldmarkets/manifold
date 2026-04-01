import Link from 'next/link'
import clsx from 'clsx'
import Image from 'next/image'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import { isAprilFools } from 'common/util/time'
import { LogoIcon } from '../icons/logo-icon'
import { JesterHatSvg } from '../shop/item-svgs'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const user = useUser()
  const aprilFools = isAprilFools()

  return (
    <div className="flex items-center gap-2">
      <Link
        href={user ? '/home' : '/'}
        className={clsx(
          'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
          className
        )}
      >
        <div className="relative">
          <LogoIcon
            className="h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
            aria-hidden
          />
          {aprilFools && (
            <JesterHatSvg
              className="pointer-events-none absolute -right-1 -top-3 h-6 w-6 rotate-[30deg]"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
          )}
        </div>
        <div
          className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
        >
          {aprilFools
            ? 'MANIFOOLD'
            : ENV == 'DEV'
            ? 'DEVIFOLD'
            : 'MANIFOLD'}
        </div>
      </Link>
    </div>
  )
}
