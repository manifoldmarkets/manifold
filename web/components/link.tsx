import clsx from 'clsx'
import Link from 'next/link'

export const SiteLink = (props: {
  href: string
  children: any
  className?: string
}) => {
  const { href, children, className } = props

  return (
    <Link href={href}>
      <a
        className={clsx(
          'hover:underline hover:decoration-indigo-400 hover:decoration-2',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    </Link>
  )
}
