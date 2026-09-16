import { find } from 'linkifyjs'
import { Fragment } from 'react'

export const getSocialLinks = (text: string) =>
  find(text).filter(
    (link) => link.type === 'url' && /^https?:\/\//i.test(link.value)
  )

// React escapes all text; only explicit HTTP(S) URLs become links.
export function SocialText({ text }: { text: string }) {
  const links = getSocialLinks(text)
  return (
    <p className="text-ink-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {links.map((link, i) => (
        <Fragment key={link.start}>
          {text.slice(links[i - 1]?.end ?? 0, link.start)}
          <a
            className="text-primary-700 hover:underline"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.value}
          </a>
        </Fragment>
      ))}
      {text.slice(links[links.length - 1]?.end ?? 0)}
    </p>
  )
}
