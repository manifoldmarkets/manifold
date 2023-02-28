import { Editor } from '@tiptap/react'
import { useState } from 'react'
import { AlertBox } from '../widgets/alert-box'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { CopyLinkButton } from '../buttons/copy-link-button'

const MODIFIERS =
  '8k, beautiful, illustration, trending on art station, picture of the day, epic composition'

export function DreamModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen, editor } = props
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const onDream = ({ prompt, url }: DreamResults) => {
    setPrompt(prompt)
    setImageUrl(url)
  }

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="bg-canvas-0 gap-2 rounded">
        <DreamCard {...props} onDream={onDream} />
        {imageUrl && (
          <>
            <img src={imageUrl} alt="Image" />
            {/* Show the current imageUrl */}
            {/* TODO: Keep the other generated images, so the user can play with different attempts. */}
            <Col className="gap-2 p-6">
              <CopyLinkButton url={imageUrl} />

              <Row className="gap-2">
                <Button
                  onClick={() => {
                    const imageCode = `<img src="${imageUrl}" alt="${prompt}" />`
                    if (editor) {
                      editor.chain().insertContent(imageCode).run()
                      setOpen(false)
                    }
                  }}
                >
                  Add image
                </Button>
                <Button
                  color="gray"
                  onClick={() => {
                    setOpen(false)
                  }}
                >
                  Cancel
                </Button>
              </Row>
            </Col>
          </>
        )}
      </Col>
    </Modal>
  )
}

export type DreamResults = {
  prompt: string
  url: string
}

// Note: this is currently tied to a DreamStudio API key tied to akrolsmir@gmail.com,
// and injected on Vercel.
const API_KEY = process.env.NEXT_PUBLIC_DREAM_KEY

export async function dreamDefault(input: string) {
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
  // For faster local development, just use this hardcoded image:
  // const json = {
  //   url: 'https://firebasestorage.googleapis.com/v0/b/dev-mantic-markets.appspot.com/o/dream%2FtWI0cid8Wr.png?alt=media&token=26745bc7-a9eb-472a-860a-e9de20de5ead',
  // }
  return json.url
}

export function DreamCard(props: {
  onDream: (dreamResults: DreamResults) => void
}) {
  const { onDream } = props
  const [input, setInput] = useState('')
  const [isDreaming, setIsDreaming] = useState(false)

  if (!API_KEY) {
    return (
      <AlertBox
        title="Missing API Key"
        text="An API key from https://beta.dreamstudio.ai/ is needed to dream; add it to your web/.env.local"
      />
    )
  }

  async function requestDream() {
    setIsDreaming(true)
    const url = await dreamDefault(input)
    onDream({ prompt: input, url })
    setIsDreaming(false)
  }

  return (
    <Col className="gap-2 p-6">
      <div className="text-ink-600 pt-2 text-sm">
        Ask our AI to generate a custom image
      </div>
      <Row className="gap-2">
        <input
          autoFocus
          type="text"
          name="embed"
          id="embed"
          className="border-ink-300 placeholder:text-ink-300 focus:border-primary-500 focus:ring-primary-500 block w-full rounded-md shadow-sm sm:text-sm"
          placeholder="Prediction markets taking over the world"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
        />
        <Button
          className="whitespace-nowrap"
          onClick={requestDream}
          loading={isDreaming}
        >
          Dream
          {/* TODO: Charge Ṁ5 with ({formatMoney(5)}) */}
        </Button>
      </Row>
      {isDreaming && (
        <div className="text-sm">This may take ~10 seconds...</div>
      )}
      {/* TODO: Allow the user to choose their own modifiers */}
      <div className="text-ink-300 pt-2 text-xs">Modifiers: {MODIFIERS}</div>
    </Col>
  )
}
