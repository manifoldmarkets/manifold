import Head from 'next/head'

export type OgCardProps = {
  question: string
  probability?: string
  metadata: string
  creatorName: string
  creatorUsername: string
  // TODO: Store creator avatar url in each contract, then enable this
  // creatorAvatarUrl: string
}

function buildCardUrl(props: OgCardProps) {
  const probabilityParam =
    props.probability === undefined
      ? ''
      : `&probability=${encodeURIComponent(props.probability ?? '')}`

  // URL encode each of the props, then add them as query params
  return (
    `https://manifold-og-image.vercel.app/m.png` +
    `?question=${encodeURIComponent(props.question)}` +
    probabilityParam +
    `&metadata=${encodeURIComponent(props.metadata)}` +
    `&creatorName=${encodeURIComponent(props.creatorName)}` +
    `&creatorUsername=${encodeURIComponent(props.creatorUsername)}`
  )
}

export function SEO(props: {
  title: string
  description: string
  url?: string
  children?: any[]
  ogCardProps?: OgCardProps
}) {
  const { title, description, url, children, ogCardProps } = props

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

      {ogCardProps && (
        <>
          <meta
            property="og:image"
            content={buildCardUrl(ogCardProps)}
            key="image1"
          />
          <meta name="twitter:card" content="summary_large_image" key="card" />
          <meta
            name="twitter:image"
            content={buildCardUrl(ogCardProps)}
            key="image2"
          />
        </>
      )}

      {children}
    </Head>
  )
}
