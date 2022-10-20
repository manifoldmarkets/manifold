import { Editor } from '@tiptap/react'
import { useState } from 'react'
import { AlertBox } from '../widgets/alert-box'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'

const MODIFIERS =
  '8k, beautiful, illustration, trending on art station, picture of the day, epic composition'

export function DreamModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props

  return (
    <Modal open={open} setOpen={setOpen}>
      <Dream {...props} />
    </Modal>
  )
}

// Note: this is currently tied to a DreamStudio API key tied to akrolsmir@gmail.com,
// and injected on Vercel.
const API_KEY = process.env.NEXT_PUBLIC_DREAM_KEY

function Dream(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { editor, setOpen } = props
  const [input, setInput] = useState('')
  const [isDreaming, setIsDreaming] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const imageCode = `<img src="${imageUrl}" alt="${input}" />`

  if (!API_KEY) {
    return (
      <AlertBox
        title="Missing API Key"
        text="An API key from https://beta.dreamstudio.ai/ is needed to dream; add it to your web/.env.local"
      />
    )
  }

  async function dream() {
    setIsDreaming(true)
    const data = {
      prompt: input + ', ' + MODIFIERS,
      apiKey: API_KEY,
    }
    const response = await fetch(`/api/v0/dream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json()
    setImageUrl(json.url)
    setIsDreaming(false)
  }

  return (
    <Col className="gap-2 rounded bg-white p-6">
      <Row className="gap-2">
        <input
          autoFocus
          type="text"
          name="embed"
          id="embed"
          className="block w-full rounded-md border-gray-300 shadow-sm placeholder:text-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="A crane playing poker on a green table"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
        />
        <Button
          className="whitespace-nowrap"
          onClick={dream}
          loading={isDreaming}
        >
          Dream
          {/* TODO: Charge M$5 with ({formatMoney(5)}) */}
        </Button>
      </Row>
      {isDreaming && (
        <div className="text-sm">This may take ~10 seconds...</div>
      )}
      {/* TODO: Allow the user to choose their own modifiers */}
      <div className="pt-2 text-sm text-gray-400">
        Commission a custom image using AI.
      </div>
      <div className="pt-2 text-xs text-gray-400">Modifiers: {MODIFIERS}</div>

      {/* Show the current imageUrl */}
      {/* TODO: Keep the other generated images, so the user can play with different attempts. */}
      {imageUrl && (
        <>
          <img src={imageUrl} alt="Image" />
          <Row className="gap-2">
            <Button
              disabled={isDreaming}
              onClick={() => {
                if (editor) {
                  editor.chain().insertContent(imageCode).run()
                  setInput('')
                  setOpen(false)
                }
              }}
            >
              Add image
            </Button>
            <Button
              color="gray"
              onClick={() => {
                setInput('')
                setOpen(false)
              }}
            >
              Cancel
            </Button>
          </Row>
        </>
      )}
    </Col>
  )
}
