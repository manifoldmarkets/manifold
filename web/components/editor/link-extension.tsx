import { mergeAttributes } from '@tiptap/core'
import { Link as TiptapLink } from '@tiptap/extension-link'
import NextLink from 'next/link'
import { ReactNode } from 'react'
import { linkClass } from 'web/components/widgets/site-link'

const LinkComponent = (props: { href: string; children: ReactNode }) => {
  const { href, children } = props

  if (isInternal(href)) {
    return (
      <NextLink href={href} className={linkClass} prefetch={false}>
        {children}
      </NextLink>
    )
  }

  return (
    <a href={href} target="_blank" rel="noopener ugc" className={linkClass}>
      {children}
    </a>
  )
}

export const DisplayLink = TiptapLink.extend({
  renderHTML({ HTMLAttributes }) {
    // This is used for SSR and copy/paste
    HTMLAttributes.target = isInternal(HTMLAttributes.href) ? '_self' : '_blank'
    delete HTMLAttributes.class // only use our classes (don't duplicate on paste)

    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ]
  },

  renderReact(attrs: any, children: ReactNode) {
    return <LinkComponent href={attrs.href}>{children}</LinkComponent>
  },
}).configure({
  openOnClick: false, // stop link opening twice (browser still opens)
  HTMLAttributes: {
    rel: 'noopener ugc',
    class: linkClass,
  },
})

const isInternal = (href: string) =>
  href.startsWith('/') ||
  href.startsWith('#') ||
  href.includes('manifold.markets') ||
  href.includes('localhost')
