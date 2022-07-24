import clsx from 'clsx'

import { ENV_CONFIG } from 'common/envs/constants'

import { Contract, contractPath, contractUrl } from 'web/lib/firebase/contracts'
import { CopyLinkButton } from './copy-link-button'
import { Col } from './layout/col'
import { Row } from './layout/row'

export function ShareMarket(props: { contract: Contract; className?: string }) {
  const { contract, className } = props

  const url = `https://${ENV_CONFIG.domain}${contractPath(contract)}`

  return (
    <Col className={clsx(className, 'gap-3')}>
      <div>Share your market</div>
      <Row className="mb-6 items-center">
        <CopyLinkButton
          url={url}
          displayUrl={contractUrl(contract)}
          buttonClassName="btn-md rounded-l-none"
          toastClassName={'-left-28 mt-1'}
        />
      </Row>
    </Col>
  )
}
