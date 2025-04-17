import { TokenNumber } from './widgets/token-number'
import { PHONE_VERIFICATION_BONUS } from 'common/src/economy'

export const PlayMoneyDisclaimer = () => {
  return (
    <span className="text-ink-500 my-1.5 text-sm">
      Get{' '}
      <TokenNumber
        className="font-semibold"
        amount={PHONE_VERIFICATION_BONUS}
        coinType="mana"
        isInline
      />{' '}
      to start trading!
    </span>
  )
}
