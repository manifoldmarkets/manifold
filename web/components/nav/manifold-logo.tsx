import Link from 'next/link'
import clsx from 'clsx'
import Image from 'next/image'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import { isAprilFools } from 'common/util/time'
import { LogoIcon } from '../icons/logo-icon'

function JesterHatLogoSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      {/* Right Flap (Green) */}
      <path d="M12 23L15 13L22 6L12 23Z" fill="#16A34A" />
      <path d="M12 23L22 6L19 16L12 23Z" fill="#14532D" />
      {/* Left Flap (Purple) */}
      <path d="M12 23L9 13L5 7L12 23Z" fill="#6366F1" />
      <path d="M12 23L5 7L5 16L12 23Z" fill="#4F46E5" />
      <path d="M5 7L5 10L2 6L5 7Z" fill="#818CF8" />
      {/* Center Flap (Red) */}
      <path d="M12 23L9 13L12 2L12 23Z" fill="#991B1B" />
      <path d="M12 23L15 13L12 2L12 23Z" fill="#DC2626" />
      {/* Gold Bells */}
      <circle cx="2" cy="6" r="1.5" fill="#FBBF24" />
      <circle cx="22" cy="6" r="1.5" fill="#FBBF24" />
      <circle cx="12" cy="2" r="1.5" fill="#FBBF24" />
    </svg>
  )
}

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
        {aprilFools ? (
          <JesterHatLogoSvg className="h-10 w-10 shrink-0 transition-transform group-hover:rotate-12" />
        ) : (
          <LogoIcon
            className="h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
            aria-hidden
          />
        )}
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
