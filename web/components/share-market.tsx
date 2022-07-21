import clsx from 'clsx'
import { Contract, contractPath, contractUrl } from 'web/lib/firebase/contracts'
import { CopyLinkButton } from './copy-link-button'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { copyToClipboard } from 'web/lib/util/copy'
import { ENV_CONFIG } from 'common/lib/envs/constants'
import { track } from 'web/lib/service/analytics'

export function ShareMarket(props: { contract: Contract; className?: string }) {
  const { contract, className } = props

  return (
    <Col className={clsx(className, 'gap-3')}>
      <div>Share your market</div>
      <Row className="mb-6 items-center">
        <input
          className="input input-bordered flex-1 rounded-r-none text-gray-500"
          readOnly
          type="text"
          value={contractUrl(contract)}
        />
        <CopyLinkButton
          link={`https://${ENV_CONFIG.domain}${contractPath(contract)}`}
          onCopy={() => track('copy share link')}
          buttonClassName="btn-md rounded-l-none"
          toastClassName={'-left-28 mt-1'}
        />
      </Row>
    </Col>
  )
}
