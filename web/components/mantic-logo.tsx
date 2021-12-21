import Link from 'next/link'
import clsx from 'clsx'

export function ManticLogo(props: { darkBackground?: boolean }) {
  const { darkBackground } = props
  return (
    <Link href="/">
      <a className="flex flex-row gap-3">
        <img
          className="sm:h-10 sm:w-10 hover:rotate-12 transition-all"
          src="/logo-icon.svg"
          width={40}
          height={40}
        />
        <div
          className={clsx(
            'font-major-mono lowercase mt-1 sm:text-2xl md:whitespace-nowrap',
            darkBackground && 'text-white'
          )}
        >
          Mantic Markets
        </div>
      </a>
    </Link>
  )
}
