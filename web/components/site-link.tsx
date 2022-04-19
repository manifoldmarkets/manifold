import clsx from 'clsx'
import Link from 'next/link'

export const SiteLink = (props: {
  href: string
  children?: any
  onClick?: () => void
  className?: string
}) => {
  const { href, children, onClick, className } = props

  return href.startsWith('http') ? (
    <a
      href={href}
      className={clsx(
        'z-10 break-words hover:underline hover:decoration-indigo-400 hover:decoration-2',
        className
      )}
      style={{ /* For iOS safari */ wordBreak: 'break-word' }}
      target="_blank"
      onClick={(e) => {
        e.stopPropagation()
        if (onClick) onClick()
      }}
    >
      {children}
    </a>
  ) : (
    <Link href={href}>
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
    </Link>
  )
}
