import { Col } from 'web/components/layout/col'
import { XIcon } from '@heroicons/react/solid'
import { LinkPreviewProps } from 'web/components/editor/link-preview-extension'
import { Editor } from '@tiptap/react'
import { JSONContent } from '@tiptap/core'
import { filterDefined } from 'common/util/array'
import { fetchLinkPreview } from 'web/lib/firebase/api'

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
      className="border-ink-300 not-prose relative w-full max-w-[25rem] overflow-hidden rounded-lg border "
      key={id}
    >
      {!hideCloseButton && (
        <button
          className={
            'bg-canvas-50 absolute top-2 right-2 z-20 rounded-full p-0.5 hover:invert'
          }
          onClick={handleDelete}
        >
          <XIcon className={'text-ink-900 h-4'} />
        </button>
      )}
      <a className="block" key={id} href={url} target="_blank">
        <img
          className="m-0 h-[200px] w-full object-cover"
          src={image}
          alt=""
          height={200}
        />
        <Col className="bg-canvas-0 p-2 hover:underline">
          <div className="line-clamp-2 text-ink-900 text-base">{title}</div>
          <div className="line-clamp-3 text-ink-600 text-xs">{description}</div>
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
          const { data: resText } = await fetchLinkPreview({ url: link })
          if (
            !resText ||
            !resText.title ||
            !resText.description ||
            !resText.image ||
            resText.description === 'Error' ||
            resText.title === 'Error'
          )
            return
          // Another fetch may have added a preview, so check again
          const content = editor.getJSON()
          const containsLinkPreview = content.content?.some(
            (node) => node.type === 'linkPreview'
          )
          if (containsLinkPreview) return
          const linkPreviewNodeJSON = {
            type: 'linkPreview',
            attrs: {
              ...resText,
              url: link,
              hideCloseButton: false,
              id: crypto.randomUUID(),
              inputKey: key ?? '',
            },
          }
          // Append to very end of doc
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
    /(?:^|[^@\w])((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+\S*[^@\s])/g
  const linkMatches = content.content?.flatMap((node) =>
    node.content?.flatMap((n) => {
      return n.text ? Array.from(n.text.matchAll(linkRegExp)) : []
    })
  )
  return filterDefined(linkMatches?.map((m) => m?.[0]) ?? [])
}
