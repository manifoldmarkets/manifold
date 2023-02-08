import { ReactNode } from 'react'
import Head from 'next/head'
import { buildCardUrl, OgCardProps } from 'common/contract-details'
import { filterDefined } from 'common/lib/util/array'

export function buildBasicOgUrl(
  props: Record<string, string | undefined>,
  endpoint: string
) {
  const generateUrlParams = (params: Record<string, string | undefined>) =>
    filterDefined(
      Object.entries(params).map(([key, value]) =>
        value ? `${key}=${encodeURIComponent(value)}` : null
      )
    ).join('&')

  // Change to localhost:3000 for local testing
  const url =
    `http://localhost:3000/api/og/${endpoint}?` +
    // `https://${DOMAIN}/api/og/${endpoint}?` +
    generateUrlParams(props)

  return url
}

export function SEO(props: {
  title: string
  description: string
  url?: string
  children?: ReactNode
  ogCardProps?: OgCardProps
  basicOgProps?: {
    props: Record<string, string | undefined>
    endpoint: string
  }
  image?: string
}) {
  const {
    title,
    description,
    url,
    children,
    image,
    ogCardProps,
    basicOgProps,
  } = props

  const imageUrl = image
    ? image
    : ogCardProps
    ? buildCardUrl(ogCardProps)
    : basicOgProps
    ? buildBasicOgUrl(basicOgProps.props, basicOgProps.endpoint)
    : undefined
  console.log('imageUrl', imageUrl)

  const absUrl = 'https://manifold.markets' + url

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

      {url && <meta property="og:url" content={absUrl} key="url" />}

      {url && (
        <meta
          name="apple-itunes-app"
          content={'app-id=6444136749, app-argument=' + absUrl}
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
