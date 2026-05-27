import { Col } from 'web/components/layout/col'
import { XIcon } from '@heroicons/react/solid'
import { LinkPreviewProps } from 'web/components/editor/link-preview-extension'
import { Editor } from '@tiptap/react'
import { JSONContent } from '@tiptap/core'
import { filterDefined } from 'common/util/array'
import { api } from 'web/lib/api/api'
import {
  matchManifoldMarketUrl,
  replaceManifoldUrlWithMention,
  replaceUrlWithTitleLink,
} from 'web/components/editor/insert-manifold-mention'
import { isFaviconAllowed } from 'common/favicon-allowlist'

// Title-replacement is only safe when we recognise the destination host —
// otherwise an attacker could host a page with a misleading `<title>` and the
// inline visible text would diverge from the actual link href.
const isHostTrustedForTitleSwap = (url: string) => {
  try {
    return isFaviconAllowed(new URL(url).hostname)
  } catch {
    return false
  }
}

const linkPreviewDismissed: { [key: string]: boolean } = {}
export const LinkPreviewNodeView = (props: LinkPreviewProps) => {
  const {
    title,
    image,
    url,
    description,
    id,
    hideCloseButton,
    inputKey,
    deleteNode,
  } = props

  const handleDelete = () => {
    deleteNode()
    linkPreviewDismissed[inputKey + url] = true
  }
  return (
    <div
      className="border-ink-300 not-prose relative w-full max-w-[25rem] overflow-hidden rounded-lg border"
      key={id}
    >
      {!hideCloseButton && (
        <button
          className={
            'bg-canvas-50 absolute right-2 top-2 z-20 rounded-full p-0.5 hover:invert'
          }
          onClick={handleDelete}
        >
          <XIcon className={'text-ink-900 h-4'} />
        </button>
      )}
      <a
        className="block"
        key={id}
        href={url}
        target={url.includes('manifold.markets') ? '_self' : '_blank'}
        rel="noreferrer ugc"
      >
        <img
          className="m-0 h-[200px] w-full object-cover"
          src={image}
          alt=""
          height={200}
        />
        <Col className="bg-canvas-0 p-2 hover:underline">
          <div className="text-ink-900 line-clamp-2 text-base">{title}</div>
          <div className="text-ink-600 line-clamp-3 text-xs">{description}</div>
        </Col>
      </a>
    </div>
  )
}

export const insertLinkPreviews = async (
  editor: Editor,
  links: string[],
  key: string | undefined
) => {
  await Promise.all(
    links
      .filter((link) => !linkPreviewDismissed[key + link])
      .map(async (link) => {
        try {
          // Manifold market URLs become inline contract-mention widgets
          // (same as typing % and picking from the dropdown).
          const manifold = matchManifoldMarketUrl(link)
          if (manifold) {
            await replaceManifoldUrlWithMention(editor, link, manifold.slug)
            // Don't re-process this URL on future transactions (e.g. if the
            // user undoes our replacement they shouldn't see it re-trigger).
            linkPreviewDismissed[key + link] = true
            return
          }

          const preview = link
            ? await api('fetch-link-preview', { url: link.trim() })
            : null
          if (!preview) return

          // 1) Replace the raw URL inline with the page title as a hyperlink —
          // but only for allowlisted hosts, so a hostile site can't pick its
          // own visible link text (link-text/href phishing).
          if (preview.title && isHostTrustedForTitleSwap(link)) {
            replaceUrlWithTitleLink(editor, link, preview.title)
          }
          // Mark URL as processed so undoing doesn't re-trigger replacement.
          linkPreviewDismissed[key + link] = true

          // 2) Append a rich preview card at the end of the doc (one per doc).
          const content = editor.getJSON()
          const hasCard = content.content?.some(
            (node) => node.type === 'linkPreview'
          )
          if (hasCard) return
          const linkPreviewNodeJSON = {
            type: 'linkPreview',
            attrs: {
              ...preview,
              url: link,
              hideCloseButton: false,
              id: crypto.randomUUID(),
              inputKey: key ?? '',
            },
          }
          const docLength = editor.state.doc.content.size
          editor
            .chain()
            .focus()
            .insertContentAt(docLength ?? 0, linkPreviewNodeJSON)
            .run()
        } catch (e) {
          console.error('error on add preview for link', link, e)
        }
      })
  )
}

export const findLinksInContent = (content: JSONContent) => {
  const linkRegExp =
    /(?:https?:\/\/(?:localhost|[\w-]+(?:\.[\w-]+)+)(?::\d+)?|www\.[\w-]+(?:\.[\w-]+)+)(?:\/[^\s]*)?/g

  const linkMatches = content.content?.flatMap((node) => {
    const contents = node.content?.flat()
    return contents?.flatMap((n) => {
      const { text } = n
      return text !== undefined ? Array.from(text.matchAll(linkRegExp)) : []
    })
  })
  return filterDefined(linkMatches?.map((m) => m?.[0]) ?? [])
}
