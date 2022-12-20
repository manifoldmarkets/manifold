import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import { ENV_CONFIG } from 'common/envs/constants'
import { useState } from 'react'
import { FullscreenConfetti } from '../widgets/fullscreen-confetti'

export function ManifoldLogo(props: {
  className?: string
  darkBackground?: boolean
  hideText?: boolean
  twoLine?: boolean
}) {
  const { darkBackground, className, hideText, twoLine } = props

  const user = useUser()
  const [isSnowing, setIsSnowing] = useState(false)

  return (
    <>
      <Link
        href={user ? '/home' : '/'}
        onClick={(e) => {
          if (window.location.pathname === '/home') {
            e.preventDefault()
            setIsSnowing(!isSnowing)
          }
        }}
        className={clsx('group flex flex-shrink-0 flex-row gap-4', className)}
      >
        <img
          className="transition-all group-hover:rotate-12"
          src={'/christmas_manifold_logo.png'}
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
              <span className="font-semibold text-green-700">Manifold</span>
              <br />
              <span className="font-semibold text-red-700">Markets</span>
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

      {isSnowing && (
        <FullscreenConfetti
          colors={['#0a2933']}
          drawShape={(ctx) => {
            ctx.beginPath()
            ctx.arc(0, 0, 10, 0, 2 * Math.PI, false)
            ctx.fillStyle = '#fff'
            ctx.fill()
          }}
        />
      )}
    </>
  )
}
