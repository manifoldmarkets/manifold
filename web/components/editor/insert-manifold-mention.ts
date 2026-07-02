import { Editor } from '@tiptap/react'
import { contractPath } from 'common/contract'
import { api } from 'web/lib/api/api'

const isManifoldHost = (hostname: string) =>
  hostname === 'manifold.markets' ||
  hostname === 'manifold.love' ||
  hostname === 'localhost' ||
  hostname.endsWith('.manifold.markets') ||
  hostname.endsWith('.manifold.love')

const SLUG_REGEX = /^[a-z0-9-]+$/i

export const matchManifoldMarketUrl = (url: string) => {
  try {
    const u = new URL(url.trim())
    if (!isManifoldHost(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const slug = parts[1]
    if (!SLUG_REGEX.test(slug)) return null
    return { username: parts[0], slug }
  } catch {
    return null
  }
}

// Find the [from, to] document range of `target` text inside the editor.
// Matches whether or not the text is wrapped in a link mark (TipTap auto-
// linkifies pasted URLs, so the URL we want to replace is usually already
// inside one).
const findTextRange = (
  editor: Editor,
  target: string
): { from: number; to: number } | null => {
  let from = -1
  editor.state.doc.descendants((node, pos) => {
    if (from !== -1) return false
    if (node.isText && node.text) {
      const idx = node.text.indexOf(target)
      if (idx !== -1) {
        from = pos + idx
        return false
      }
    }
    return undefined
  })
  return from === -1 ? null : { from, to: from + target.length }
}

// Replace a bare URL with an inline hyperlink whose visible text is the
// fetched page title. e.g. `https://en.wikipedia.org/wiki/Magnus_Carlsen`
// becomes `Magnus Carlsen - Wikipedia` (with the URL as the href).
export const replaceUrlWithTitleLink = (
  editor: Editor,
  url: string,
  title: string
) => {
  const cleanTitle = title.trim()
  if (!cleanTitle || cleanTitle === url) return
  const range = findTextRange(editor, url)
  if (!range) return
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContentAt(range.from, [
      {
        type: 'text',
        text: cleanTitle,
        marks: [
          {
            type: 'link',
            attrs: { href: url, target: '_blank', rel: 'noopener ugc' },
          },
        ],
      },
      { type: 'text', text: ' ' },
    ])
    .run()
}

// Replace a pasted Manifold market URL with an inline contract-mention node
// (the same widget produced by typing `%` and picking from the dropdown).
export const replaceManifoldUrlWithMention = async (
  editor: Editor,
  url: string,
  slug: string
) => {
  try {
    const contract = await api('slug/:slug', { slug, lite: true })
    if (!contract) return
    const range = findTextRange(editor, url)
    if (!range) return
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContentAt(range.from, [
        {
          type: 'contract-mention',
          attrs: {
            id: contract.id,
            label: contractPath(contract),
          },
        },
        { type: 'text', text: ' ' },
      ])
      .run()
  } catch (e) {
    // Slug not found, network error, etc. — leave URL as-is.
  }
}
