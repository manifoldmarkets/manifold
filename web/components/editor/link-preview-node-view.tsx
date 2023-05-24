import { Col } from 'web/components/layout/col'
import { XIcon } from '@heroicons/react/solid'
import { LinkPreviewProps } from 'web/components/editor/link-preview-extension'
import { Editor } from '@tiptap/react'
import { JSONContent } from '@tiptap/core'
import { filterDefined } from 'common/util/array'

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
    <>
      <Col className=" relative w-[17rem] sm:w-[22rem] md:w-[25rem]" key={id}>
        <img
          className=" border-ink-300 m-0 rounded-t-lg border object-contain "
          src={image}
          alt={title}
          height={200}
        />
        {!hideCloseButton && (
          <button
            className={
              ' bg-canvas-50 absolute top-2 right-2 z-20 rounded-full p-0.5 hover:invert'
            }
            onClick={handleDelete}
          >
            <XIcon className={'text-ink-900 h-4'} />
          </button>
        )}
        <a className={'absolute inset-0 z-10'} href={url} />
        <Col className="bg-canvas-0 border-ink-300 rounded-b-lg border border-t-0 p-2 hover:underline">
          <div className="line-clamp-2 text-ink-900 text-base">{title}</div>
          <div className="line-clamp-3 text-ink-600 text-xs">{description}</div>
        </Col>
      </Col>
    </>
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
          const res = await fetch('/api/v0/fetch-link-preview', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: link,
            }),
          })
          const resText = await res.json()
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
