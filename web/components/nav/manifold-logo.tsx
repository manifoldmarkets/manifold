import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import { useIsDarkMode } from 'web/hooks/dark-mode-context'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className, twoLine } = props
  const isDarkMode = useIsDarkMode()

  const user = useUser()

  return (
    <Link
      href={user ? '/home' : '/'}
      className={clsx(
        'group flex shrink-0 flex-row items-center gap-4',
        className
      )}
    >
      <img
        className="transition-all group-hover:rotate-12"
        src={isDarkMode ? '/logo-white.svg' : '/logo.svg'}
        width={45}
        height={45}
        alt=""
      />
      {twoLine ? (
        <div className="font-major-mono text-ink-900 mt-1 text-lg lowercase">
          Manifold
          <br />
          Markets
        </div>
      ) : (
        <div className="font-major-mono text-ink-900 mt-2 text-2xl lowercase md:whitespace-nowrap">
          Manifold Markets
        </div>
      )}
    </Link>
  )
}
