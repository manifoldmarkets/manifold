import { ReactNode } from 'react'
import Head from 'next/head'
import { Challenge } from 'common/challenge'

export type OgCardProps = {
  question: string
  probability?: string
  metadata: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string
}

function buildCardUrl(props: OgCardProps, challenge?: Challenge) {
  const {
    creatorAmount,
    acceptances,
    creatorOutcomeProb,
    creatorOutcome,
    acceptorOutcome,
  } = challenge || {}
  const { userName, userAvatarUrl } = acceptances?.[0] ?? {}
  const challengeAmount =
    creatorOutcomeProb &&
    creatorAmount &&
    Math.round(((1 - creatorOutcomeProb) / creatorOutcomeProb) * creatorAmount)
  const probabilityParam =
    props.probability === undefined
      ? ''
      : `&probability=${encodeURIComponent(props.probability ?? '')}`
  const creatorAvatarUrlParam =
    props.creatorAvatarUrl === undefined
      ? ''
      : `&creatorAvatarUrl=${encodeURIComponent(props.creatorAvatarUrl ?? '')}`

  const challengeUrlParams = challenge
    ? `&creatorAmount=${creatorAmount}&creatorOutcome=${creatorOutcome}` +
      `&challengerAmount=${challengeAmount}&challengerOutcome=${acceptorOutcome}` +
      `&acceptedName=${userName ?? ''}&acceptedAvatarUrl=${userAvatarUrl ?? ''}`
    : ''

  // URL encode each of the props, then add them as query params
  return (
    `https://manifold-og-image.vercel.app/m.png` +
    `?question=${encodeURIComponent(props.question)}` +
    probabilityParam +
    `&metadata=${encodeURIComponent(props.metadata)}` +
    `&creatorName=${encodeURIComponent(props.creatorName)}` +
    creatorAvatarUrlParam +
    `&creatorUsername=${encodeURIComponent(props.creatorUsername)}` +
    challengeUrlParams
  )
}

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
