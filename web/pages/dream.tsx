import { useState } from 'react'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { DreamCard } from 'web/components/editor/image-modal'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'

export default function App() {
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const onDream = ({ prompt, url }: DreamResults) => {
    setPrompt(prompt)
    setImageUrl(url)
  }

  return (
    <Page className="">
      <SEO
        title="Dream"
        description="Commission a custom image using AI."
        url="/dream"
      />
      <Col className="gap-2">
        <DreamCard onDream={onDream} />
        {imageUrl && (
          <>
            <img src={imageUrl} alt="Image" width={512} />
            {/* Show the current imageUrl */}
            {/* TODO: Keep the other generated images, so the user can play with different attempts. */}
            <CopyLinkButton url={imageUrl} />
          </>
        )}
      </Col>
    </Page>
  )
}
