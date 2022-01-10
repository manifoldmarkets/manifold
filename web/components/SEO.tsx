import Head from 'next/head'

export type OpenGraphProps = {
  question: string
  probability: string
  metadata: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl: string
}

function buildCardUrl(props: OpenGraphProps) {
  // URL encode each of the props, then add them as query params
  return (
    `https://manifold-og-image.vercel.app/m.png` +
    `?question=${encodeURIComponent(props.question)}` +
    `&probability=${encodeURIComponent(props.probability)}` +
    `&metadata=${encodeURIComponent(props.metadata)}` +
    `&creatorName=${encodeURIComponent(props.creatorName)}` +
    `&creatorUsername=${encodeURIComponent(props.creatorUsername)}` +
    `&creatorAvatarUrl=${encodeURIComponent(props.creatorAvatarUrl)}`
  )
}

export function SEO(props: {
  title: string
  description: string
  url?: string
  children?: any[]
  openGraph?: OpenGraphProps
}) {
  const { title, description, url, children, openGraph } = props

  return (
    <Head>
      <title>{title} | Manifold Markets</title>

      <meta
        property="og:title"
        name="twitter:title"
        content={title}
        key="title"
      />
      <meta name="description" content={description} key="description1" />
      <meta
        property="og:description"
        name="twitter:description"
        content={description}
        key="description2"
      />

      {url && (
        <meta
          property="og:url"
          content={'https://manifold.markets' + url}
          key="url"
        />
      )}

      {openGraph && (
        <>
          <meta
            property="og:image"
            content={buildCardUrl(openGraph)}
            key="image1"
          />
          <meta name="twitter:card" content="summary_large_image" key="card" />
          <meta
            name="twitter:image"
            content={buildCardUrl(openGraph)}
            key="image2"
          />
        </>
      )}

      {children}
    </Head>
  )
}
