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
        for each new user that places a trade.
      </div>

      <CopyLinkButton
        url={getShareUrl(contract, contract.creatorUsername)}
        tracking="copy share link"
      />
    </Col>
  )
}
