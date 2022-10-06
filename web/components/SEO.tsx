import { ReactNode } from 'react'
import Head from 'next/head'
import { Challenge } from 'common/challenge'
import { buildCardUrl, OgCardProps } from 'common/contract-details'

export function SEO(props: {
  title: string
  description: string
  url?: string
  children?: ReactNode
  ogCardProps?: OgCardProps
  challenge?: Challenge
}) {
  const { title, description, url, children, ogCardProps, challenge } = props

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

      {ogCardProps && (
        <>
          <meta
            property="og:image"
            content={buildCardUrl(ogCardProps, challenge)}
            key="image1"
          />
          <meta name="twitter:card" content="summary_large_image" key="card" />
          <meta
            name="twitter:image"
            content={buildCardUrl(ogCardProps, challenge)}
            key="image2"
          />
        </>
      )}

      {children}
    </Head>
  )
}
