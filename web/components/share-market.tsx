import clsx from 'clsx'
import { Contract, contractUrl } from 'web/lib/firebase/contracts'
import { CopyLinkButton } from './copy-link-button'
import { Col } from './layout/col'
import { Row } from './layout/row'

export function ShareMarket(props: { contract: Contract; className?: string }) {
  const { contract, className } = props

  return (
    <Col className={clsx(className, 'gap-3')}>
      <div>Share your market</div>
      <Row className="mb-6 items-center">
        <input
          className="input input-bordered flex-1 rounded-r-none text-gray-500 dark:bg-black dark:border-gray-700"
          readOnly
          type="text"
          value={contractUrl(contract)}
        />
        <CopyLinkButton
          contract={contract}
          buttonClassName="btn-md rounded-l-none"
          toastClassName={'-left-28 mt-1'}
        />
      </Row>
    </Col>
  )
}
