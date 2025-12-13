import { removeUndefinedProps } from 'common/util/object'
import { buildOgUrl } from 'common/util/og'
import Head from 'next/head'

export function SEO<
  P extends Record<string, string | string[] | undefined>
>(props: {
  title: string
  description: string
  url?: string
  ogProps?: { props: P; endpoint: string }
  image?: string
  shouldIgnore?: boolean
}) {
  const { title, description, url, image, ogProps, shouldIgnore } = props

  const imageUrl =
    image ??
    (ogProps &&
      buildOgUrl(removeUndefinedProps(ogProps.props) as any, ogProps.endpoint)).replace('.webp', '.png')

  const absUrl = 'https://manifold.markets' + url

  return (
    <Head>
      <title>{`${title} | Manifold`}</title>

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
      {shouldIgnore && <meta name="robots" content="noindex, nofollow" />}

      {url && <link rel="canonical" href={absUrl} />}

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
    </Head>
  )
}
