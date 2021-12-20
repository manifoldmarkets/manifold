import Link from 'next/link'
import { Fragment } from 'react'

// Return a JSX span, linkifying @username, #hashtags, and https://...
export function Linkify(props: { text: string }) {
  const { text } = props
  const regex = /(?:^|\s)(?:[@#][a-z0-9_]+|https?:\/\/\S+)/gi
  const matches = text.match(regex) || []
  const links = matches.map((match) => {
    // Matches are in the form: " @username" or "https://example.com"
    const whitespace = match.match(/^\s/)
    const symbol = match.trim().substring(0, 1)
    const tag = match.trim().substring(1)
    const href =
      {
        '@': `/${tag}`,
        '#': `/tag/${tag}`,
      }[symbol] ?? match

    return (
      <>
        {whitespace}
        <Link href={href}>
          <a className="text-indigo-700 hover:underline hover:decoration-2">
            {symbol}
            {tag}
          </a>
        </Link>
      </>
    )
  })
  return (
    <span>
      {text.split(regex).map((part, i) => (
        <Fragment key={i}>
          {part}
          {links[i]}
        </Fragment>
      ))}
    </span>
  )
}
