import { IGif } from '@giphy/js-types'
import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { debounce } from 'lodash'
import { useCallback, useEffect, useState } from 'react'
import Masonry from 'react-masonry-css'
import { searchGiphy } from 'web/lib/firebase/api'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Input } from '../widgets/input'

export function GIFModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen, editor } = props
  const [term, setTerm] = useState<string>('')
  const [gifResults, setGifResults] = useState<IGif[]>([])
  const [error, setError] = useState<string | null>(null)

  const debouncedSearch = useCallback(
    debounce((term) => {
      searchGiphy({ term, limit: 20 }).then((res) => {
        if (res.status === 'success') {
          setGifResults(res.data)
        } else {
          setError(res.data as string)
        }
      })
    }, 250),
    []
  )

  useEffect(() => {
    if (open) debouncedSearch(term)
  }, [term, open])

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="sticky top-0 h-8 w-full"
        />
        {error && <div className="text-red-500">{error}</div>}
        <Masonry
          breakpointCols={2}
          className="-ml-4 flex h-[60ch] overflow-y-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {gifResults.map((gif) => (
            <GifButton
              gif={gif}
              editor={editor}
              setOpen={setOpen}
              key={gif.id}
            />
          ))}
        </Masonry>
      </Col>
    </Modal>
  )
}

export function GifButton(props: {
  gif: IGif
  editor: Editor | null
  setOpen: (open: boolean) => void
}) {
  const { gif, editor, setOpen } = props
  const imageUrl = gif.images.original.url
  return (
    <button
      onClick={() => {
        const imageCode = `<img src="${imageUrl}" alt="${gif.title}"/>`
        if (editor) {
          editor.chain().insertContent(imageCode).run()
          setOpen(false)
        }
      }}
      className="hover:border-primary-500 overflow-none my-1.5 rounded-md border-[3px] border-transparent transition-all hover:shadow-sm"
    >
      <img
        src={imageUrl}
        alt={gif.title}
        width={200}
        className={'rounded-sm object-contain'}
      />
    </button>
  )
}
