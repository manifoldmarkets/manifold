'use client'
import { useUser } from 'web/hooks/use-user'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { QRCode } from 'web/components/widgets/qr-code'
import { Col } from 'web/components/layout/col'

export const ReferralCopy = (props: { className?: string }) => {
  const { className } = props
  const user = useUser()
  const url = `https://politifold.com/?referrer=${user?.username}`
  return (
    <Col className={className}>
      <QRCode url={url} className="mt-4 self-center" />
      <CopyLinkRow url={url} eventTrackingName="copy politics referral" />
    </Col>
  )
}
