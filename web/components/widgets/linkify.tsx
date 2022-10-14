import clsx from 'clsx'
import { Fragment } from 'react'
import { SiteLink } from './site-link'

// Return a JSX span, linkifying @username, and https://...
export function Linkify(props: {
  text: string
  className?: string
  gray?: boolean
}) {
  const { text, className, gray } = props
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

    return (
      <>
        {whitespace}
        <SiteLink
          className={gray ? 'text-gray-500' : 'text-indigo-700'}
          href={href}
        >
          {symbol}
          {tag}
        </SiteLink>
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
