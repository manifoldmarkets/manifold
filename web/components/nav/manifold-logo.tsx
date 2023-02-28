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
    <Link
      href={user ? '/home' : '/'}
      className={clsx('group flex flex-shrink-0 flex-row gap-4', className)}
    >
      <img
        className="transition-all group-hover:rotate-12"
        src={darkBackground ? '/logo-ink.svg' : '/logo.svg'}
        width={45}
        height={45}
        alt=""
      />
      {!hideText &&
        (ENV_CONFIG.navbarLogoPath ? (
          <img src={ENV_CONFIG.navbarLogoPath} width={245} height={45} />
        ) : twoLine ? (
          <div
            className={clsx(
              'font-major-mono text-ink-900 mt-1 text-lg lowercase',
              darkBackground && 'text-ink'
            )}
          >
            Manifold
            <br />
            Markets
          </div>
        ) : (
          <div
            className={clsx(
              'font-major-mono text-ink-900 mt-2 text-2xl lowercase md:whitespace-nowrap',
              darkBackground && 'text-ink'
            )}
          >
            Manifold Markets
          </div>
        ))}
    </Link>
  )
}
