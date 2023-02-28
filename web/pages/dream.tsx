import { useState } from 'react'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { DreamCard, DreamResults } from 'web/components/editor/image-modal'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import Image from 'next/image'

const PLACEHOLDERS = [
  {
    placeholderPrompt: 'A retropunk samurai in San Francisco',
    placeholderUrl:
      'https://firebasestorage.googleapis.com/v0/b/dev-mantic-markets.appspot.com/o/dream%2F9CSf7B_ElH.png?alt=media&token=09dff5f9-df7e-4054-86b5-8550cc71b56b',
  },
  {
    placeholderPrompt: 'Birthday party for an awesome hacker',
    placeholderUrl:
      'https://firebasestorage.googleapis.com/v0/b/dev-mantic-markets.appspot.com/o/dream%2FUJipi9pNnm.png?alt=media&token=2713eb8b-60b3-4d15-99c0-3aa32cc07988',
  },
  {
    placeholderPrompt: 'Prediction markets taking over the world',
    placeholderUrl:
      'https://firebasestorage.googleapis.com/v0/b/dev-mantic-markets.appspot.com/o/dream%2FVu-39YtvNU.png?alt=media&token=ed6e3891-2fee-42bc-94ad-fb5bb666b2f1',
  },
]

export default function App() {
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const onDream = ({ url, prompt }: DreamResults) => {
    setImageUrl(url)
    setPrompt(prompt)
  }
  const { placeholderPrompt, placeholderUrl } = PLACEHOLDERS[2]

  return (
    <Page className="">
      <SEO
        title="Dream"
        description="Ask our AI to generate a custom image"
        url="/dream"
      />
      <Col>
        <Col className="bg-canvas-0 mx-auto max-w-lg gap-2 rounded">
          <DreamCard onDream={onDream} />
          {imageUrl ? (
            <>
              <img src={imageUrl} alt={prompt} width={512} />
              {/* Show the current imageUrl */}
              <Col className="p-6">
                {/* TODO: Make the sharing experience more viral; use a nicer URL */}
                <CopyLinkButton url={imageUrl} />
              </Col>
            </>
          ) : (
            // Use a placeholder image
            <Image
              alt={placeholderPrompt}
              width={512}
              height={512}
              src={placeholderUrl}
            />
          )}
        </Col>
      </Col>
    </Page>
  )
}
