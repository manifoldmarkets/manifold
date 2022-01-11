import Link from 'next/link'
import clsx from 'clsx'

export function ManifoldLogo(props: { darkBackground?: boolean }) {
  const { darkBackground } = props

  return (
    <Link href="/">
      <a className="flex flex-row gap-3">
        <img
          className="hover:rotate-12 transition-all"
          src="/logo.svg"
          width={60}
          height={60}
        />
        <div
          className={clsx(
            'hidden sm:flex font-major-mono lowercase mt-1 sm:text-2xl md:whitespace-nowrap',
            darkBackground && 'text-white'
          )}
        >
          Manifold Markets
        </div>
      </a>
    </Link>
  )
}
