import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import Image from 'next/image'

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
      href={'/date-docs'}
      className={clsx('group flex flex-shrink-0 flex-row gap-4', className)}
    >
      <Image
        src="/foldy-kiss.png"
        width={200}
        height={200}
        alt="Two origami cranes kissing"
        className="-translate-x-2 transition-all hover:translate-x-4 hover:rotate-12"
      />
      {/* <img
        className="transition-all group-hover:rotate-12"
        src={darkBackground ? '/logo-white.svg' : '/logo.svg'}
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
        ))} */}
    </Link>
  )
}
