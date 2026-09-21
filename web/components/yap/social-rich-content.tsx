import type { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import Link from 'next/link'
import { Fragment, ReactNode, useMemo } from 'react'
import { socialRichContentDisplaySchema } from 'common/social-rich-content'
import { getSocialLinks, SocialText } from './social-text'
import { SocialUserLink } from './social-user-link'

export const socialMarketMentionLabel = (path: string) => {
  const slug = path.split('/').pop() ?? path
  try {
    return decodeURIComponent(slug).replace(/-/g, ' ')
  } catch {
    return slug.replace(/-/g, ' ')
  }
}

function renderText(text: string) {
  const links = getSocialLinks(text)
  return (
    <>
      {links.map((link, index) => (
        <Fragment key={link.start}>
          {text.slice(links[index - 1]?.end ?? 0, link.start)}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer ugc"
            className="text-primary-700 hover:underline"
          >
            {link.value}
          </a>
        </Fragment>
      ))}
      {text.slice(links[links.length - 1]?.end ?? 0)}
    </>
  )
}

function renderChildren(nodes: JSONContent[] = []) {
  // A literal URL may span adjacent text nodes in pasted or API-created data.
  const merged: JSONContent[] = []
  for (const node of nodes) {
    const previous = merged[merged.length - 1]
    if (node.type === 'text' && previous?.type === 'text')
      previous.text = (previous.text ?? '') + (node.text ?? '')
    else merged.push({ ...node })
  }
  return merged.map((child, index) => (
    <Fragment key={index}>{renderNode(child)}</Fragment>
  ))
}

function renderNode(node: JSONContent): ReactNode {
  switch (node.type) {
    case 'doc':
      return renderChildren(node.content)
    case 'paragraph':
      return <p className="min-h-[1.5em]">{renderChildren(node.content)}</p>
    case 'text':
      return renderText(node.text ?? '')
    case 'hardBreak':
      return <br />
    case 'mention':
      return (
        <SocialUserLink
          user={{ id: node.attrs!.id, username: node.attrs!.label }}
          label="handle"
          className="text-primary-700 hover:underline"
        />
      )
    case 'contract-mention': {
      const path = node.attrs?.label as string
      if (!/^\/[^/?#\\\s]+\/[^/?#\\\s]+$/.test(path)) return null
      return (
        <Link
          href={path}
          className="text-primary-700 hover:underline"
          prefetch={false}
        >
          %{socialMarketMentionLabel(path)}
        </Link>
      )
    }
    default:
      return null
  }
}

export function SocialRichContent({
  content,
  className,
  fallbackText,
}: {
  content: JSONContent
  className?: string
  fallbackText?: string
}) {
  const parsed = useMemo(
    () => socialRichContentDisplaySchema.safeParse(content),
    [content]
  )
  if (!parsed.success && !fallbackText) return null
  return (
    <div
      className={clsx(
        'text-ink-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
        className
      )}
    >
      {parsed.success ? (
        renderNode(parsed.data)
      ) : (
        <SocialText text={fallbackText ?? ''} />
      )}
    </div>
  )
}
