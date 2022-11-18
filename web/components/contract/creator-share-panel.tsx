import { Contract } from 'common/contract'
import { REFERRAL_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { Col } from '../layout/col'

export function CreatorSharePanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <Col className="mb-8 p-4">
      <div className="mb-2 text-base text-gray-500">
        Share your market! Earn a {formatMoney(REFERRAL_AMOUNT)} referral bonus
        if a new user signs up and places a trade using the link.
      </div>

      <CopyLinkButton
        url={getShareUrl(contract, contract.creatorUsername)}
        tracking="copy share link"
        buttonClassName="rounded-l-none"
        toastClassName={'-left-28 mt-1'}
      />
    </Col>
  )
}
