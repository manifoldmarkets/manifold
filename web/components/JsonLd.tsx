import Head from 'next/head'
import { sanitizeJsonLd } from 'web/lib/json-ld'

export function JsonLd(props: { data: object | null; id: string }) {
  const { data, id } = props
  if (!data) return null

  // Defensive try/catch — if JSON.stringify fails, skip
  // the script tag rather than crashing SSR.
  let html: string
  try {
    html = sanitizeJsonLd(data)
  } catch {
    return null
  }

  return (
    <Head>
      <script
        key={`jsonld-${id}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Head>
  )
}
// WARNING: Never construct JSON-LD via template literals with user content.
// Always use JSON.stringify + sanitizeJsonLd to prevent XSS.
