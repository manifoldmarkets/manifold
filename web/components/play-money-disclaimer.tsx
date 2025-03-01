import { TokenNumber } from './widgets/token-number'
import { Row } from './layout/row'
import { PHONE_VERIFICATION_BONUS } from 'common/src/economy'

export const PlayMoneyDisclaimer = ({ isLong }: { isLong?: boolean }) => {
  return (
    <Row className="text-ink-500 my-1.5 justify-center text-sm">
      Get
      <TokenNumber
        amount={PHONE_VERIFICATION_BONUS}
        coinType="mana"
        className="mx-1"
      />
      {isLong && ' to start trading!'}
    </Row>
  )
}
