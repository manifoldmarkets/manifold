import Head from 'next/head'

export function SEO(props: {
  title: string
  description: string
  url?: string
  children?: any[]
}) {
  const { title, description, url, children } = props

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

      {children}
    </Head>
  )
}
