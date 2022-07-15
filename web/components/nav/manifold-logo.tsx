import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import { ENV_CONFIG } from 'common/envs/constants'

export function ManifoldLogo(props: {
  className?: string
  darkBackground?: boolean
  hideText?: boolean
  twoLine?: boolean
}) {
  const { darkBackground, className, hideText, twoLine } = props

  const user = useUser()

  return (
    <Link href={user ? '/home' : '/'}>
      <a className={clsx('group flex flex-shrink-0 flex-row gap-4', className)}>
        {!hideText &&
          (ENV_CONFIG.navbarLogoPath ? (
            <img
              src={ENV_CONFIG.navbarLogoPath}
              width={245}
              height={45}
              className="rounded-full bg-gray-800 px-6 py-2"
            />
          ) : twoLine ? (
            <div
              className={clsx(
                'font-major-mono mt-1 text-lg lowercase text-gray-900',
                darkBackground && 'text-white'
              )}
            >
              Manifold
              <br />
              Markets
            </div>
          ) : (
            <div
              className={clsx(
                'font-major-mono mt-2 text-2xl lowercase text-gray-900 md:whitespace-nowrap',
                darkBackground && 'text-white'
              )}
            >
              Manifold Markets
            </div>
          ))}
      </a>
    </Link>
  )
}
