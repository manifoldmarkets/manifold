import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'

import { ENV_CONFIG } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'

export function ManifoldLogo(props: {
  className?: string
  darkBackground?: boolean
  hideText?: boolean
  twoLine?: boolean
}) {
  const { darkBackground, className, hideText, twoLine } = props

  const user = useUser()
  const [showHog, setShowHog] = useState(false)

  return (
    <Link
      href={
        showHog
          ? '/TaiRuiYang/will-punxsutawney-phil-see-his-shad-e4ee552c2911'
          : user
          ? '/home'
          : '/'
      }
      className={clsx('group flex flex-shrink-0 flex-row gap-4', className)}
    >
      <img
        className="transition-all group-hover:rotate-12"
        onMouseEnter={() => setShowHog(true)}
        onMouseOut={() => setShowHog(false)}
        src={
          showHog
            ? '/groundhog.png'
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
    </Link>
  )
}
