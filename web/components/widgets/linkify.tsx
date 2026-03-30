import clsx from 'clsx'
import Link from 'next/link'
import { Fragment } from 'react'
import { useNativeInfo } from '../native-message-provider'
import { linkClass } from './site-link'

// Return a JSX span, linkifying @username, and https://...
export function Linkify(props: { text: string; className?: string }) {
  const { text, className } = props
  // Replace "m1234" with "ϻ1234"
  // const mRegex = /(\W|^)m(\d+)/g
  // text = text.replace(mRegex, (_, pre, num) => `${pre}ϻ${num}`)

  // Find instances of @username, #hashtag, and https://...
  const regex =
    /(?:^|\s)(?:@[a-z0-9_]+|https?:\/\/[-A-Za-z0-9+&@#/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#/%=~_|])/gi
  const matches = text.match(regex) || []
  const links = matches.map((match) => {
    // Matches are in the form: " @username" or "https://example.com"
    const whitespace = match.match(/^\s/)
    const symbol = match.trim().substring(0, 1)
    const tag = match.trim().substring(1)
    const href =
      {
        '@': `/${tag}`,
      }[symbol] ?? match.trim()
    const target = getLinkTarget(href)
    const className = clsx(linkClass, 'text-primary-700')

    return (
      <>
        {whitespace}
        {isInternalHref(href) ? (
          <Link target={target} className={className} href={href}>
            {symbol}
            {tag}
          </Link>
        ) : (
          <a
            target={target}
            rel={target === '_blank' ? 'noopener noreferrer' : undefined}
            className={className}
            href={href}
          >
            {symbol}
            {tag}
          </a>
        )}
      </>
    )
  })
  return (
    <span className={clsx(className, 'break-anywhere')}>
      {text.split(regex).map((part, i) => (
        <Fragment key={i}>
          {part}
          {links[i]}
        </Fragment>
      ))}
    </span>
  )
}

const isInternalHref = (href: string) => href.startsWith('/')

export const getLinkTarget = (href: string, newTab?: boolean) => {
  if (
    href.startsWith('http') &&
    !href.startsWith(`https://manifold`) // covers manifold.markets and manifold.love
  )
    return '_blank'
  const { isNative } = useNativeInfo()
  // Native will open 'a new tab' when target = '_blank' in the system browser rather than in the app
  if (isNative) return '_self'
  return newTab ? '_blank' : '_self'
}
