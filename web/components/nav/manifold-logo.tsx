import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import { APRIL_FOOLS_ENABLED, ENV_CONFIG } from 'common/envs/constants'

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
        src={
          APRIL_FOOLS_ENABLED
            ? '/logo-april-fools.svg'
            : darkBackground
            ? '/logo-white.svg'
            : '/logo.svg'
        }
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
              'font-major-mono text-ink-900 text-3xl leading-8 tracking-[.08em]',
              darkBackground && 'text-ink-1000'
            )}
          >
            Manaculus
            <br />
            Markets
          </div>
        ) : (
          <div
            className={clsx(
              'font-major-mono text-ink-900 mt-2 text-3xl leading-8 tracking-[.08em] md:whitespace-nowrap',
              darkBackground && 'text-ink-1000'
            )}
          >
            Manaculus Markets
          </div>
        ))}
    </Link>
  )
}
