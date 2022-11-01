import { Cert } from 'common/cert'
import Link from 'next/link'
import { getCertFromSlug } from 'web/lib/firebase/certs'

export default async function Page(props: { params: { slug: string } }) {
  const { params } = props
  const { slug } = params
  const cert = await getCertFromSlug(slug)

  if (!cert) {
    return <div>404: Cert not found</div>
  }

  return (
    <>
      <CertCard cert={cert} />
    </>
  )
}

export function CertCard(props: { cert: Cert }) {
  const { cert } = props
  return (
    <div className="overflow-hidden bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900 hover:text-indigo-500 hover:underline">
          <Link href={`/certs/${cert.slug}`}>{cert.title}</Link>
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          {cert.description as string}
        </p>
      </div>
    </div>
  )
}
