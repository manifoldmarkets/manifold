import { TokenNumber } from './widgets/token-number'
import { STARTING_BALANCE } from 'common/economy'

export const PlayMoneyDisclaimer = () => {
  return (
    <span className="text-ink-500 my-1.5 text-sm">
      Get{' '}
      <TokenNumber
        className="font-semibold"
        amount={STARTING_BALANCE}
        coinType="mana"
        isInline
      />{' '}
      to start trading!
    </span>
  )
}
