import type { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import Link from 'next/link'
import { Fragment, ReactNode, useMemo } from 'react'
import { socialRichContentDisplaySchema } from 'common/social-rich-content'

export const isSocialRichLink = (href: unknown): href is string => {
  if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return false
  try {
    const url = new URL(href)
    return !url.username && !url.password
  } catch {
    return false
  }
}

export const socialMarketMentionLabel = (path: string) => {
  const slug = path.split('/').pop() ?? path
  try {
    return decodeURIComponent(slug).replace(/-/g, ' ')
  } catch {
    return slug.replace(/-/g, ' ')
  }
}

function withMarks(node: JSONContent, children: ReactNode) {
  return [...(node.marks ?? [])].reverse().reduce((result, mark) => {
    if (mark.type === 'bold') return <strong>{result}</strong>
    if (mark.type === 'italic') return <em>{result}</em>
    if (mark.type === 'strike') return <s>{result}</s>
    if (mark.type === 'code')
      return (
        <code className="bg-ink-100 rounded px-1 py-0.5 font-mono text-[0.9em]">
          {result}
        </code>
      )
    // Mentions already have their own link; a link mark must not nest anchors.
    if (
      mark.type === 'link' &&
      node.type === 'text' &&
      isSocialRichLink(mark.attrs?.href)
    )
      return (
        <a
          href={mark.attrs.href}
          target="_blank"
          rel="noopener noreferrer ugc"
          className="text-primary-700 hover:underline"
        >
          {result}
        </a>
      )
    return result
  }, children)
}

function renderNode(node: JSONContent): ReactNode {
  const children = node.content?.map((child, index) => (
    <Fragment key={index}>{renderNode(child)}</Fragment>
  ))
  switch (node.type) {
    case 'doc':
      return children
    case 'paragraph':
      return <p className="min-h-[1.5em]">{children}</p>
    case 'text':
      return withMarks(node, node.text)
    case 'hardBreak':
      return <br />
    case 'bulletList':
      return <ul className="my-2 list-disc pl-5">{children}</ul>
    case 'orderedList':
      return (
        <ol start={node.attrs?.start} className="my-2 list-decimal pl-5">
          {children}
        </ol>
      )
    case 'listItem':
      return <li>{children}</li>
    case 'blockquote':
      return (
        <blockquote className="border-ink-300 text-ink-600 my-2 border-l-2 pl-3">
          {children}
        </blockquote>
      )
    case 'mention':
      return withMarks(
        node,
        <Link
          href={`/${encodeURIComponent(node.attrs?.label ?? '')}`}
          className="text-primary-700 hover:underline"
          prefetch={false}
        >
          @{node.attrs?.label}
        </Link>
      )
    case 'contract-mention': {
      const path = node.attrs?.label as string
      if (!/^\/[^/?#\\\s]+\/[^/?#\\\s]+$/.test(path)) return null
      return withMarks(
        node,
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
      {parsed.success ? renderNode(parsed.data) : fallbackText}
    </div>
  )
}
