import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from '../../hooks/use-user'
import { ENV_CONFIG } from '../../../common/envs/constants'

export function ManifoldLogo(props: {
  className?: string
  darkBackground?: boolean
}) {
  const { darkBackground, className } = props

  const user = useUser()

  return (
    <Link href={user ? '/home' : '/'}>
      <a className={clsx('flex flex-shrink-0 flex-row gap-4', className)}>
        <img
          className="transition-all hover:rotate-12"
          src={darkBackground ? '/logo-white.svg' : '/logo.svg'}
          width={45}
          height={45}
        />
        {ENV_CONFIG.navbarLogoPath ? (
          <img src={ENV_CONFIG.navbarLogoPath} width={245} height={45} />
        ) : (
          <>
            <div
              className={clsx(
                'font-major-mono mt-1 text-lg lowercase sm:hidden',
                darkBackground && 'text-white'
              )}
            >
              Manifold
              <br />
              Markets
            </div>
            <div
              className={clsx(
                'font-major-mono mt-1 hidden lowercase sm:flex sm:text-2xl md:whitespace-nowrap',
                darkBackground && 'text-white'
              )}
            >
              Manifold Markets
            </div>
          </>
        )}
      </a>
    </Link>
  )
}
