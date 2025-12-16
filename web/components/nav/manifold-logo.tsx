import Link from 'next/link'
import clsx from 'clsx'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'

function Snowfall() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const snowflakes = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 5 + Math.random() * 10,
    size: 4 + Math.random() * 8,
    opacity: 0.4 + Math.random() * 0.6,
  }))

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      <style>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-10px) rotate(0deg);
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
          }
        }
        @keyframes sway {
          0%, 100% {
            margin-left: 0px;
          }
          50% {
            margin-left: 20px;
          }
        }
      `}</style>
      {snowflakes.map((flake) => (
        <div
          key={flake.id}
          className="absolute text-white"
          style={{
            left: `${flake.left}%`,
            top: '-20px',
            fontSize: `${flake.size}px`,
            opacity: flake.opacity,
            animation: `snowfall ${flake.duration}s linear infinite, sway ${
              2 + Math.random() * 2
            }s ease-in-out infinite`,
            animationDelay: `${flake.delay}s`,
          }}
        >
          ❄
        </div>
      ))}
    </div>,
    document.body
  )
}

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const user = useUser()
  const [showSnow, setShowSnow] = useState(false)

  return (
    <>
      {showSnow && <Snowfall />}
      <div className="flex items-center gap-2">
        <Link
          href={user ? '/home' : '/'}
          onClick={(e) => {
            const isHomePage =
              window.location.pathname === '/home' ||
              window.location.pathname === '/'
            if (isHomePage) {
              e.preventDefault()
              setShowSnow((prev) => !prev)
            }
          }}
          className={clsx(
            'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
            className
          )}
        >
          <Image
            src="/christmas_manifold_logo.png"
            alt="Manifold"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 transition-transform group-hover:rotate-12"
          />
          <div
            className={clsx(
              'text-xl font-thin text-indigo-700 dark:text-white'
            )}
          >
            {ENV == 'DEV' ? 'DEVIFO️LD' : 'MANIF❄️LD'}
          </div>
        </Link>
        {user && (
          <Link
            href="/wrapped"
            className="ml-1 animate-pulse text-2xl transition-transform hover:rotate-12 hover:scale-125"
            title="Your 2025 Wrapped!"
          >
            🎁
          </Link>
        )}
      </div>
    </>
  )
}
