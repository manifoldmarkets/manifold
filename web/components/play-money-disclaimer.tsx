import { ENV_CONFIG } from 'common/envs/constants'
import { InfoBox } from './info-box'

export const PlayMoneyDisclaimer = () => (
  <InfoBox
    title="Play-money betting"
    className="mt-4 max-w-md"
    text={`Mana (${ENV_CONFIG.moneyMoniker}) is the play-money used by our platform to keep track of your bets. It's completely free for you and your friends to get started!`}
  />
)
