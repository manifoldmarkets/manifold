import { Editor } from '@tiptap/react'
import { useState } from 'react'
import { TwitterTweetEmbed } from 'react-twitter-embed'
import { Button } from '../button'
import { RichContent } from '../editor'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'

function isValidIframe(text: string) {
  return /^<iframe.*<\/iframe>$/.test(text)
}

// A valid tweet URL looks like 'https://twitter.com/username/status/123456789'
// Return the tweetId if the URL is valid, otherwise return null.
function getTweetId(text: string) {
  const match = text.match(/^https?:\/\/twitter\.com\/.*\/status\/(\d+)/)
  return match ? match[1] : null
}

// A valid YouTube URL looks like 'https://www.youtube.com/watch?v=ziq7FUKpCS8'
function getYoutubeId(text: string) {
  const match = text.match(/^https?:\/\/www\.youtube\.com\/watch\?v=([^&]+)/)
  return match ? match[1] : null
}

function isValidUrl(text: string) {
  // Conjured by Codex
  return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(
    text
  )
}

function embedCode(text: string) {
  if (isValidIframe(text)) {
    return text
  } else if (getTweetId(text)) {
    // Append a leading 't', to prevent tweetId from being interpreted as a number.
    // If it's a number, there may be numeric precision issues.
    return `<tiptap-tweet tweetid="t${getTweetId(text)}"></tiptap-tweet>`
  } else if (getYoutubeId(text)) {
    return `<iframe src="https://www.youtube.com/embed/${getYoutubeId(
      text
    )}"></iframe>`
  } else if (isValidUrl(text)) {
    return `<iframe src="${text}"></iframe>`
  }
  // Return null if the text is not embeddable.
  return null
}

export function EmbedModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { editor, open, setOpen } = props
  const [input, setInput] = useState('')
  const embed = embedCode(input)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="gap-2 rounded bg-white p-6">
        <label
          htmlFor="embed"
          className="block text-sm font-medium text-gray-700"
        >
          Embed a Youtube video, Tweet, or other link
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
        {embed ? <RichContent content={embed} /> : <Spacer h={2} />}

        <Row className="gap-2">
          <Button
            disabled={!embed}
            onClick={() => {
              if (editor && embed) {
                editor.chain().insertContent(embed).run()
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
