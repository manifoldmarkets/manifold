import { Col } from 'web/components/layout/col'
import { LinkPreviewProps } from 'web/components/editor/link-preview-extension'
import { XIcon } from '@heroicons/react/solid'

export const LinkPreviewNodeView = (props: LinkPreviewProps) => {
  const { title, image, url, description, id } = props
  const handleDelete = () =>
    window.dispatchEvent(new CustomEvent('deleteNode', { detail: id }))

  return (
    <>
      <Col className=" relative w-[17rem] sm:w-[22rem] md:w-[25rem]" key={id}>
        <img
          className=" m-0 rounded-t-lg object-contain "
          src={image}
          alt={title}
          height={200}
        />
        <button
          className={
            ' bg-canvas-50 absolute top-2 right-2 z-20 rounded-full p-0.5 hover:invert'
          }
          onClick={handleDelete}
        >
          <XIcon className={'text-ink-900 h-4'} />
        </button>
        <a className={'absolute inset-0 z-10'} href={url} />
        <Col className="bg-canvas-0 border-ink-300 rounded-b-lg border p-2 hover:underline">
          <div className="line-clamp-2 text-ink-900 text-base">{title}</div>
          <div className="line-clamp-3 text-ink-600 text-xs">{description}</div>
        </Col>
      </Col>
    </>
  )
}
