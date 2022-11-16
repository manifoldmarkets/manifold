import { ENV_CONFIG } from 'common/envs/constants'
import { InfoBox } from './widgets/info-box'

export const PlayMoneyDisclaimer = () => (
  <InfoBox
    title="Play-money trading"
    className="mt-4"
    text={`Mana (${ENV_CONFIG.moneyMoniker}) is the play-money used by our platform to keep track of your trades. It's completely free for you and your friends to get started!`}
  />
)
