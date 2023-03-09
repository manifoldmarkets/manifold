import clsx from 'clsx'
import { ReactNode } from 'react'
import Link from 'next/link'
import { getNativePlatform } from 'web/lib/native/is-native'

export const linkClass =
  'break-anywhere hover:underline hover:decoration-primary-400 hover:decoration-2'

export const SiteLink = (props: {
  href: string | undefined
  children?: ReactNode
  onClick?: (event?: any) => void
  className?: string
  followsLinkClass?: boolean
}) => {
  const { href, children, onClick, className, followsLinkClass } = props

  if (!href) return <>{children}</>

  return (
    <Link
      href={href}
      className={clsx(followsLinkClass ? linkClass : '', className)}
      target={href.startsWith('http') ? '_blank' : undefined}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}

export const getLinkTarget = (href: string, newTab?: boolean) => {
  if (href.startsWith('http')) return '_blank'
  const { isNative, platform } = getNativePlatform()
  // Native android will open 'a new tab' in the system browser rather than in the app
  if (isNative && platform === 'android') return '_self'
  return newTab ? '_blank' : '_self'
}
