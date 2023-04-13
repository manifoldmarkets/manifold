import Link from 'next/link'
import clsx from 'clsx'

import { useUser } from 'web/hooks/use-user'
import { useIsDarkMode } from 'web/hooks/dark-mode-context'
import Image from 'next/image'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props
  const isDarkMode = useIsDarkMode()

  const user = useUser()

  return (
    <Link
      href={user ? '/home' : '/'}
      className={clsx(
        'group flex min-w-[200px] flex-row items-center gap-1',
        className
      )}
    >
      <Image
        className="transition-all group-hover:rotate-12"
        src={isDarkMode ? '/logo-white.svg' : '/logo.svg'}
        width={55}
        height={55}
        alt=""
      />
      <div className="font-josefin-slab text-ink-900 mt-3 bg-gradient-to-r from-indigo-700 to-blue-600 bg-clip-text text-3xl font-[600] text-transparent">
        Manifold
      </div>
    </Link>
  )
}
