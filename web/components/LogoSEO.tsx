import Head from 'next/head'

export function LogoSEO() {
  return (
    <Head>
      <script type="application/ld+json">
        {`{
      "@context": "https://schema.org",
      "@type": "Corporation",
      "url": "https://manifold.markets",
      "logo": "https://manifold.markets/logo.svg",
      "description": "Create your own prediction market. Unfold the future."
    }`}
      </script>
    </Head>
  )
}
