import clsx from 'clsx'
import { ReactNode } from 'react'
import Link from 'next/link'

export const linkClass =
  'z-10 break-anywhere hover:underline hover:decoration-indigo-400 hover:decoration-2'

export const SiteLink = (props: {
  href: string | undefined
  children?: ReactNode
  onClick?: () => void
  className?: string
}) => {
  const { href, children, onClick, className } = props

  if (!href) return <>{children}</>

  return (
    <MaybeLink href={href}>
      <a
        className={clsx(linkClass, className)}
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        onClick={(e) => {
          e.stopPropagation()
          if (onClick) onClick()
        }}
      >
        {children}
      </a>
    </MaybeLink>
  )
}

function MaybeLink(props: { href: string; children: ReactNode }) {
  const { href, children } = props
  return href.startsWith('http') ? (
    <>{children}</>
  ) : (
    <Link href={href}>{children}</Link>
  )
}
