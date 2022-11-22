import clsx from 'clsx'
import { ReactNode } from 'react'
import Link from 'next/link'

export const linkClass =
  'break-anywhere hover:underline hover:decoration-indigo-400 hover:decoration-2'

export const SiteLink = (props: {
  href: string | undefined
  children?: ReactNode
  onClick?: (event?: any) => void
  className?: string
}) => {
  const { href, children, onClick, className } = props

  if (!href) return <>{children}</>

  return (
    <Link
      href={href}
      className={clsx(linkClass, className)}
      target={href.startsWith('http') ? '_blank' : undefined}
      // onClick={onClick ? (e) => (e.stopPropagation(), onClick()) : undefined}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}
