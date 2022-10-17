import { ReactNode } from 'react'
import Head from 'next/head'
import { buildCardUrl, OgCardProps } from 'common/contract-details'

export function SEO(props: {
  title: string
  description: string
  url?: string
  children?: ReactNode
  ogCardProps?: OgCardProps
  image?: string
}) {
  const { title, description, url, children, image, ogCardProps } = props

  const imageUrl = image
    ? image
    : ogCardProps
    ? buildCardUrl(ogCardProps)
    : undefined

  return (
    <Head>
      <title>{`${title} | Manifold Markets`}</title>

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

      {imageUrl && (
        <>
          <meta property="og:image" content={imageUrl} key="image1" />
          <meta name="twitter:card" content="summary_large_image" key="card" />
          <meta name="twitter:image" content={imageUrl} key="image2" />
        </>
      )}

      {children}
    </Head>
  )
}
