import { JsonLd } from './JsonLd'

export function LogoSEO() {
  const orgData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Manifold Markets',
    url: 'https://manifold.markets',
    logo: 'https://manifold.markets/logo.svg',
    description: 'Create your own prediction market. Unfold the future.',
    sameAs: ['https://twitter.com/ManifoldMarkets'],
  }

  return <JsonLd data={orgData} id="organization" />
}
