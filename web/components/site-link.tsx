import clsx from 'clsx'
import Link from 'next/link'

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
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
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

function MaybeLink(props: { href: string; children: React.ReactNode }) {
  const { href, children } = props
  return href.startsWith('http') ? (
    <>{children}</>
  ) : (
    <Link href={href}>{children}</Link>
  )
}
