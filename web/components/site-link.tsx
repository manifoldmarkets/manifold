import clsx from 'clsx'
import Link from 'next/link'
import { Children } from 'react'

export const SiteLink = (props: {
  href: string
  children?: any
  onClick?: () => void
  className?: string
}) => {
  const { href, children, onClick, className } = props

  return (
    <MaybeLink href={href}>
      <a
        className={clsx(
          'z-10 break-words hover:underline hover:decoration-indigo-400 hover:decoration-2',
          className
        )}
        style={{ /* For iOS safari */ wordBreak: 'break-word' }}
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

function MaybeLink(props: { href: string; children: any }) {
  const { href, children } = props
  return href.startsWith('http') ? (
    children
  ) : (
    <Link href={href}>{children}</Link>
  )
}
