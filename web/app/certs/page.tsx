import { Col } from 'web/components/layout/col'
import { listAllCerts } from 'web/lib/firebase/certs'
import { CertCard } from './[slug]/page'

export default async function AppPage() {
  const certs = await listAllCerts()

  return (
    <>
      <Col className="gap-2">
        <div className="text-2xl font-bold">Certs</div>
        {certs.map((cert) => (
          <CertCard key={cert.id} cert={cert} />
        ))}
      </Col>
    </>
  )
}
