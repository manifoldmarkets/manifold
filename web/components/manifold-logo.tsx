import Link from 'next/link'
import Image from 'next/image'
import clsx from 'clsx'

export function ManifoldLogo(props: { darkBackground?: boolean }) {
  const { darkBackground } = props

  return (
    <Link href="/">
      <a className="flex flex-row gap-4">
        <Image
          className="hover:rotate-12 transition-all"
          src={darkBackground ? '/logo-white.svg' : '/logo.svg'}
          width={45}
          height={45}
        />
        <div
          className={clsx(
            'sm:hidden font-major-mono lowercase mt-1 text-lg',
            darkBackground && 'text-white'
          )}
        >
          Manifold
          <br />
          Markets
        </div>
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
