import { Editor } from '@tiptap/react'
import { useState } from 'react'
import { TwitterTweetEmbed } from 'react-twitter-embed'
import { Button } from '../button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'

// A valid tweet URL looks like 'https://twitter.com/username/status/123456789'
// Return the tweetId if the URL is valid, otherwise return null.
function getTweetId(text: string) {
  const match = text.match(/^https?:\/\/twitter\.com\/.*\/status\/(\d+)$/)
  return match ? match[1] : null
}

export function TweetModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { editor, open, setOpen } = props
  const [input, setInput] = useState('')
  const tweetId = getTweetId(input)
  const tweetCode = `<tiptap-tweet tweetid="${tweetId}"></tiptap-tweet>`
  console.log('tweetCode', tweetCode)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="gap-2 rounded bg-white p-6">
        <label
          htmlFor="embed"
          className="block text-sm font-medium text-gray-700"
        >
          Tweet link
        </label>
        <input
          type="text"
          name="embed"
          id="embed"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="e.g. https://twitter.com/jahooma/status/1557429814990196736"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        {/* Preview the embed if it's valid */}
        {tweetId ? <TwitterTweetEmbed tweetId={tweetId} /> : <Spacer h={2} />}

        <Row className="gap-2">
          <Button
            disabled={!tweetId}
            onClick={() => {
              if (editor && tweetId) {
                editor.chain().insertContent(tweetCode).run()
                console.log('editorjson', editor.getJSON())
                setInput('')
                setOpen(false)
              }
            }}
          >
            Embed
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
      </Col>
    </Modal>
  )
}
