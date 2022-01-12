import { Fragment } from 'react'
import { SiteLink } from './site-link'

// Return a JSX span, linkifying @username, #hashtags, and https://...
export function Linkify(props: { text: string; gray?: boolean }) {
  const { text, gray } = props
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
    <span className="break-words">
      {text.split(regex).map((part, i) => (
        <Fragment key={i}>
          {part}
          {links[i]}
        </Fragment>
      ))}
    </span>
  )
}
