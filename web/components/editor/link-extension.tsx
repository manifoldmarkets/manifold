import { mergeAttributes } from '@tiptap/core'
import { Link as TiptapLink } from '@tiptap/extension-link'
import NextLink from 'next/link'
import { ReactNode } from 'react'
import { linkClass, LinkFavicon } from 'web/components/widgets/site-link'

const LinkComponent = (props: { href: string; children: ReactNode }) => {
  const { href: rawHref, children } = props
  const href = safeHref(rawHref)

  if (isInternal(href)) {
    return (
      <NextLink href={href} className={linkClass} prefetch={false}>
        {children}
      </NextLink>
    )
  }

  return (
    <a href={href} target="_blank" rel="noopener ugc" className={linkClass}>
      <LinkFavicon href={href} />
      {children}
    </a>
  )
}

export const DisplayLink = TiptapLink.extend({
  renderHTML({ HTMLAttributes }) {
    HTMLAttributes.href = safeHref(HTMLAttributes.href)

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

// Allow http(s) absolute URLs, root-relative paths, and in-page anchors only.
// Reject protocol-relative (`//host`, `/\host`) and everything else
// (javascript:, data:, vbscript:, file:, etc.) → '#'.
const isLocalPath = (href: string) =>
  (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')) ||
  href.startsWith('#')

const safeHref = (href: string | undefined | null): string => {
  if (!href) return '#'
  if (isLocalPath(href)) return href
  if (/^https?:\/\//i.test(href)) return href
  return '#'
}

const INTERNAL_HOSTS = new Set([
  'manifold.markets',
  'manifold.love',
  'localhost',
])

const isInternal = (href: string) => {
  if (isLocalPath(href)) return true
  try {
    const { hostname } = new URL(href)
    return (
      INTERNAL_HOSTS.has(hostname) ||
      hostname.endsWith('.manifold.markets') ||
      hostname.endsWith('.manifold.love')
    )
  } catch {
    return false
  }
}
