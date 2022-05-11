import { Fragment } from 'react'
import { SiteLink } from './site-link'

// Return a JSX span, linkifying @username, #hashtags, and https://...
// TODO: Use a markdown parser instead of rolling our own here.
export function Linkify(props: { text: string; gray?: boolean }) {
  const { text, gray } = props
  const regex =
    /(?<=^|\s|\()(?:[@#][a-z0-9_]+|https?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_|])/gi

  const matches = text.match(regex) || []
  const links = matches.map((match) => {
    // Matches are in the form: " @username" or "https://example.com"
    const symbol = match.substring(0, 1)
    const tag = match.substring(1)
    const href =
      {
        '@': `/${tag}`,
        '#': `/tag/${tag}`,
      }[symbol] ?? match

    return (
      <>
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
    <span
      className="break-words"
      style={{ /* For iOS safari */ wordBreak: 'break-word' }}
    >
      {text.split(regex).map((part, i) => (
        <Fragment key={i}>
          {part}
          {links[i]}
        </Fragment>
      ))}
    </span>
  )
}
